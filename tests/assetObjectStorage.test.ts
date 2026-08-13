import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  deleteAssetStoredObject,
  getAssetReadTarget,
  getAssetStorageStatus,
  initializeAssetObjectStorage,
  inspectAssetStoredObject,
  resetAssetObjectStorageForTests,
  writeVolumeObject,
} from '../src/lib/assetObjectStorage';

const root = await mkdtemp(path.join(tmpdir(), 'banfuly-volume-storage-'));
const previousPath = process.env.ASSET_VOLUME_PATH;
const objectKey = 'users/test-user/assets/storage-object-test.png';
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

try {
  process.env.ASSET_VOLUME_PATH = root;
  assert.deepEqual(await initializeAssetObjectStorage(), { configured: true, provider: 'railway-volume' });
  await writeVolumeObject(objectKey, pngBytes, 'image/png', pngBytes.length);
  assert.deepEqual(await inspectAssetStoredObject(objectKey, 'image/png'), {
    byteSize: pngBytes.length,
    mimeType: 'image/png',
    signatureMatches: true,
  });
  const readTarget = await getAssetReadTarget(objectKey);
  assert.equal(readTarget.kind, 'file');

  resetAssetObjectStorageForTests();
  assert.deepEqual(getAssetStorageStatus(), { configured: false, provider: 'none' });
  assert.deepEqual(await initializeAssetObjectStorage(), { configured: true, provider: 'railway-volume' });
  assert.equal((await inspectAssetStoredObject(objectKey, 'image/png')).byteSize, pngBytes.length);

  await deleteAssetStoredObject(objectKey);
  await assert.rejects(() => inspectAssetStoredObject(objectKey, 'image/png'), /图片文件不存在/);
  console.log('Railway Volume asset storage tests passed');
} finally {
  resetAssetObjectStorageForTests();
  if (previousPath === undefined) delete process.env.ASSET_VOLUME_PATH;
  else process.env.ASSET_VOLUME_PATH = previousPath;
  await rm(root, { recursive: true, force: true });
}
