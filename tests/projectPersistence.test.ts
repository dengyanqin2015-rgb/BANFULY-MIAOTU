import assert from 'node:assert/strict';
import {
  ImageWriteCache,
  SerialTaskQueue,
  createProjectFingerprint,
  stripRuntimeGraphState,
} from '../src/lib/projectPersistence';

const cache = new ImageWriteCache();
assert.equal(cache.matches('image-a', 'value-1'), false);
cache.remember('image-a', 'value-1');
assert.equal(cache.matches('image-a', 'value-1'), true);
assert.equal(cache.matches('image-a', 'value-2'), false);
cache.replace([['image-b', 'value-2']]);
assert.equal(cache.matches('image-a', 'value-1'), false);
assert.equal(cache.matches('image-b', 'value-2'), true);

assert.deepEqual(
  stripRuntimeGraphState({ id: 'node-a', selected: true, dragging: true, measured: { width: 1 }, position: { x: 1, y: 2 } }),
  { id: 'node-a', position: { x: 1, y: 2 } },
);

const stableNode = stripRuntimeGraphState({ id: 'node-a', selected: false, position: { x: 1, y: 2 } });
const sameNode = stripRuntimeGraphState({ id: 'node-a', selected: true, position: { x: 1, y: 2 } });
assert.equal(createProjectFingerprint([stableNode], [], null), createProjectFingerprint([sameNode], [], null));
assert.notEqual(
  createProjectFingerprint([stableNode], [], null),
  createProjectFingerprint([{ ...stableNode, position: { x: 2, y: 2 } }], [], null),
);

const queue = new SerialTaskQueue();
const order: string[] = [];
let active = 0;
let maxActive = 0;
const run = (name: string, delay: number, fail = false) => queue.enqueue(async () => {
  active += 1;
  maxActive = Math.max(maxActive, active);
  order.push(`${name}:start`);
  await new Promise(resolve => setTimeout(resolve, delay));
  order.push(`${name}:end`);
  active -= 1;
  if (fail) throw new Error(name);
  return name;
});

const first = run('first', 15);
const failed = run('failed', 1, true).catch(error => (error as Error).message);
const last = run('last', 1);
assert.equal(await first, 'first');
assert.equal(await failed, 'failed');
assert.equal(await last, 'last');
assert.equal(maxActive, 1);
assert.deepEqual(order, ['first:start', 'first:end', 'failed:start', 'failed:end', 'last:start', 'last:end']);

console.log('project persistence tests passed');
