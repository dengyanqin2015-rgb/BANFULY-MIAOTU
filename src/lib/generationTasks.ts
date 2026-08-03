export const GENERATION_TIMEOUT_MS = 4 * 60 * 1000;

export class GenerationTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Generation timed out after ${timeoutMs}ms`);
    this.name = 'GenerationTimeoutError';
  }
}

export interface GenerationTaskToken {
  key: string;
  id: string;
  controller: AbortController;
  signal: AbortSignal;
}

interface ActiveGenerationTask {
  token: GenerationTaskToken;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Coordinates latest-wins image jobs. Starting a second job for the same node
 * aborts the first one, while different nodes can continue in parallel.
 */
export class GenerationTaskCoordinator {
  private readonly active = new Map<string, ActiveGenerationTask>();

  start(key: string, timeoutMs = GENERATION_TIMEOUT_MS): GenerationTaskToken {
    this.cancel(key, new Error('Generation superseded by a newer request'));
    const controller = new AbortController();
    const token: GenerationTaskToken = {
      key,
      id: crypto.randomUUID(),
      controller,
      signal: controller.signal,
    };
    const timer = setTimeout(() => {
      const current = this.active.get(key);
      if (current?.token.id === token.id && !controller.signal.aborted) {
        controller.abort(new GenerationTimeoutError(timeoutMs));
      }
    }, timeoutMs);
    this.active.set(key, { token, timer });
    return token;
  }

  isCurrent(token: GenerationTaskToken): boolean {
    return this.active.get(token.key)?.token.id === token.id;
  }

  finish(token: GenerationTaskToken): void {
    const current = this.active.get(token.key);
    if (current?.token.id !== token.id) return;
    clearTimeout(current.timer);
    this.active.delete(token.key);
  }

  cancel(key: string, reason: unknown = new Error('Generation cancelled')): void {
    const current = this.active.get(key);
    if (!current) return;
    clearTimeout(current.timer);
    this.active.delete(key);
    if (!current.token.signal.aborted) current.token.controller.abort(reason);
  }

  cancelAll(reason: unknown = new Error('Generation context changed')): void {
    [...this.active.keys()].forEach(key => this.cancel(key, reason));
  }
}

export function getGenerationErrorMessage(error: unknown, signal?: AbortSignal): string {
  const reason = signal?.reason;
  if (reason instanceof GenerationTimeoutError) {
    return `生成超时（超过 ${Math.round(reason.timeoutMs / 60000)} 分钟），请检查网络后重新生成`;
  }
  if (signal?.aborted) return '生成已取消';
  if (error instanceof Error && error.message) return error.message;
  return '图片生成失败，请稍后重试';
}
