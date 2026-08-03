export class ImageWriteCache {
  private values = new Map<string, string>();

  matches(key: string, value: string): boolean {
    return this.values.get(key) === value;
  }

  remember(key: string, value: string): void {
    this.values.set(key, value);
  }

  replace(entries: Iterable<readonly [string, string]>): void {
    this.values = new Map(entries);
  }

  clear(): void {
    this.values.clear();
  }
}

export class SerialTaskQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.catch(() => undefined).then(task);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  drain(): Promise<void> {
    return this.tail;
  }
}

const TRANSIENT_GRAPH_KEYS = new Set(['selected', 'dragging', 'measured', 'resizing']);

export function stripRuntimeGraphState<T extends Record<string, unknown>>(item: T): T {
  return Object.fromEntries(
    Object.entries(item).filter(([key]) => !TRANSIENT_GRAPH_KEYS.has(key)),
  ) as T;
}

export function createProjectFingerprint(
  nodes: unknown[],
  edges: unknown[],
  lastNodeId: string | null,
): string {
  return JSON.stringify({ nodes, edges, lastNodeId });
}
