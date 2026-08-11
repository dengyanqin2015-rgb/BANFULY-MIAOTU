import { configureBucketCors, getBucketStatus } from '../src/lib/railwayBucket';

const origins = String(process.env.ASSET_BUCKET_CORS_ORIGINS || process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

try {
  if (!getBucketStatus().configured) throw new Error('Object storage is not configured');
  await configureBucketCors(origins);
  console.log(`Bucket CORS configured for ${origins.length} explicit origin(s)`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Bucket CORS configuration failed');
  process.exitCode = 1;
}
