export const IMAGE_UPLOAD_LIMITS = {
  maxFiles: 8,
  maxFileBytes: 8 * 1024 * 1024,
  maxOriginalBytes: 40 * 1024 * 1024,
  maxAnalysisBytes: 12 * 1024 * 1024,
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
  dataUrl: string;
  data: string;
  mimeType: string;
  width: number;
  height: number;
  analysisBytes: number;
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

async function makeAnalysisCopy(file: File, dataUrl: string): Promise<Omit<ProcessedImage, 'file'>> {
  const image = await loadImage(dataUrl, file.name);
  const scale = Math.min(1, IMAGE_UPLOAD_LIMITS.maxLongEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  if (scale === 1 && dataUrlBytes(dataUrl) <= IMAGE_UPLOAD_LIMITS.maxAnalysisBytes) {
    return { dataUrl, data: dataUrl.split(',')[1], mimeType: file.type, width, height, analysisBytes: dataUrlBytes(dataUrl) };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(`无法处理“${file.name}”`);
  context.drawImage(image, 0, 0, width, height);
  const mimeType = file.type === 'image/png' && file.size < 2 * 1024 * 1024 ? 'image/png' : 'image/jpeg';
  const compressed = canvas.toDataURL(mimeType, mimeType === 'image/jpeg' ? 0.82 : undefined);
  return { dataUrl: compressed, data: compressed.split(',')[1], mimeType, width, height, analysisBytes: dataUrlBytes(compressed) };
}

export async function processImageFiles(files: Iterable<File>, existingCount = 0, existingAnalysisBytes = 0): Promise<ProcessedImage[]> {
  const list = Array.from(files);
  if (!list.length) return [];
  if (existingCount + list.length > IMAGE_UPLOAD_LIMITS.maxFiles) throw new Error(`图片最多 ${IMAGE_UPLOAD_LIMITS.maxFiles} 张`);
  const invalidType = list.find(file => !file.type.startsWith('image/'));
  if (invalidType) throw new Error(`“${invalidType.name}”不是图片文件`);
  const oversized = list.find(file => file.size > IMAGE_UPLOAD_LIMITS.maxFileBytes);
  if (oversized) throw new Error(`“${oversized.name}”超过单张 8MB 限制`);
  const originalBytes = list.reduce((sum, file) => sum + file.size, 0);
  if (originalBytes > IMAGE_UPLOAD_LIMITS.maxOriginalBytes) throw new Error('本次图片原始总量超过 40MB');

  const results: ProcessedImage[] = [];
  let analysisBytes = existingAnalysisBytes;
  for (const file of list) {
    const original = await readFile(file, 'dataUrl') as string;
    const copy = await makeAnalysisCopy(file, original);
    analysisBytes += copy.analysisBytes;
    if (analysisBytes > IMAGE_UPLOAD_LIMITS.maxAnalysisBytes) throw new Error('模型分析副本总量超过 12MB，请减少图片或降低图片尺寸');
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
  x: origin.x + (index % 3) * 350,
  y: origin.y + Math.floor(index / 3) * 450,
});
