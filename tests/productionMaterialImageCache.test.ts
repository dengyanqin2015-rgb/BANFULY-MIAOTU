import assert from 'node:assert/strict';
import {
  buildProductionMaterialImageCacheKey,
  ProductionMaterialMemoryCache,
  selectProductionMaterialCacheEvictions,
} from '../src/lib/productionMaterialImageCache';

assert.notEqual(
  buildProductionMaterialImageCacheKey('user-a', 'object-1'),
  buildProductionMaterialImageCacheKey('user-b', 'object-1'),
  '缓存键必须按用户隔离',
);
assert.notEqual(
  buildProductionMaterialImageCacheKey('user-a', 'object-1'),
  buildProductionMaterialImageCacheKey('user-a', 'object-2'),
  '不同不可变对象必须使用不同缓存键',
);

const cache = new ProductionMaterialMemoryCache();
let loads = 0;
const loader = async () => {
  loads += 1;
  await new Promise(resolve => setTimeout(resolve, 5));
  return { data: 'abc', mimeType: 'image/jpeg', analysisBytes: 3, originalBytes: 4, width: 10, height: 10 };
};
const [first, second] = await Promise.all([cache.load('same', loader), cache.load('same', loader)]);
assert.equal(loads, 1, '并发读取同一资料只能执行一次加载');
assert.deepEqual(first, second);

let failedLoads = 0;
await assert.rejects(() => cache.load('retry', async () => {
  failedLoads += 1;
  throw new Error('temporary');
}));
await cache.load('retry', async () => {
  failedLoads += 1;
  return loader();
});
assert.equal(failedLoads, 2, '失败项不得污染缓存，下一次必须能够重试');

assert.deepEqual(selectProductionMaterialCacheEvictions([
  { key: 'old', analysisBytes: 60, lastAccessedAt: 1 },
  { key: 'middle', analysisBytes: 60, lastAccessedAt: 2 },
  { key: 'new', analysisBytes: 60, lastAccessedAt: 3 },
], 120), ['old'], '超出容量时应优先淘汰最久未使用项');

console.log('production material image cache regression passed');
