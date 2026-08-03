export interface AssistantHistoryItem {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface AssistantPreviewMessage {
  images?: string[];
  files?: Array<{ preview?: string }>;
}

export const ASSISTANT_NORMAL_TIMEOUT_MS = 2 * 60 * 1000;
export const ASSISTANT_DEEP_TIMEOUT_MS = 3 * 60 * 1000;

const trimText = (text: string, limit: number) => {
  if (text.length <= limit) return text;
  const head = Math.ceil(limit * 0.65);
  const tail = limit - head;
  return `${text.slice(0, head)}\n…（较早内容已省略）…\n${text.slice(-tail)}`;
};

export function trimAssistantHistory(
  history: AssistantHistoryItem[],
  maxMessages = 16,
  maxCharacters = 24_000,
  maxCharactersPerMessage = 6_000,
): AssistantHistoryItem[] {
  const completeTurns: Array<[AssistantHistoryItem, AssistantHistoryItem]> = [];
  let pendingUser: AssistantHistoryItem | null = null;
  for (const item of history) {
    if (item.role === 'user') {
      pendingUser = item;
    } else if (pendingUser) {
      completeTurns.push([pendingUser, item]);
      pendingUser = null;
    }
  }

  const selectedTurns: Array<[AssistantHistoryItem, AssistantHistoryItem]> = [];
  let used = 0;
  const maxTurns = Math.max(1, Math.floor(maxMessages / 2));
  for (let index = completeTurns.length - 1; index >= 0 && selectedTurns.length < maxTurns; index -= 1) {
    const turn = completeTurns[index].map(item => ({
      role: item.role,
      parts: [{ text: trimText(item.parts.map(part => part.text).join('\n'), maxCharactersPerMessage) }],
    })) as [AssistantHistoryItem, AssistantHistoryItem];
    const turnLength = turn[0].parts[0].text.length + turn[1].parts[0].text.length;
    if (selectedTurns.length > 0 && used + turnLength > maxCharacters) break;
    selectedTurns.unshift(turn);
    used += turnLength;
  }
  return selectedTurns.flat();
}

export function pruneAssistantPreviews<T extends AssistantPreviewMessage>(messages: T[], maxPreviewMessages = 4): T[] {
  const result = [...messages];
  let retained = 0;
  for (let index = result.length - 1; index >= 0; index -= 1) {
    const message = result[index];
    const hasPreview = Boolean(message.images?.length || message.files?.some(file => file.preview));
    if (!hasPreview) continue;
    retained += 1;
    if (retained <= maxPreviewMessages) continue;
    result[index] = {
      ...message,
      images: undefined,
      files: message.files?.map(file => ({ ...file, preview: undefined })),
    } as T;
  }
  return result;
}

export class AssistantTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Assistant timed out after ${timeoutMs}ms`);
    this.name = 'AssistantTimeoutError';
  }
}

export interface AssistantTaskToken {
  id: string;
  controller: AbortController;
  signal: AbortSignal;
}

export class AssistantTaskCoordinator {
  private active: { token: AssistantTaskToken; timer: ReturnType<typeof setTimeout> } | null = null;

  start(timeoutMs: number): AssistantTaskToken {
    this.cancel(new Error('Assistant request superseded'));
    const controller = new AbortController();
    const token = { id: crypto.randomUUID(), controller, signal: controller.signal };
    const timer = setTimeout(() => {
      if (this.active?.token.id === token.id && !controller.signal.aborted) {
        controller.abort(new AssistantTimeoutError(timeoutMs));
      }
    }, timeoutMs);
    this.active = { token, timer };
    return token;
  }

  isCurrent(token: AssistantTaskToken): boolean {
    return this.active?.token.id === token.id;
  }

  finish(token: AssistantTaskToken): void {
    if (!this.isCurrent(token) || !this.active) return;
    clearTimeout(this.active.timer);
    this.active = null;
  }

  cancel(reason: unknown = new Error('Assistant request cancelled')): void {
    if (!this.active) return;
    clearTimeout(this.active.timer);
    const { token } = this.active;
    this.active = null;
    if (!token.signal.aborted) token.controller.abort(reason);
  }
}

export function getAssistantErrorMessage(error: unknown, signal: AbortSignal): string {
  if (signal.reason instanceof AssistantTimeoutError) {
    return `回答超时（超过 ${Math.round(signal.reason.timeoutMs / 60000)} 分钟），请缩短问题或切换普通模式后重试`;
  }
  if (signal.aborted) return '已停止等待本次回答';
  return error instanceof Error && error.message ? error.message : 'AI 助手暂时无法回答，请稍后重试';
}
