import assert from 'node:assert/strict';
import {
  GenerationTaskCoordinator,
  GenerationTimeoutError,
  getGenerationErrorMessage,
  getGenerationProgress,
} from '../src/lib/generationTasks';
import { ImageRequestDeduplicator, normalizeImageRequestId } from '../src/lib/openAiImageRuntime';

const coordinator = new GenerationTaskCoordinator();
const first = coordinator.start('node-a', 1000);
assert.equal(coordinator.isCurrent(first), true);

const replacement = coordinator.start('node-a', 1000);
assert.equal(first.signal.aborted, true);
assert.equal(coordinator.isCurrent(first), false);
assert.equal(coordinator.isCurrent(replacement), true);

const parallel = coordinator.start('node-b', 1000);
assert.equal(coordinator.isCurrent(replacement), true);
assert.equal(coordinator.isCurrent(parallel), true);

coordinator.finish(replacement);
assert.equal(coordinator.isCurrent(replacement), false);
assert.equal(coordinator.isCurrent(parallel), true);

coordinator.cancel('node-b');
assert.equal(parallel.signal.aborted, true);
assert.equal(coordinator.isCurrent(parallel), false);

const timedOut = coordinator.start('node-timeout', 5);
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(timedOut.signal.aborted, true);
assert.equal(timedOut.signal.reason instanceof GenerationTimeoutError, true);
assert.match(getGenerationErrorMessage(timedOut.signal.reason, timedOut.signal), /生成超时/);
coordinator.finish(timedOut);

const cancelOne = coordinator.start('node-c', 1000);
const cancelTwo = coordinator.start('node-d', 1000);
coordinator.cancelAll();
assert.equal(cancelOne.signal.aborted, true);
assert.equal(cancelTwo.signal.aborted, true);
assert.equal(coordinator.isCurrent(cancelOne), false);
assert.equal(coordinator.isCurrent(cancelTwo), false);

assert.equal(getGenerationErrorMessage(new Error('上游错误')), '上游错误');
assert.match(getGenerationProgress('gpt-image-2', 2, 1).label, /上传参考图/);
assert.match(getGenerationProgress('gpt-image-2', 20).detail, /不返回中间进度/);
assert.match(getGenerationProgress('gpt-image-2', 75, 1).detail, /参考图或高分辨率/);
assert.match(getGenerationProgress('gpt-image-2', 130).detail, /不会在后台自动重复生成/);
assert.deepEqual(getGenerationProgress('gemini-3.1-flash-image', 12), { label: '正在生成', detail: '已等待 12 秒' });

const deduplicator = new ImageRequestDeduplicator(100, 10);
assert.deepEqual(deduplicator.begin('user:request-1', 'diag-1', 1000), { accepted: true });
assert.deepEqual(deduplicator.begin('user:request-1', 'diag-2', 1001), { accepted: false, state: 'running', diagnosticId: 'diag-1' });
deduplicator.finish('user:request-1', 1002);
assert.deepEqual(deduplicator.begin('user:request-1', 'diag-3', 1003), { accepted: false, state: 'completed', diagnosticId: 'diag-1' });
assert.deepEqual(deduplicator.begin('user:request-1', 'diag-4', 1200), { accepted: true });
assert.equal(normalizeImageRequestId('task_12345678', 'fallback'), 'task_12345678');
assert.equal(normalizeImageRequestId('bad id', 'fallback'), 'fallback');
console.log('generation task tests passed');
