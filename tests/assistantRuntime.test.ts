import assert from 'node:assert/strict';
import {
  AssistantTaskCoordinator,
  AssistantTimeoutError,
  getAssistantErrorMessage,
  pruneAssistantPreviews,
  trimAssistantHistory,
} from '../src/lib/assistantRuntime';
import {
  buildStructuredAssistantMessage,
  ensureRequiredCopyInPromptBlocks,
  extractRequiredCopy,
  isVisualPromptTask,
} from '../src/lib/visualPromptStructure';

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

assert.equal(isVisualPromptTask('帮我写一段普通邮件'), false);
assert.equal(isVisualPromptTask('做一张产品主图'), true);
assert.equal(isVisualPromptTask('分析附件', true), true);
assert.deepEqual(extractRequiredCopy('主标题：“轻盈一夏”，副标题：清凉不黏腻。'), ['轻盈一夏', '清凉不黏腻']);
assert.deepEqual(extractRequiredCopy('请写上“新品上市”'), ['新品上市']);

const structuredPrompt = buildStructuredAssistantMessage('做一张主图，文案：“轻盈一夏”');
assert.match(structuredPrompt, /核心主体及准确外观特征/);
assert.match(structuredPrompt, /逐字保留的画面文案：“轻盈一夏”/);

const templateLinkedPrompt = buildStructuredAssistantMessage('分析这张产品图', true, {
  name: '电商产品图',
  prompt: '重点提取产品外形、卖点和商业光影。',
});
assert.match(templateLinkedPrompt, /后台当前默认解析模板“电商产品图”/);
assert.match(templateLinkedPrompt, /重点提取产品外形、卖点和商业光影/);

const repairedPrompt = ensureRequiredCopyInPromptBlocks(
  '方案\n```prompt\n清爽夏日场景，产品居中。\n```',
  '主标题：“轻盈一夏”',
);
assert.match(repairedPrompt, /清爽夏日场景/);
assert.match(repairedPrompt, /逐字准确显示“轻盈一夏”/);
assert.equal((repairedPrompt.match(/轻盈一夏/g) || []).length, 1);

const preservedPrompt = ensureRequiredCopyInPromptBlocks(
  '```prompt\n画面标题为“轻盈一夏”。\n```',
  '文案：“轻盈一夏”',
);
assert.equal((preservedPrompt.match(/轻盈一夏/g) || []).length, 1);

console.log('assistant runtime tests passed');
