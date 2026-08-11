import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { matchesImageSignature, type AssetImageMimeType } from './storageObjects';

interface BucketConfig {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const env = (primary: string, fallback: string): string =>
  String(process.env[primary] || process.env[fallback] || '').trim();

const readBucketConfig = (): BucketConfig | null => {
  const config: BucketConfig = {
    bucket: env('ASSET_BUCKET_NAME', 'BUCKET'),
    endpoint: env('ASSET_BUCKET_ENDPOINT', 'ENDPOINT'),
    region: env('ASSET_BUCKET_REGION', 'REGION') || 'auto',
    accessKeyId: env('ASSET_BUCKET_ACCESS_KEY_ID', 'ACCESS_KEY_ID'),
    secretAccessKey: env('ASSET_BUCKET_SECRET_ACCESS_KEY', 'SECRET_ACCESS_KEY'),
  };
  return Object.values(config).every(Boolean) ? config : null;
};

let cachedConfig: BucketConfig | null | undefined;
let cachedClient: S3Client | null = null;

const getBucket = (): { config: BucketConfig; client: S3Client } => {
  cachedConfig ??= readBucketConfig();
  if (!cachedConfig) throw new Error('对象存储尚未配置');
  cachedClient ??= new S3Client({
    region: cachedConfig.region,
    endpoint: cachedConfig.endpoint,
    forcePathStyle: process.env.ASSET_BUCKET_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: cachedConfig.accessKeyId,
      secretAccessKey: cachedConfig.secretAccessKey,
    },
  });
  return { config: cachedConfig, client: cachedClient };
};

export const getBucketStatus = () => {
  const config = readBucketConfig();
  return { configured: Boolean(config), provider: config ? 'railway-s3' : 'none' };
};

export const createUploadUrl = async (objectKey: string, mimeType: AssetImageMimeType, byteSize: number) => {
  const { config, client } = getBucket();
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    ContentType: mimeType,
    ContentLength: byteSize,
  });
  return getSignedUrl(client, command, { expiresIn: 10 * 60 });
};

export const inspectStoredObject = async (objectKey: string, expectedMimeType: AssetImageMimeType) => {
  const { config, client } = getBucket();
  const result = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }));
  const prefix = await client.send(new GetObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    Range: 'bytes=0-31',
  }));
  const bytes = prefix.Body ? await prefix.Body.transformToByteArray() : new Uint8Array();
  return {
    byteSize: Number(result.ContentLength || 0),
    mimeType: String(result.ContentType || '').toLowerCase(),
    signatureMatches: matchesImageSignature(expectedMimeType, bytes),
  };
};

export const createReadUrl = async (objectKey: string, expiresIn = 60 * 60) => {
  const { config, client } = getBucket();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }), { expiresIn });
};

export const deleteStoredObject = async (objectKey: string) => {
  const { config, client } = getBucket();
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }));
};

export const configureBucketCors = async (origins: string[]) => {
  const allowedOrigins = [...new Set(origins.map(origin => origin.trim()).filter(Boolean))];
  if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
    throw new Error('Bucket CORS requires at least one explicit origin and does not accept wildcards');
  }
  const { config, client } = getBucket();
  await client.send(new PutBucketCorsCommand({
    Bucket: config.bucket,
    CORSConfiguration: {
      CORSRules: [{
        AllowedHeaders: ['*'],
        AllowedMethods: ['GET', 'HEAD', 'PUT'],
        AllowedOrigins: allowedOrigins,
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3600,
      }],
    },
  }));
};

export const resetBucketClientForTests = () => {
  cachedClient?.destroy();
  cachedClient = null;
  cachedConfig = undefined;
};
