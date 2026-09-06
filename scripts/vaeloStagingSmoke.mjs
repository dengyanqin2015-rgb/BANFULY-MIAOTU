import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const base = 'https://banfuly-miaotu-vaelo-staging.up.railway.app';
const cli = process.env.RAILWAY_CLI_PATH;
if (!cli) throw new Error('Set RAILWAY_CLI_PATH to the installed Railway CLI executable before running this acceptance script');
const vars = JSON.parse(execFileSync(cli, ['variable', 'list', '-p', 'b7465103-eae6-496a-852f-6f94a7c1b077', '-s', '08d5c930-a83f-4168-b7e9-7bf6609f6e3f', '-e', 'staging', '--json'], { encoding: 'utf8' }));
let token;
async function request(path, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${result.message || ''}`);
  return result;
}
token = (await request('/api/auth/login', { username: 'admin', password: vars.ADMIN_INITIAL_PASSWORD })).token;
const status = await request('/api/storage/status');
assert.equal(status.provider, 'railway-volume');
assert.equal(status.configured, true);
const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=', 'base64');
const upload = await request('/api/storage/uploads/presign', { fileName: 'staging-storage-smoke.png', mimeType: 'image/png', byteSize: bytes.length });
assert.ok(upload.uploadUrl.startsWith('/api/storage/uploads/'));
const put = await fetch(base + upload.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' }, body: bytes, signal: AbortSignal.timeout(30000) });
assert.equal(put.status, 204);
const completed = await request(`/api/storage/uploads/${upload.objectId}/complete`, {});
const read = await fetch(base + completed.previewUrl, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
assert.equal(read.status, 200);
const returned = Buffer.from(await read.arrayBuffer());
assert.equal(createHash('sha256').update(returned).digest('hex'), createHash('sha256').update(bytes).digest('hex'));
const anonymous = await fetch(base + completed.previewUrl, { signal: AbortSignal.timeout(30000) });
assert.equal(anonymous.status, 401);
console.log(JSON.stringify({ storage: status, upload: put.status, read: read.status, byteMatch: true, anonymous: anonymous.status, objectId: upload.objectId, dbPath: vars.DB_PATH }));
if (process.argv.includes('--images')) {
  const results = [];
  for (const model of ['gpt-image-2', 'gemini-3.1-flash-image', 'gemini-3-pro-image']) {
    let reference;
    for (let round = 0; round < 3; round++) {
    const started = Date.now();
    try {
      if (round === 2 && !reference) throw new Error('Reference image unavailable; do not send a text-only request as an edit test');
      const response = await fetch(base + '/api/ai/vaelo/images', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: round === 2 ? 'Keep the reference cup shape and material. Change the background to pale green, studio product photography, no text.' : 'A single matte ivory ceramic coffee cup on a pale blue background, clean product photography, soft studio lighting, no text.', aspectRatio: '1:1', imageSize: '1K', size: '1024x1024', images: round === 2 && reference ? [reference] : [], requestId: `acceptance-${model}-${Date.now()}` }),
        signal: AbortSignal.timeout(235000),
      });
      const payload = await response.json();
      const dataUrl = payload.images?.[0]?.url;
      if (round === 0 && dataUrl?.startsWith('data:image/')) reference = { mimeType: dataUrl.split(';')[0].slice(5), data: dataUrl.split(',')[1] };
      if (round === 0 && dataUrl?.startsWith('https://')) {
        const image = await fetch(dataUrl, { signal: AbortSignal.timeout(30000) });
        assert.ok(image.ok, 'Generated reference download failed');
        const mimeType = image.headers.get('content-type')?.split(';')[0];
        assert.ok(['image/png', 'image/jpeg', 'image/webp'].includes(mimeType), 'Invalid reference MIME');
        reference = { mimeType, data: Buffer.from(await image.arrayBuffer()).toString('base64') };
      }
      const item = { model, mode: round === 2 ? 'reference-edit' : 'text-to-image', referenceUsed: round === 2 && !!reference, status: response.status, success: response.ok && !!payload.images?.length, seconds: (Date.now() - started) / 1000, serverSeconds: payload.elapsedMs ? payload.elapsedMs / 1000 : undefined, imageCount: payload.images?.length || 0, diagnosticId: payload.diagnosticId, message: String(payload.message || '').replace(/sk-[\w-]+/g, '[redacted]') };
      results.push(item);
      console.log(JSON.stringify(item));
      if (!item.success) break;
    } catch (error) {
      const item = { model, success: false, seconds: (Date.now() - started) / 1000, error: error.name };
      results.push(item);
      console.log(JSON.stringify(item));
    }
    }
  }
  console.log(JSON.stringify({ generationSummary: results }));
}
