import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createReadUrl,
  createUploadUrl,
  deleteStoredObject,
  getBucketStatus,
  inspectStoredObject,
} from './railwayBucket';
import {
  MAX_ASSET_IMAGE_BYTES,
  StorageValidationError,
  matchesImageSignature,
  type AssetImageMimeType,
} from './storageObjects';

export type AssetStorageProvider = 'railway-volume' | 'railway-s3' | 'none';

export interface AssetStorageStatus {
  configured: boolean;
  provider: AssetStorageProvider;
}

export interface StoredObjectInspection {
  byteSize: number;
  mimeType: string;
  signatureMatches: boolean;
}

export type AssetReadTarget =
  | { kind: 'file'; filePath: string }
  | { kind: 'redirect'; url: string };

let volumeRoot: string | null = null;

const configuredVolumeRoot = () => {
  const configured = String(process.env.ASSET_VOLUME_PATH || '').trim();
  if (configured) return path.resolve(configured);
  const railwayMountPath = String(process.env.RAILWAY_VOLUME_MOUNT_PATH || '').trim();
  return railwayMountPath ? path.resolve(railwayMountPath, 'asset-objects') : null;
};

const resolveVolumeObjectPath = (objectKey: string): string => {
  if (!volumeRoot) throw new Error('Railway Volume 尚未配置');
  if (!objectKey || objectKey.includes('..') || path.isAbsolute(objectKey)) {
    throw new StorageValidationError('对象路径无效');
  }
  const target = path.resolve(volumeRoot, ...objectKey.split('/'));
  const prefix = `${volumeRoot}${path.sep}`;
  if (!target.startsWith(prefix)) throw new StorageValidationError('对象路径无效');
  return target;
};

const volumeFileExists = async (objectKey: string): Promise<boolean> => {
  if (!volumeRoot) return false;
  try {
    const stat = await fs.promises.stat(resolveVolumeObjectPath(objectKey));
    return stat.isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
};

export const initializeAssetObjectStorage = async (): Promise<AssetStorageStatus> => {
  volumeRoot = null;
  const configuredRoot = configuredVolumeRoot();
  if (configuredRoot) {
    await fs.promises.mkdir(configuredRoot, { recursive: true });
    const probePath = path.join(configuredRoot, `.write-probe-${process.pid}-${randomUUID()}`);
    try {
      await fs.promises.writeFile(probePath, 'ok', { flag: 'wx' });
    } finally {
      await fs.promises.rm(probePath, { force: true }).catch(() => undefined);
    }
    volumeRoot = configuredRoot;
  }
  return getAssetStorageStatus();
};

export const getAssetStorageStatus = (): AssetStorageStatus => {
  if (volumeRoot) return { configured: true, provider: 'railway-volume' };
  const bucket = getBucketStatus();
  return bucket.configured
    ? { configured: true, provider: 'railway-s3' }
    : { configured: false, provider: 'none' };
};

export const createAssetUploadTarget = async (
  objectId: string,
  objectKey: string,
  mimeType: AssetImageMimeType,
  byteSize: number,
) => {
  if (volumeRoot) {
    return {
      uploadUrl: `/api/storage/uploads/${encodeURIComponent(objectId)}/content`,
      expiresIn: 10 * 60,
      headers: { 'Content-Type': mimeType },
    };
  }
  if (getBucketStatus().configured) {
    return {
      uploadUrl: await createUploadUrl(objectKey, mimeType, byteSize),
      expiresIn: 10 * 60,
      headers: { 'Content-Type': mimeType },
    };
  }
  throw new Error('图片存储尚未配置');
};

export const writeVolumeObject = async (
  objectKey: string,
  bytes: Buffer,
  expectedMimeType: AssetImageMimeType,
  expectedByteSize: number,
): Promise<void> => {
  if (!volumeRoot) throw new Error('Railway Volume 尚未配置');
  if (!Buffer.isBuffer(bytes)) throw new StorageValidationError('没有收到有效的图片文件');
  if (bytes.length !== expectedByteSize || bytes.length < 1 || bytes.length > MAX_ASSET_IMAGE_BYTES) {
    throw new StorageValidationError('图片大小与上传申请不一致');
  }
  if (!matchesImageSignature(expectedMimeType, bytes.subarray(0, 32))) {
    throw new StorageValidationError('文件内容不是有效的 JPG、PNG 或 WebP 图片');
  }

  const targetPath = resolveVolumeObjectPath(objectKey);
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.upload-${randomUUID()}`;
  try {
    await fs.promises.writeFile(temporaryPath, bytes, { flag: 'wx' });
    await fs.promises.rename(temporaryPath, targetPath);
  } finally {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
};

export const inspectAssetStoredObject = async (
  objectKey: string,
  expectedMimeType: AssetImageMimeType,
): Promise<StoredObjectInspection> => {
  if (volumeRoot) {
    if (!(await volumeFileExists(objectKey))) throw new StorageValidationError('图片文件不存在');
    const filePath = resolveVolumeObjectPath(objectKey);
    const handle = await fs.promises.open(filePath, 'r');
    try {
      const stat = await handle.stat();
      const prefix = Buffer.alloc(Math.min(32, stat.size));
      if (prefix.length) await handle.read(prefix, 0, prefix.length, 0);
      return {
        byteSize: stat.size,
        mimeType: expectedMimeType,
        signatureMatches: matchesImageSignature(expectedMimeType, prefix),
      };
    } finally {
      await handle.close();
    }
  }
  return inspectStoredObject(objectKey, expectedMimeType);
};

export const getAssetReadTarget = async (objectKey: string): Promise<AssetReadTarget> => {
  if (volumeRoot) {
    if (!(await volumeFileExists(objectKey))) throw new StorageValidationError('图片文件不存在');
    return { kind: 'file', filePath: resolveVolumeObjectPath(objectKey) };
  }
  return { kind: 'redirect', url: await createReadUrl(objectKey) };
};

export const deleteAssetStoredObject = async (objectKey: string): Promise<void> => {
  let removedFromVolume = false;
  if (volumeRoot) {
    try {
      await fs.promises.rm(resolveVolumeObjectPath(objectKey));
      removedFromVolume = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  if (!removedFromVolume && getBucketStatus().configured) await deleteStoredObject(objectKey);
};

export const resetAssetObjectStorageForTests = () => {
  volumeRoot = null;
};
