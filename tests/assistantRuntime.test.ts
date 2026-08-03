import assert from 'node:assert/strict';
import {
  AssistantTaskCoordinator,
  AssistantTimeoutError,
  getAssistantErrorMessage,
  pruneAssistantPreviews,
  trimAssistantHistory,
} from '../src/lib/assistantRuntime';

const history = Array.from({ length: 30 }, (_, index) => ({
  role: index % 2 === 0 ? 'user' as const : 'model' as const,
  parts: [{ text: `message-${index}-${'x'.repeat(1000)}` }],
}));
const trimmed = trimAssistantHistory(history);
assert.equal(trimmed.length <= 16, true);
assert.equal(trimmed.at(-1)?.parts[0].text.startsWith('message-29-'), true);
assert.equal(trimmed.reduce((sum, item) => sum + item.parts[0].text.length, 0) <= 24_000, true);

const longMessage = trimAssistantHistory([
  { role: 'user', parts: [{ text: 'question' }] },
  { role: 'model', parts: [{ text: 'x'.repeat(10_000) }] },
]);
assert.equal(longMessage[1].parts[0].text.length < 6_100, true);
assert.match(longMessage[1].parts[0].text, /较早内容已省略/);
assert.deepEqual(trimAssistantHistory([{ role: 'model', parts: [{ text: 'orphan' }] }]), []);
assert.deepEqual(trimAssistantHistory([{ role: 'user', parts: [{ text: 'unanswered' }] }]), []);

const previews = pruneAssistantPreviews(Array.from({ length: 6 }, (_, index) => ({
  id: index,
  images: [`data:image/png;base64,${index}`],
  files: [{ name: `image-${index}`, preview: `preview-${index}` }],
})));
assert.equal(previews[0].images, undefined);
assert.equal(previews[1].files?.[0].preview, undefined);
assert.equal(previews[2].images?.length, 1);
assert.equal(previews[5].images?.length, 1);

const coordinator = new AssistantTaskCoordinator();
const first = coordinator.start(1000);
const replacement = coordinator.start(1000);
assert.equal(first.signal.aborted, true);
assert.equal(coordinator.isCurrent(first), false);
assert.equal(coordinator.isCurrent(replacement), true);
coordinator.finish(replacement);
assert.equal(coordinator.isCurrent(replacement), false);

const timedOut = coordinator.start(5);
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(timedOut.signal.reason instanceof AssistantTimeoutError, true);
assert.match(getAssistantErrorMessage(timedOut.signal.reason, timedOut.signal), /回答超时/);
coordinator.finish(timedOut);

const cancelled = coordinator.start(1000);
coordinator.cancel();
assert.equal(cancelled.signal.aborted, true);
assert.equal(getAssistantErrorMessage(cancelled.signal.reason, cancelled.signal), '已停止等待本次回答');

console.log('assistant runtime tests passed');
