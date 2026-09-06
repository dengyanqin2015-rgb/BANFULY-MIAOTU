import assert from 'node:assert/strict';
import {
  buildVaeloTextRequest,
  extractVaeloText,
  resolveVaeloTextApiKey,
  resolveVaeloTextModel,
} from '../src/lib/vaeloTextProvider';

const env = {
  VAELO_TEXT_API_KEY: ' Bearer fake-text-key ',
  VAELO_TEXT_MODEL: 'gemini-text-fast',
  VAELO_DEEP_TEXT_MODEL: 'gemini-text-deep',
};
assert.equal(resolveVaeloTextApiKey(env), 'fake-text-key');
assert.equal(resolveVaeloTextApiKey({ VAELO_GOOGLE_API_KEY: 'image-only' }), '');
assert.equal(resolveVaeloTextModel('gemini-3.6-flash', env), 'gemini-text-fast');
assert.equal(resolveVaeloTextModel('gemini-3.1-pro-preview', env), 'gemini-text-deep');

const built = buildVaeloTextRequest({
  requestedModel: 'gemini-3.6-flash',
  contents: { parts: [{ text: '分析商品' }] },
  config: {
    systemInstruction: '只输出 JSON',
    responseMimeType: 'application/json',
    responseSchema: { type: 'OBJECT' },
    maxOutputTokens: 2048,
  },
}, env);
assert.equal(built.endpoint, '/v1/chat/completions');
assert.deepEqual(built.body, {
  model: 'gemini-text-fast',
  messages: [
    { role: 'system', content: '只输出 JSON\n\n严格按照以下 JSON Schema 输出，不要添加 Markdown 代码围栏：\n{"type":"OBJECT"}' },
    { role: 'user', content: '分析商品' },
  ],
  max_tokens: 2048,
  response_format: { type: 'json_object' },
});
assert.equal(extractVaeloText({ choices: [{ message: { content: '{"ok":true}' } }] }), '{"ok":true}');
const withImage = buildVaeloTextRequest({
  requestedModel: 'gemini-3.6-flash',
  contents: [{ role: 'user', parts: [{ text: '分析图片' }, { inlineData: { data: 'AAAA', mimeType: 'image/png' } }] }],
}, env);
assert.deepEqual((withImage.body.messages as Array<Record<string, unknown>>)[0], {
  role: 'user',
  content: [
    { type: 'text', text: '分析图片' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
  ],
});
assert.throws(() => buildVaeloTextRequest({ requestedModel: 'x', contents: 'bad' }, env), /CONTENTS_INVALID/);
assert.throws(() => buildVaeloTextRequest({ requestedModel: 'x', contents: {} }, {}), /MODEL_NOT_CONFIGURED/);

console.log('Vaelo text provider contract tests passed');
