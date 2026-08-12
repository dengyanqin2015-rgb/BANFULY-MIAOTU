import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import type {
  AssetRecord,
  AssetVersion,
  CategoryBaseRecord,
  CategoryBaseVersion,
  PaginatedAssetResult,
} from '../src/lib/assetLibrary';
import type { CategoryBaseGenerationContext } from '../src/lib/categoryBaseGeneration';

const workspace = process.cwd();
const tempRoot = await mkdtemp(path.join(tmpdir(), 'banfuly-asset-api-'));
const dbPath = path.join(tempRoot, 'db.json');
const port = 31000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const tsxCli = path.join(workspace, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const childEnv = { ...process.env };
delete childEnv.DATABASE_URL;
Object.assign(childEnv, {
  PORT: String(port),
  DB_PATH: dbPath,
  NODE_ENV: 'production',
  ALLOW_FILE_DB: 'true',
  JWT_SECRET: 'asset-api-test-secret',
  ADMIN_INITIAL_PASSWORD: 'asset-api-test-admin-password',
});

let server: ChildProcessWithoutNullStreams | undefined;
let serverOutput = '';

const request = async <T = unknown>(
  route: string,
  options: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: T }> => {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (options.token) headers.set('authorization', `Bearer ${options.token}`);
  const response = await fetch(`${baseUrl}${route}`, { ...options, headers });
  const raw = await response.text();
  return { status: response.status, body: raw ? JSON.parse(raw) as T : undefined as T };
};

const waitForHealth = async () => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) throw new Error(`server exited early\n${serverOutput}`);
    try {
      const result = await request<{ status: string }>('/api/health');
      if (result.status === 200 && result.body.status === 'ok') return;
    } catch {
      // Server may still be starting.
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`server did not become healthy\n${serverOutput}`);
};

const registerAndLogin = async (username: string) => {
  const password = 'asset-api-test-password';
  const registered = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  assert.equal(registered.status, 200);
  const loggedIn = await request<{ token: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  assert.equal(loggedIn.status, 200);
  assert.ok(loggedIn.body.token);
  return loggedIn.body.token;
};

const assetPayload = (type: 'visual_system' | 'scene' | 'material' | 'model' | 'copy_layout', name: string) => ({
  type,
  name,
  category: '泳装',
  tags: ['海边', name],
  sourceKind: 'manual',
  profile: {
    summary: `${name}摘要`,
    promptFragment: `${name}提示片段`,
    negativePrompt: '',
    lockedFields: ['主体'],
    variableFields: ['商品'],
    attributes: { tone: 'clean' },
  },
  imageRefs: [],
  changeNote: '初始版本',
});

try {
  server = spawn(process.execPath, [tsxCli, path.join(workspace, 'server.ts')], {
    cwd: workspace,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams;
  server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
  server.stderr.on('data', chunk => { serverOutput += chunk.toString(); });
  await waitForHealth();

  const anonymous = await request('/api/assets');
  assert.equal(anonymous.status, 401);
  const anonymousStorage = await request('/api/storage/status');
  assert.equal(anonymousStorage.status, 401);

  const tokenA = await registerAndLogin('asset-user-a');
  const tokenB = await registerAndLogin('asset-user-b');

  const storageStatus = await request<{ configured: boolean; provider: string }>('/api/storage/status', { token: tokenA });
  assert.equal(storageStatus.status, 200);
  assert.deepEqual(storageStatus.body, { configured: false, provider: 'none' });
  const unavailableUpload = await request('/api/storage/uploads/presign', {
    method: 'POST',
    token: tokenA,
    body: JSON.stringify({ fileName: 'sample.png', mimeType: 'image/png', byteSize: 1024 }),
  });
  assert.equal(unavailableUpload.status, 503);

  const visual = await request<AssetRecord>('/api/assets', {
    method: 'POST', token: tokenA, body: JSON.stringify(assetPayload('visual_system', '清透海岸VI')),
  });
  assert.equal(visual.status, 201);
  assert.equal(visual.body.asset.currentVersion, 1);

  const scene = await request<AssetRecord>('/api/assets', {
    method: 'POST', token: tokenA, body: JSON.stringify(assetPayload('scene', '地中海沙滩')),
  });
  assert.equal(scene.status, 201);
  const copyLayout = await request<AssetRecord>('/api/assets', {
    method: 'POST', token: tokenA, body: JSON.stringify({
      ...assetPayload('copy_layout', '主图左上标题模板'),
      profile: {
        ...assetPayload('copy_layout', '主图左上标题模板').profile,
        attributes: { templateKind: 'main_image', headlineMaxChars: 10, headlinePosition: '左上安全区' },
      },
    }),
  });
  assert.equal(copyLayout.status, 201);

  const filtered = await request<PaginatedAssetResult<AssetRecord>>('/api/assets?type=visual_system&page=1&pageSize=10', { token: tokenA });
  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.total, 1);
  assert.equal(filtered.body.items[0].asset.id, visual.body.asset.id);

  const hiddenFromOtherUser = await request(`/api/assets/${visual.body.asset.id}`, { token: tokenB });
  assert.equal(hiddenFromOtherUser.status, 404);

  const foreignBase = await request('/api/category-bases', {
    method: 'POST',
    token: tokenB,
    body: JSON.stringify({
      name: '越权组合', category: '泳装', components: {
        visualSystem: {
          assetId: visual.body.asset.id,
          versionId: visual.body.version.id,
          version: visual.body.version.version,
        },
      },
    }),
  });
  assert.equal(foreignBase.status, 400);

  const createdBase = await request<CategoryBaseRecord>('/api/category-bases', {
    method: 'POST',
    token: tokenA,
    body: JSON.stringify({
      name: '泳装清透基座',
      category: '泳装',
      description: 'VI与场景自由组合',
      components: {
        visualSystem: {
          assetId: visual.body.asset.id,
          versionId: visual.body.version.id,
          version: visual.body.version.version,
        },
        scene: {
          assetId: scene.body.asset.id,
          versionId: scene.body.version.id,
          version: scene.body.version.version,
        },
        copyLayout: {
          assetId: copyLayout.body.asset.id,
          versionId: copyLayout.body.version.id,
          version: copyLayout.body.version.version,
        },
      },
      defaults: { aspectRatio: '4:5', imageSize: '2K' },
      changeNote: '首次组合',
    }),
  });
  assert.equal(createdBase.status, 201);
  assert.equal(createdBase.body.version.components.visualSystem.version, 1);

  const changedPayload = assetPayload('visual_system', '清透海岸VI 2.0');
  changedPayload.changeNote = '优化色彩规范';
  const updatedVisual = await request<AssetRecord>(`/api/assets/${visual.body.asset.id}`, {
    method: 'PUT', token: tokenA, body: JSON.stringify(changedPayload),
  });
  assert.equal(updatedVisual.status, 200);
  assert.equal(updatedVisual.body.asset.currentVersion, 2);

  const versions = await request<AssetVersion[]>(`/api/assets/${visual.body.asset.id}/versions`, { token: tokenA });
  assert.equal(versions.status, 200);
  assert.deepEqual(versions.body.map(version => version.version), [2, 1]);

  const stableBase = await request<CategoryBaseRecord>(`/api/category-bases/${createdBase.body.base.id}`, { token: tokenA });
  assert.equal(stableBase.status, 200);
  assert.equal(stableBase.body.version.components.visualSystem.versionId, visual.body.version.id);
  const generationContextV1 = await request<CategoryBaseGenerationContext>(
    `/api/category-bases/${createdBase.body.base.id}/generation-context?versionId=${createdBase.body.version.id}`,
    { token: tokenA },
  );
  assert.equal(generationContextV1.status, 200);
  assert.equal(generationContextV1.body.versionId, createdBase.body.version.id);
  assert.deepEqual(generationContextV1.body.slots.map(slot => [slot.key, slot.version]), [['visualSystem', 1], ['scene', 1], ['copyLayout', 1]]);
  assert.ok(generationContextV1.body.slots.every(slot => slot.referenceImage === undefined));
  const hiddenGenerationContext = await request(
    `/api/category-bases/${createdBase.body.base.id}/generation-context?versionId=${createdBase.body.version.id}`,
    { token: tokenB },
  );
  assert.equal(hiddenGenerationContext.status, 404);
  const copyGenerationContext = await request<import('../src/lib/categoryBaseGeneration').CategoryBaseGenerationSlot>(
    `/api/assets/${copyLayout.body.asset.id}/generation-context?versionId=${copyLayout.body.version.id}`,
    { token: tokenA },
  );
  assert.equal(copyGenerationContext.status, 200);
  assert.equal(copyGenerationContext.body.key, 'copyLayout');
  assert.equal(copyGenerationContext.body.profile.attributes.headlineMaxChars, 10);
  const hiddenCopyGenerationContext = await request(
    `/api/assets/${copyLayout.body.asset.id}/generation-context?versionId=${copyLayout.body.version.id}`,
    { token: tokenB },
  );
  assert.equal(hiddenCopyGenerationContext.status, 404);

  const updatedBase = await request<CategoryBaseRecord>(`/api/category-bases/${createdBase.body.base.id}`, {
    method: 'PUT',
    token: tokenA,
    body: JSON.stringify({
      name: '泳装清透基座 2.0',
      category: '泳装',
      components: {
        visualSystem: {
          assetId: updatedVisual.body.asset.id,
          versionId: updatedVisual.body.version.id,
          version: updatedVisual.body.version.version,
        },
        scene: {
          assetId: scene.body.asset.id,
          versionId: scene.body.version.id,
          version: scene.body.version.version,
        },
        copyLayout: {
          assetId: copyLayout.body.asset.id,
          versionId: copyLayout.body.version.id,
          version: copyLayout.body.version.version,
        },
      },
      defaults: { aspectRatio: '4:5', imageSize: '2K' },
      changeNote: '升级VI版本',
    }),
  });
  assert.equal(updatedBase.status, 200);
  assert.equal(updatedBase.body.base.currentVersion, 2);
  const stillStableContextV1 = await request<CategoryBaseGenerationContext>(
    `/api/category-bases/${createdBase.body.base.id}/generation-context?versionId=${createdBase.body.version.id}`,
    { token: tokenA },
  );
  assert.equal(stillStableContextV1.status, 200);
  assert.equal(stillStableContextV1.body.slots.find(slot => slot.key === 'visualSystem')?.versionId, visual.body.version.id);

  const baseVersions = await request<CategoryBaseVersion[]>(`/api/category-bases/${createdBase.body.base.id}/versions`, { token: tokenA });
  assert.deepEqual(baseVersions.body.map(version => version.version), [2, 1]);

  const missingObjectRejected = await request('/api/assets', {
    method: 'POST',
    token: tokenA,
    body: JSON.stringify({
      ...assetPayload('material', '缺少对象样本'),
      imageRefs: [{ role: 'source', objectId: '' }],
    }),
  });
  assert.equal(missingObjectRejected.status, 400);

  const deleted = await request(`/api/assets/${scene.body.asset.id}`, { method: 'DELETE', token: tokenA });
  assert.equal(deleted.status, 200);
  const archivedRead = await request<AssetRecord>(`/api/assets/${scene.body.asset.id}`, { token: tokenA });
  assert.equal(archivedRead.status, 200);
  assert.equal(archivedRead.body.asset.status, 'archived');
  const activeAssets = await request<PaginatedAssetResult<AssetRecord>>('/api/assets?page=1&pageSize=10', { token: tokenA });
  assert.ok(activeAssets.body.items.every(item => item.asset.id !== scene.body.asset.id));
  const archivedAssets = await request<PaginatedAssetResult<AssetRecord>>('/api/assets?status=archived&page=1&pageSize=10', { token: tokenA });
  assert.ok(archivedAssets.body.items.some(item => item.asset.id === scene.body.asset.id));
  const baseAfterArchive = await request<CategoryBaseRecord>(`/api/category-bases/${createdBase.body.base.id}`, { token: tokenA });
  assert.equal(baseAfterArchive.status, 200);
  assert.equal(baseAfterArchive.body.version.components.scene?.versionId, scene.body.version.id);

  console.log('asset API integration tests passed');
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise<void>(resolve => {
      server!.once('exit', () => resolve());
      setTimeout(resolve, 2_000);
    });
  }
  const resolvedTemp = path.resolve(tempRoot);
  const resolvedSystemTemp = path.resolve(tmpdir());
  assert.ok(resolvedTemp.startsWith(`${resolvedSystemTemp}${path.sep}`));
  assert.match(path.basename(resolvedTemp), /^banfuly-asset-api-/);
  await rm(resolvedTemp, { recursive: true, force: true });
}

const failedDatabasePort = port + 1;
const failedDatabaseEnv = {
  ...childEnv,
  PORT: String(failedDatabasePort),
  DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:1/invalid',
};
const failedDatabaseServer = spawn(process.execPath, [tsxCli, path.join(workspace, 'server.ts')], {
  cwd: workspace,
  env: failedDatabaseEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let failedDatabaseOutput = '';
failedDatabaseServer.stdout.on('data', chunk => { failedDatabaseOutput += chunk.toString(); });
failedDatabaseServer.stderr.on('data', chunk => { failedDatabaseOutput += chunk.toString(); });
const failedDatabaseExitCode = await Promise.race<number | null>([
  new Promise(resolve => failedDatabaseServer.once('exit', resolve)),
  new Promise((_, reject) => setTimeout(() => reject(new Error(`database failure did not stop server\n${failedDatabaseOutput}`)), 12_000)),
]);
assert.notEqual(failedDatabaseExitCode, 0);
await assert.rejects(fetch(`http://127.0.0.1:${failedDatabasePort}/api/health`));

console.log('production database fail-closed test passed');

const missingDatabasePort = port + 2;
const missingDatabaseEnv: NodeJS.ProcessEnv = { ...childEnv, PORT: String(missingDatabasePort) };
delete missingDatabaseEnv.DATABASE_URL;
delete missingDatabaseEnv.ALLOW_FILE_DB;
const missingDatabaseServer = spawn(process.execPath, [tsxCli, path.join(workspace, 'server.ts')], {
  cwd: workspace,
  env: missingDatabaseEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let missingDatabaseOutput = '';
missingDatabaseServer.stdout.on('data', chunk => { missingDatabaseOutput += chunk.toString(); });
missingDatabaseServer.stderr.on('data', chunk => { missingDatabaseOutput += chunk.toString(); });
const missingDatabaseExitCode = await Promise.race<number | null>([
  new Promise(resolve => missingDatabaseServer.once('exit', resolve)),
  new Promise((_, reject) => setTimeout(() => reject(new Error(`missing database did not stop server\n${missingDatabaseOutput}`)), 12_000)),
]);
assert.notEqual(missingDatabaseExitCode, 0);
await assert.rejects(fetch(`http://127.0.0.1:${missingDatabasePort}/api/health`));

console.log('production missing-database fail-closed test passed');
