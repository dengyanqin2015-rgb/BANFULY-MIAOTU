import assert from 'node:assert/strict';
import {
  VAELO_MODEL_MAP,
  resolveVaeloApiKey,
  appendVaeloGptEditFields,
  buildVaeloJsonRequest,
  extractVaeloImages,
  normalizeVaeloBaseUrl,
} from '../src/lib/vaeloImageProvider';
import { getGptImageSize, toVaeloImageModel } from '../src/lib/imageProviderRouting';

assert.equal(normalizeVaeloBaseUrl(), 'https://vaelo.8t.chat');
assert.equal(normalizeVaeloBaseUrl('https://vaelo.8t.chat/'), 'https://vaelo.8t.chat');
assert.throws(() => normalizeVaeloBaseUrl('http://vaelo.8t.chat'), /HTTPS/);
assert.throws(() => normalizeVaeloBaseUrl('https://user:pass@vaelo.8t.chat'), /不能包含/);

assert.equal(VAELO_MODEL_MAP['gpt-image-2'], 'gpt-image-2k');
const splitKeys = { VAELO_GPT_IMAGE_API_KEY: ' Bearer fake-gpt ', VAELO_GOOGLE_API_KEY: 'fake-google', VAELO_API_KEY: 'fake-shared' };
assert.equal(resolveVaeloApiKey('gpt-image-2', splitKeys), 'fake-gpt');
for (const model of ['gemini-3.1-flash-image', 'gemini-3-pro-image']) {
  assert.equal(resolveVaeloApiKey(model, splitKeys), 'fake-google');
  assert.equal(resolveVaeloApiKey(model, { VAELO_GPT_IMAGE_API_KEY: 'fake-gpt', VAELO_API_KEY: 'fake-shared' }), '');
}
assert.equal(resolveVaeloApiKey('gpt-image-2', { VAELO_GOOGLE_API_KEY: 'fake-google' }), '');
assert.equal(resolveVaeloApiKey('gpt-image-2', { VAELO_API_KEY: 'fake-shared' }), 'fake-shared');
assert.equal(resolveVaeloApiKey('invalid-model', splitKeys), '');
assert.equal(toVaeloImageModel('nanobanana2'), 'gemini-3.1-flash-image');
assert.equal(toVaeloImageModel('nanobanana pro'), 'gemini-3-pro-image');
assert.equal(toVaeloImageModel('imagen'), null);
assert.equal(getGptImageSize('2K', '16:9'), '2048x1152');

const gpt = buildVaeloJsonRequest({
  model: 'gpt-image-2',
  prompt: '白底商品主图',
  aspectRatio: '1:1',
  imageSize: '2K',
  size: '2048x2048',
});
assert.equal(gpt.endpoint, '/v1/images/generations');
assert.deepEqual(gpt.body, {
  model: 'gpt-image-2k',
  prompt: '白底商品主图',
  size: '2048x2048',
  n: 1,
  response_format: 'b64_json',
});

const gemini = buildVaeloJsonRequest({
  model: 'gemini-3.1-flash-image',
  prompt: '电商场景图',
  aspectRatio: '4:5',
  imageSize: '2K',
  images: [{ data: 'data:image/png;base64,AAAA', mimeType: 'image/png' }],
});
assert.equal(gemini.endpoint, '/v1beta/models/gemini-3.1-flash-image:generateContent');
assert.deepEqual(gemini.body, {
  contents: [{ role: 'user', parts: [{ text: '电商场景图' }, { inlineData: { data: 'AAAA', mimeType: 'image/png' } }] }],
  generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '4:5', imageSize: '2K' } },
});

assert.deepEqual(extractVaeloImages('gpt-image-2', { data: [{ b64_json: 'BBBB' }, { url: 'https://example.com/a.png' }] }), [
  'data:image/png;base64,BBBB',
  'https://example.com/a.png',
]);
assert.deepEqual(extractVaeloImages('gemini-3-pro-image', {
  candidates: [{ content: { parts: [{ inlineData: { data: 'CCCC', mimeType: 'image/webp' } }] } }],
}), ['data:image/webp;base64,CCCC']);

const form = new FormData();
appendVaeloGptEditFields(form, {
  model: 'gpt-image-2',
  prompt: '只修改遮罩区域',
  aspectRatio: '1:1',
  imageSize: '2K',
  size: '2048x2048',
});
assert.equal(form.get('model'), 'gpt-image-2k');
assert.equal(form.get('size'), '2048x2048');

console.log('Vaelo image provider contract tests passed');
