const DEFAULT_TTL_MS = 5 * 60 * 1000;
const CACHE_PREFIX = "finance-cache:";

type CacheEntry<T> = {
  timestamp: number;
  value: T;
};

function getStorageKey(key: string) {
  return `${CACHE_PREFIX}${key}`;
}

function readCache<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = window.sessionStorage.getItem(getStorageKey(key));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.timestamp !== "number" ||
      !Object.prototype.hasOwnProperty.call(parsed, "value")
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T) {
  try {
    window.sessionStorage.setItem(
      getStorageKey(key),
      JSON.stringify({ timestamp: Date.now(), value }),
    );
  } catch {
    // ignore storage failures
  }
}

export function hasFreshCache(key: string, ttlMs = DEFAULT_TTL_MS): boolean {
  if (typeof window === "undefined") return false;

  const cached = readCache<unknown>(key);
  if (!cached) return false;

  return Date.now() - cached.timestamp < ttlMs;
}

export async function fetchCachedJson<T>(options: {
  key: string;
  fetcher: (signal: AbortSignal) => Promise<T>;
  forceRefresh?: boolean;
  ttlMs?: number;
  signal?: AbortSignal;
}): Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

  if (typeof window !== "undefined" && !options.forceRefresh) {
    const cached = readCache<T>(options.key);
    if (cached && Date.now() - cached.timestamp < ttlMs) {
      return cached.value;
    }
  }

  const value = await options.fetcher(options.signal ?? new AbortController().signal);
  if (typeof window !== "undefined") {
    writeCache(options.key, value);
  }

  return value;
}

export function clearCachedJson(key: string) {
  try {
    window.sessionStorage.removeItem(getStorageKey(key));
  } catch {
    // ignore storage failures
  }
}
