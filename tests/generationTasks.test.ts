import assert from 'node:assert/strict';
import {
  GenerationTaskCoordinator,
  GenerationTimeoutError,
  getGenerationErrorMessage,
} from '../src/lib/generationTasks';

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
console.log('generation task tests passed');
