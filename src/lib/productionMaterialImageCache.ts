import { processProductionMaterialImage } from './uploadProcessing';

const CACHE_DATABASE = 'banfuly-production-material-cache';
const CACHE_STORE = 'prepared-images';
const CACHE_DATABASE_VERSION = 1;
const PROCESSOR_VERSION = 'pm-ref-1920-q86-v1';
const MAX_PERSISTED_BYTES = 160 * 1024 * 1024;
const MAX_MEMORY_ENTRIES = 16;

export interface PreparedProductionMaterialImage {
  data: string;
  mimeType: string;
  analysisBytes: number;
  originalBytes: number;
  width: number;
  height: number;
  cacheSource: 'memory' | 'indexeddb' | 'network';
}

interface PersistedProductionMaterialImage extends Omit<PreparedProductionMaterialImage, 'cacheSource'> {
  key: string;
  userId: string;
  objectId: string;
  processorVersion: string;
  lastAccessedAt: number;
}

type PreparedWithoutSource = Omit<PreparedProductionMaterialImage, 'cacheSource'>;

export const buildProductionMaterialImageCacheKey = (userId: string, objectId: string): string =>
  `${encodeURIComponent(userId)}:${encodeURIComponent(objectId)}:${PROCESSOR_VERSION}`;

export const selectProductionMaterialCacheEvictions = (
  entries: Array<Pick<PersistedProductionMaterialImage, 'key' | 'analysisBytes' | 'lastAccessedAt'>>,
  maxBytes = MAX_PERSISTED_BYTES,
): string[] => {
  const sorted = [...entries].sort((left, right) => left.lastAccessedAt - right.lastAccessedAt);
  let total = sorted.reduce((sum, entry) => sum + Math.max(0, entry.analysisBytes), 0);
  const evictions: string[] = [];
  for (const entry of sorted) {
    if (total <= maxBytes) break;
    total -= Math.max(0, entry.analysisBytes);
    evictions.push(entry.key);
  }
  return evictions;
};

export class ProductionMaterialMemoryCache {
  private readonly entries = new Map<string, Promise<PreparedWithoutSource>>();

  async load(key: string, loader: () => Promise<PreparedWithoutSource>): Promise<PreparedWithoutSource> {
    const existing = this.entries.get(key);
    if (existing) return existing;
    const pending = loader().catch(error => {
      this.entries.delete(key);
      throw error;
    });
    this.entries.set(key, pending);
    if (this.entries.size > MAX_MEMORY_ENTRIES) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest && oldest !== key) this.entries.delete(oldest);
    }
    return pending;
  }

  clear(): void {
    this.entries.clear();
  }
}

export const productionMaterialMemoryCache = new ProductionMaterialMemoryCache();

const indexedDbAvailable = () => typeof indexedDB !== 'undefined';

const openDatabase = (): Promise<IDBDatabase | null> => {
  if (!indexedDbAvailable()) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DATABASE, CACHE_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CACHE_STORE)) {
        const store = database.createObjectStore(CACHE_STORE, { keyPath: 'key' });
        store.createIndex('userId', 'userId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开生产资料缓存'));
  });
};

const runStoreRequest = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> => {
  const database = await openDatabase();
  if (!database) return null;
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(CACHE_STORE, mode);
      const request = action(transaction.objectStore(CACHE_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('生产资料缓存操作失败'));
    });
  } finally {
    database.close();
  }
};

const readPersisted = async (key: string): Promise<PersistedProductionMaterialImage | null> => {
  try {
    const entry = await runStoreRequest('readonly', store => store.get(key));
    if (!entry || typeof entry !== 'object') return null;
    const candidate = entry as PersistedProductionMaterialImage;
    if (candidate.processorVersion !== PROCESSOR_VERSION || !candidate.data || candidate.analysisBytes < 1) return null;
    candidate.lastAccessedAt = Date.now();
    void runStoreRequest('readwrite', store => store.put(candidate)).catch(() => undefined);
    return candidate;
  } catch {
    return null;
  }
};

const prunePersistedCache = async () => {
  const entries = await runStoreRequest('readonly', store => store.getAll()) as PersistedProductionMaterialImage[] | null;
  if (!entries) return;
  const evictions = selectProductionMaterialCacheEvictions(entries);
  await Promise.all(evictions.map(key => runStoreRequest('readwrite', store => store.delete(key))));
};

const persist = async (entry: PersistedProductionMaterialImage) => {
  try {
    await runStoreRequest('readwrite', store => store.put(entry));
    void prunePersistedCache().catch(() => undefined);
  } catch {
    // IndexedDB can be unavailable in private browsing or under storage pressure.
    // The in-memory cache and network path remain fully functional.
  }
};

export const loadPreparedProductionMaterialImage = async (input: {
  userId: string;
  objectId: string;
  viewUrl: string;
  fallbackMimeType?: string;
}): Promise<PreparedProductionMaterialImage> => {
  const key = buildProductionMaterialImageCacheKey(input.userId, input.objectId);
  let resolvedSource: PreparedProductionMaterialImage['cacheSource'] = 'memory';
  const prepared = await productionMaterialMemoryCache.load(key, async () => {
    const persisted = await readPersisted(key);
    if (persisted) {
      resolvedSource = 'indexeddb';
      return persisted;
    }

    resolvedSource = 'network';
    const response = await fetch(input.viewUrl, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`生产资料图片读取失败（${response.status}）`);
    const blob = await response.blob();
    const file = new File([blob], input.objectId, { type: blob.type || input.fallbackMimeType || 'image/png' });
    const processed = await processProductionMaterialImage(file);
    const value: PersistedProductionMaterialImage = {
      key,
      userId: input.userId,
      objectId: input.objectId,
      processorVersion: PROCESSOR_VERSION,
      data: processed.analysisData,
      mimeType: processed.analysisMimeType,
      analysisBytes: processed.analysisBytes,
      originalBytes: processed.originalBytes,
      width: processed.width,
      height: processed.height,
      lastAccessedAt: Date.now(),
    };
    void persist(value);
    return value;
  });
  return { ...prepared, cacheSource: resolvedSource };
};

export const clearProductionMaterialImageCache = async (): Promise<void> => {
  productionMaterialMemoryCache.clear();
  if (!indexedDbAvailable()) return;
  await new Promise<void>(resolve => {
    const request = indexedDB.deleteDatabase(CACHE_DATABASE);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
};
