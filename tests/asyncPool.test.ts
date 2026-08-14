import assert from 'node:assert/strict';
import { mapWithConcurrency } from '../src/lib/asyncPool';

let active = 0;
let maxActive = 0;
const progress: number[] = [];
const result = await mapWithConcurrency([30, 5, 15, 1], 2, async (delay, index) => {
  active += 1;
  maxActive = Math.max(maxActive, active);
  await new Promise(resolve => setTimeout(resolve, delay));
  active -= 1;
  return `item-${index}`;
}, completed => progress.push(completed));

assert.equal(maxActive, 2, '上传并发不得超过配置上限');
assert.deepEqual(result, ['item-0', 'item-1', 'item-2', 'item-3'], '并发上传后必须保持原始顺序');
assert.deepEqual(progress, [1, 2, 3, 4], '每完成一个文件都必须更新进度');
await assert.rejects(() => mapWithConcurrency([1], 0, async value => value), /正整数/);

console.log('async pool regression passed');
