export const STORAGE_OBJECT_STATUSES = ['pending', 'ready', 'attached', 'deleted'] as const;
export type StorageObjectStatus = (typeof STORAGE_OBJECT_STATUSES)[number];

export const ASSET_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AssetImageMimeType = (typeof ASSET_IMAGE_MIME_TYPES)[number];

export const MAX_ASSET_IMAGE_BYTES = 15 * 1024 * 1024;
export const PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

export interface StorageObjectRecord {
  id: string;
  userId: string;
  objectKey: string;
  mimeType: AssetImageMimeType;
  byteSize: number;
  originalName: string;
  status: StorageObjectStatus;
  width?: number;
  height?: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface UploadRequest {
  fileName: string;
  mimeType: AssetImageMimeType;
  byteSize: number;
  width?: number;
  height?: number;
}

export class StorageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageValidationError';
  }
}

const cleanFileName = (value: unknown): string => {
  const normalized = String(value ?? '').trim().replace(/[\\/\u0000-\u001f]/g, '-').slice(0, 180);
  return normalized || 'asset-image';
};

const optionalDimension = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20_000) {
    throw new StorageValidationError('图片尺寸无效');
  }
  return parsed;
};

export const normalizeUploadRequest = (value: unknown): UploadRequest => {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const mimeType = String(source.mimeType ?? '').toLowerCase();
  if (!ASSET_IMAGE_MIME_TYPES.includes(mimeType as AssetImageMimeType)) {
    throw new StorageValidationError('仅支持 JPG、PNG 和 WebP 图片');
  }
  const byteSize = Number(source.byteSize);
  if (!Number.isInteger(byteSize) || byteSize < 1 || byteSize > MAX_ASSET_IMAGE_BYTES) {
    throw new StorageValidationError('单张图片必须小于 15MB');
  }
  return {
    fileName: cleanFileName(source.fileName),
    mimeType: mimeType as AssetImageMimeType,
    byteSize,
    width: optionalDimension(source.width),
    height: optionalDimension(source.height),
  };
};

const MIME_EXTENSIONS: Record<AssetImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const buildStorageObjectKey = (userId: string, objectId: string, mimeType: AssetImageMimeType): string => {
  const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  const safeObjectId = String(objectId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  if (!safeUserId || !safeObjectId) throw new StorageValidationError('对象路径无效');
  return `users/${safeUserId}/assets/${safeObjectId}.${MIME_EXTENSIONS[mimeType]}`;
};

export const isUserStorageKey = (userId: string, objectKey: string): boolean => {
  const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  return Boolean(safeUserId) && objectKey.startsWith(`users/${safeUserId}/assets/`) && !objectKey.includes('..');
};

export const matchesImageSignature = (mimeType: AssetImageMimeType, bytes: Uint8Array): boolean => {
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
};
