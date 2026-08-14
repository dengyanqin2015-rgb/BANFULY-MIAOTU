export const AI_REFERENCE_LIMITS = {
  maxFiles: 8,
  maxFileBytes: 8 * 1024 * 1024,
  maxOriginalBytes: 40 * 1024 * 1024,
  maxAnalysisBytes: 12 * 1024 * 1024,
  maxLongEdge: 2560,
} as const;

// Backwards-compatible name for existing callers. This limit applies only to
// images that will actually be sent to an AI model, not canvas assets.
export const IMAGE_UPLOAD_LIMITS = AI_REFERENCE_LIMITS;

export const CANVAS_IMAGE_UPLOAD_LIMITS = {
  maxFileBytes: 8 * 1024 * 1024,
  maxLongEdge: 2560,
} as const;

export const DOCUMENT_UPLOAD_LIMITS = {
  maxFiles: 5,
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 25 * 1024 * 1024,
  maxExcelRows: 20_000,
  maxExcelCells: 200_000,
} as const;

export interface ProcessedImage {
  file: File;
  originalDataUrl: string;
  originalData: string;
  originalMimeType: string;
  originalBytes: number;
  analysisDataUrl: string;
  analysisData: string;
  analysisMimeType: string;
  width: number;
  height: number;
  analysisBytes: number;
}

export interface ExistingImageUsage {
  count?: number;
  originalBytes?: number;
  analysisBytes?: number;
}

export function assertImageUsage(existing: ExistingImageUsage, additions: Required<ExistingImageUsage>): void {
  if ((existing.count || 0) + additions.count > AI_REFERENCE_LIMITS.maxFiles) throw new Error(`AI 参考图最多 ${AI_REFERENCE_LIMITS.maxFiles} 张`);
  if ((existing.originalBytes || 0) + additions.originalBytes > IMAGE_UPLOAD_LIMITS.maxOriginalBytes) throw new Error('图片原始总量超过 40MB');
  if ((existing.analysisBytes || 0) + additions.analysisBytes > IMAGE_UPLOAD_LIMITS.maxAnalysisBytes) throw new Error('模型分析副本总量超过 12MB，请减少图片或降低图片尺寸');
}

export function reserveImageUsage(existing: Required<ExistingImageUsage>, additions: Required<ExistingImageUsage>): Required<ExistingImageUsage> {
  assertImageUsage(existing, additions);
  return {
    count: existing.count + additions.count,
    originalBytes: existing.originalBytes + additions.originalBytes,
    analysisBytes: existing.analysisBytes + additions.analysisBytes,
  };
}

const readFile = (file: File, mode: 'dataUrl' | 'arrayBuffer'): Promise<string | ArrayBuffer> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error(`读取“${file.name}”失败`));
  reader.onabort = () => reject(new Error(`读取“${file.name}”已中止`));
  reader.onload = () => resolve(reader.result as string | ArrayBuffer);
  if (mode === 'dataUrl') reader.readAsDataURL(file);
  else reader.readAsArrayBuffer(file);
});

const loadImage = (dataUrl: string, name: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`“${name}”不是可读取的图片`));
  image.src = dataUrl;
});

const dataUrlBytes = (value: string) => {
  const payload = value.split(',')[1] || '';
  return Math.ceil(payload.length * 3 / 4);
};

async function makeAnalysisCopy(
  file: File,
  originalDataUrl: string,
  maxLongEdge: number = AI_REFERENCE_LIMITS.maxLongEdge,
): Promise<Omit<ProcessedImage, 'file'>> {
  const image = await loadImage(originalDataUrl, file.name);
  const scale = Math.min(1, maxLongEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const originalData = originalDataUrl.split(',')[1];
  if (scale === 1 && dataUrlBytes(originalDataUrl) <= IMAGE_UPLOAD_LIMITS.maxAnalysisBytes) {
    return {
      originalDataUrl, originalData, originalMimeType: file.type, originalBytes: file.size,
      analysisDataUrl: originalDataUrl, analysisData: originalData, analysisMimeType: file.type,
      width, height, analysisBytes: dataUrlBytes(originalDataUrl),
    };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(`无法处理“${file.name}”`);
  context.drawImage(image, 0, 0, width, height);
  const mimeType = file.type === 'image/png' && file.size < 2 * 1024 * 1024 ? 'image/png' : 'image/jpeg';
  const compressed = canvas.toDataURL(mimeType, mimeType === 'image/jpeg' ? 0.82 : undefined);
  return {
    originalDataUrl, originalData, originalMimeType: file.type, originalBytes: file.size,
    analysisDataUrl: compressed, analysisData: compressed.split(',')[1], analysisMimeType: mimeType,
    width, height, analysisBytes: dataUrlBytes(compressed),
  };
}

export async function processImageFiles(files: Iterable<File>, existing: ExistingImageUsage = {}): Promise<ProcessedImage[]> {
  const list = Array.from(files);
  if (!list.length) return [];
  assertImageUsage(existing, { count: list.length, originalBytes: 0, analysisBytes: 0 });
  const invalidType = list.find(file => !file.type.startsWith('image/'));
  if (invalidType) throw new Error(`“${invalidType.name}”不是图片文件`);
  const oversized = list.find(file => file.size > IMAGE_UPLOAD_LIMITS.maxFileBytes);
  if (oversized) throw new Error(`“${oversized.name}”超过单张 8MB 限制`);
  const originalBytes = list.reduce((sum, file) => sum + file.size, 0);
  assertImageUsage(existing, { count: 0, originalBytes, analysisBytes: 0 });

  const results: ProcessedImage[] = [];
  let analysisBytes = existing.analysisBytes || 0;
  for (const file of list) {
    const original = await readFile(file, 'dataUrl') as string;
    const copy = await makeAnalysisCopy(file, original);
    analysisBytes += copy.analysisBytes;
    if (analysisBytes > IMAGE_UPLOAD_LIMITS.maxAnalysisBytes) throw new Error('模型分析副本总量超过 12MB，请减少图片或降低图片尺寸');
    results.push({ file, ...copy });
  }
  return results;
}

/**
 * Processes images that only become canvas assets. The eight-image ceiling is
 * an AI request constraint, so canvas imports intentionally have no cumulative
 * count or total-byte cap. Per-file validation remains to prevent one file from
 * freezing the browser during decoding.
 */
export async function processCanvasImageFiles(files: Iterable<File>): Promise<ProcessedImage[]> {
  const list = Array.from(files);
  if (!list.length) return [];
  const invalidType = list.find(file => !file.type.startsWith('image/'));
  if (invalidType) throw new Error(`“${invalidType.name}”不是图片文件`);
  const oversized = list.find(file => file.size > CANVAS_IMAGE_UPLOAD_LIMITS.maxFileBytes);
  if (oversized) throw new Error(`“${oversized.name}”超过单张 8MB 限制`);

  const results: ProcessedImage[] = [];
  for (const file of list) {
    const original = await readFile(file, 'dataUrl') as string;
    const copy = await makeAnalysisCopy(file, original, CANVAS_IMAGE_UPLOAD_LIMITS.maxLongEdge);
    results.push({ file, ...copy });
  }
  return results;
}

export function validateDocumentFiles(files: Iterable<File>, existingCount = 0, existingBytes = 0): File[] {
  const list = Array.from(files);
  if (existingCount + list.length > DOCUMENT_UPLOAD_LIMITS.maxFiles) throw new Error(`文档最多 ${DOCUMENT_UPLOAD_LIMITS.maxFiles} 个`);
  const oversized = list.find(file => file.size > DOCUMENT_UPLOAD_LIMITS.maxFileBytes);
  if (oversized) throw new Error(`“${oversized.name}”超过单文件 10MB 限制`);
  if (existingBytes + list.reduce((sum, file) => sum + file.size, 0) > DOCUMENT_UPLOAD_LIMITS.maxTotalBytes) throw new Error('文档总量超过 25MB');
  return list;
}

export const readFileAsDataUrl = (file: File) => readFile(file, 'dataUrl') as Promise<string>;
export const readFileAsArrayBuffer = (file: File) => readFile(file, 'arrayBuffer') as Promise<ArrayBuffer>;

export const getBatchImportPosition = (origin: { x: number; y: number }, index: number) => ({
  x: origin.x + (index % 8) * 400,
  y: origin.y + Math.floor(index / 8) * 450,
});

export function resolvePasteBatchOrigin(
  center: { x: number; y: number },
  canvasAnchor: { x: number; y: number } | null,
) {
  return canvasAnchor || center;
}
