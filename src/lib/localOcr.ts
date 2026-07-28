import { createWorker, OEM, PSM, type Bbox } from 'tesseract.js';
import { PaddleOCR } from '@paddleocr/paddleocr-js';

export interface LocalOcrLine {
  text: string;
  confidence: number;
  bbox: Bbox;
}

let paddleOcrPromise: Promise<Awaited<ReturnType<typeof PaddleOCR.create>>> | null = null;

const getPaddleOcr = () => {
  if (!paddleOcrPromise) {
    paddleOcrPromise = PaddleOCR.create({
      lang: 'ch',
      ocrVersion: 'PP-OCRv5',
      ortOptions: { backend: 'wasm', numThreads: 2, simd: true },
    });
  }
  return paddleOcrPromise;
};

const enhanceForOcr = (source: HTMLCanvasElement) => {
  const canvas = document.createElement('canvas');
  canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return source;
  context.drawImage(source, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const samples: number[] = [];
  for (let index = 0; index < image.data.length; index += 16) samples.push(image.data[index] * .299 + image.data[index + 1] * .587 + image.data[index + 2] * .114);
  samples.sort((a, b) => a - b);
  const low = samples[Math.floor(samples.length * .03)] ?? 0;
  const high = samples[Math.floor(samples.length * .97)] ?? 255;
  const range = Math.max(24, high - low);
  for (let index = 0; index < image.data.length; index += 4) {
    const luminance = image.data[index] * .299 + image.data[index + 1] * .587 + image.data[index + 2] * .114;
    const normalized = Math.max(0, Math.min(255, (luminance - low) * 255 / range));
    const contrasted = Math.max(0, Math.min(255, (normalized - 128) * 1.18 + 128));
    image.data[index] = contrasted; image.data[index + 1] = contrasted; image.data[index + 2] = contrasted;
  }
  context.putImageData(image, 0, 0);
  return canvas;
};

interface PaddleLineResult {
  items?: Array<{
    poly: number[][];
    text: string;
    score: number;
  }>;
}

const mapPaddleLines = (result: PaddleLineResult | null | undefined): LocalOcrLine[] => (result?.items || []).map((item) => {
  const xs = item.poly.map((point: number[]) => point[0]); const ys = item.poly.map((point: number[]) => point[1]);
  return { text: item.text.trim(), confidence: item.score * 100, bbox: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } };
}).filter((line: LocalOcrLine) => line.text.length > 0);

export const recognizeTextLines = async (
  image: HTMLImageElement,
  onProgress?: (progress: number, status: string) => void,
): Promise<LocalOcrLine[]> => {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建 OCR 图片画布');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  try {
    onProgress?.(0.08, '正在调用 PP-OCRv5 Server 中英文高精度模型');
    const response = await fetch('/api/ocr/server', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: canvas.toDataURL('image/jpeg', 0.94) }),
    });
    if (response.ok) {
      const payload = await response.json() as { lines?: LocalOcrLine[] };
      onProgress?.(1, 'PP-OCRv5 Server 识别完成');
      return payload.lines || [];
    }
  } catch (error) {
    console.warn('[OCR] Server model unavailable, using browser fallback:', error);
  }
  try {
    onProgress?.(0.12, '正在加载 PP-OCRv5 中文识别模型');
    const paddle = await getPaddleOcr();
    onProgress?.(0.55, '正在识别图片文字');
    const options = {
      textDetLimitSideLen: Math.min(2560, Math.max(1280, Math.max(canvas.width, canvas.height))),
      textDetBoxThresh: 0.32,
      textDetUnclipRatio: 1.85,
      textRecScoreThresh: 0.18,
    };
    const [result] = await paddle.predict(canvas, options);
    let lines = mapPaddleLines(result);
    const averageConfidence = lines.reduce((sum, line) => sum + line.confidence, 0) / Math.max(1, lines.length);
    if (!lines.length || averageConfidence < 82 || lines.some(line => line.confidence < 60)) {
      onProgress?.(0.78, '低置信度区域正在增强复识');
      const [enhancedResult] = await paddle.predict(enhanceForOcr(canvas), options);
      const enhancedLines = mapPaddleLines(enhancedResult);
      const enhancedConfidence = enhancedLines.reduce((sum, line) => sum + line.confidence, 0) / Math.max(1, enhancedLines.length);
      if (enhancedLines.length > lines.length || enhancedConfidence > averageConfidence + 2) lines = enhancedLines;
    }
    if (lines.length) {
      onProgress?.(1, '识别完成');
      return lines.sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
    }
  } catch (error) {
    console.warn('[OCR] PP-OCRv5 unavailable, falling back to Tesseract:', error);
    paddleOcrPromise = null;
  }

  onProgress?.(0.08, '正在启用兼容识别引擎');
  const worker = await createWorker(['chi_sim', 'eng'], OEM.LSTM_ONLY, {
    langPath: '/ocr-data',
    logger: message => onProgress?.(message.progress, message.status),
  });
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: '1',
    });
    const result = await worker.recognize(canvas, {}, { blocks: true, text: true });
    const lines = (result.data.blocks || []).flatMap(block =>
      block.paragraphs.flatMap(paragraph => paragraph.lines),
    );
    return lines
      .map(line => ({
        text: line.text.replace(/\s+$/g, '').trim(),
        confidence: line.confidence,
        bbox: line.bbox,
      }))
      .filter(line => line.text.length > 0 && line.confidence >= 15)
      .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  } finally {
    await worker.terminate();
  }
};
