export const OPENAI_IMAGE_TOTAL_TIMEOUT_MS = 210_000;
export const OPENAI_IMAGE_REQUEST_TTL_MS = 15 * 60 * 1000;

interface RequestEntry {
  state: 'running' | 'completed';
  diagnosticId: string;
  expiresAt: number;
}

export interface RequestBeginResult {
  accepted: boolean;
  state?: RequestEntry['state'];
  diagnosticId?: string;
}

/**
 * Prevents the same UI task from being submitted twice to the image provider.
 * Results are intentionally not cached because base64 images are too large to
 * retain in application memory.
 */
export class ImageRequestDeduplicator {
  private readonly requests = new Map<string, RequestEntry>();

  constructor(
    private readonly ttlMs = OPENAI_IMAGE_REQUEST_TTL_MS,
    private readonly maxEntries = 500,
  ) {}

  begin(key: string, diagnosticId: string, now = Date.now()): RequestBeginResult {
    this.prune(now);
    const existing = this.requests.get(key);
    if (existing) {
      return { accepted: false, state: existing.state, diagnosticId: existing.diagnosticId };
    }
    if (this.requests.size >= this.maxEntries) {
      const oldestKey = this.requests.keys().next().value as string | undefined;
      if (oldestKey) this.requests.delete(oldestKey);
    }
    this.requests.set(key, { state: 'running', diagnosticId, expiresAt: now + this.ttlMs });
    return { accepted: true };
  }

  finish(key: string, now = Date.now()): void {
    const current = this.requests.get(key);
    if (!current) return;
    this.requests.set(key, { ...current, state: 'completed', expiresAt: now + this.ttlMs });
  }

  private prune(now: number): void {
    for (const [key, entry] of this.requests) {
      if (entry.expiresAt <= now) this.requests.delete(key);
    }
  }
}

export function normalizeImageRequestId(value: unknown, fallback: string): string {
  const requestId = typeof value === 'string' ? value.trim() : '';
  return /^[a-zA-Z0-9_-]{8,100}$/.test(requestId) ? requestId : fallback;
}
