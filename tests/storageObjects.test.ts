import assert from 'node:assert/strict';
import {
  buildStorageObjectKey,
  detectAssetImageMimeType,
  isUserStorageKey,
  matchesImageSignature,
  MAX_ASSET_IMAGE_BYTES,
  normalizeUploadRequest,
  StorageValidationError,
} from '../src/lib/storageObjects';

const request = normalizeUploadRequest({
  fileName: '../商品 主图.png',
  mimeType: 'image/png',
  byteSize: 1024,
  width: 1000,
  height: 1000,
});
assert.equal(request.fileName, '..-商品 主图.png');
assert.equal(request.mimeType, 'image/png');

assert.throws(
  () => normalizeUploadRequest({ fileName: 'x.svg', mimeType: 'image/svg+xml', byteSize: 10 }),
  StorageValidationError,
);
assert.throws(
  () => normalizeUploadRequest({ fileName: 'x.png', mimeType: 'image/png', byteSize: MAX_ASSET_IMAGE_BYTES + 1 }),
  StorageValidationError,
);

const key = buildStorageObjectKey('user-1', 'object-1', 'image/webp');
assert.equal(key, 'users/user-1/assets/object-1.webp');
assert.equal(isUserStorageKey('user-1', key), true);
assert.equal(isUserStorageKey('user-2', key), false);
assert.equal(isUserStorageKey('user-1', 'users/user-1/assets/../secret'), false);

assert.equal(matchesImageSignature('image/jpeg', Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), true);
assert.equal(matchesImageSignature('image/png', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
assert.equal(matchesImageSignature('image/webp', Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
])), true);
assert.equal(matchesImageSignature('image/png', Uint8Array.from([0x3c, 0x68, 0x74, 0x6d, 0x6c])), false);
assert.equal(detectAssetImageMimeType(Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10,
])), 'image/jpeg');
assert.equal(detectAssetImageMimeType(Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])), 'image/png');
assert.equal(detectAssetImageMimeType(Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
])), 'image/webp');
assert.equal(detectAssetImageMimeType(Uint8Array.from([0x3c, 0x68, 0x74, 0x6d, 0x6c])), null);

console.log('storage object validation tests passed');
