import assert from 'node:assert/strict';
import { DEFAULT_IMAGE_MODEL, isLegacyImageModel, normalizeImageModel, selectImageApiKey } from '../src/lib/geminiModels';

assert.equal(DEFAULT_IMAGE_MODEL, 'gemini-3.1-flash-image');
assert.equal(normalizeImageModel('gemini-3.1-flash-image-preview'), 'gemini-3.1-flash-image');
assert.equal(normalizeImageModel('gemini-3-pro-image-preview'), 'gemini-3-pro-image');
assert.equal(normalizeImageModel('gemini-2.5-flash-image'), 'gemini-2.5-flash-image');
assert.equal(normalizeImageModel('unknown-model'), DEFAULT_IMAGE_MODEL);
assert.equal(isLegacyImageModel('gemini-3.1-flash-image-preview'), true);
assert.equal(isLegacyImageModel('gemini-3.1-flash-image'), false);

assert.equal(selectImageApiKey({
  paidApiKey: 'paid-prop',
  storedPaidApiKey: 'paid-storage',
  userApiKey: 'user-prop',
  storedUserApiKey: 'user-storage',
}), 'paid-prop');
assert.equal(selectImageApiKey({
  storedPaidApiKey: 'paid-storage',
  userApiKey: 'user-prop',
  storedUserApiKey: 'user-storage',
}), 'paid-storage');
assert.equal(selectImageApiKey({ userApiKey: 'user-prop', storedUserApiKey: 'user-storage' }), 'user-prop');
assert.equal(selectImageApiKey({ storedUserApiKey: 'user-storage' }), 'user-storage');
assert.equal(selectImageApiKey({}), null);

console.log('gemini model routing tests passed');
