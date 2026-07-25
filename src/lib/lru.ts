// Bound a module-level Map used as a session cache to `max` entries, evicting the
// least-recently-set (Map preserves insertion order). Prevents unbounded memory growth in
// long-lived client sessions (PR detail/diff/timeline caches, etc.). Re-setting an existing
// key refreshes its recency.
export function cacheSet<K, V>(map: Map<K, V>, key: K, value: V, max = 25): void {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

export interface PersistentCache<V> {
  get(key: string): V | undefined;
  has(key: string): boolean;
  set(key: string, value: V): void;
  delete(key: string): void;
}

export interface PersistentCacheOptions {
  max?: number; // entry-count LRU bound (default 25)
  version?: number; // bump when the stored value's SHAPE changes → old cache is discarded, not crashed on
  ttlMs?: number; // entries older than this are dropped on hydrate (default 7 days) — bounds data-at-rest
}

// Every persistent cache is namespaced under this prefix so `clearPersistentCaches()` can wipe them
// as a group without touching other localStorage keys (client IDs, prefs, sync timestamps).
const CACHE_PREFIX = "optispace:cache:";
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredEntry<V> {
  val: V;
  ts: number; // Date.now() at write — for TTL expiry
}
interface CacheEnvelope<V> {
  v: number; // schema version (see options.version)
  e: [string, StoredEntry<V>][];
}

// Like the module-level Map caches, but mirrored to localStorage so entries survive a page reload —
// the first click on a detail after reload paints from cache instantly instead of re-fetching.
// Bounded by entry count (LRU: evict least-recently-used) AND by bytes (self-trims on quota) AND by
// age (TTL). Versioned so a value-shape change safely invalidates old data instead of hydrating a
// stale shape into new code. Hydrates lazily on first access; a no-op on the server (client-only).
// Values must be JSON-serializable.
export function persistentCache<V>(name: string, options: PersistentCacheOptions = {}): PersistentCache<V> {
  const { max = 25, version = 1, ttlMs = DEFAULT_TTL_MS } = options;
  const storageKey = CACHE_PREFIX + name;
  const map = new Map<string, StoredEntry<V>>();
  let hydrated = false;

  function hydrate(): void {
    if (hydrated || typeof window === "undefined") return;
    hydrated = true;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CacheEnvelope<V>;
      if (parsed.v !== version) return; // shape changed since this was written — ignore it, refetch fresh
      const now = Date.now();
      for (const [k, entry] of parsed.e) {
        if (now - entry.ts > ttlMs) continue; // expired — don't resurrect stale data at rest
        map.set(k, entry);
      }
    } catch {
      // corrupt/unreadable cache — start empty; the next set() overwrites it
    }
  }

  function persist(): void {
    if (typeof window === "undefined") return;
    // Bound by BYTES, not just entry count: if the write throws (usually quota exceeded), drop the
    // oldest entry and retry so the freshest data still persists instead of silently failing. This
    // keeps the on-disk cache self-trimming, so it can't bloat over the long term. Give up after a
    // few attempts (or once empty) — the in-memory Map still works this session either way.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const envelope: CacheEnvelope<V> = { v: version, e: [...map.entries()] };
        window.localStorage.setItem(storageKey, JSON.stringify(envelope));
        return;
      } catch {
        const oldest = map.keys().next().value;
        if (oldest === undefined) return;
        map.delete(oldest);
      }
    }
  }

  return {
    get(key) {
      hydrate();
      const entry = map.get(key);
      if (entry === undefined) return undefined;
      // Refresh recency so eviction tracks last READ, not just last write (Map re-insert = move to end).
      map.delete(key);
      map.set(key, entry);
      return entry.val;
    },
    has(key) {
      hydrate();
      return map.has(key);
    },
    set(key, value) {
      hydrate();
      if (map.has(key)) map.delete(key);
      map.set(key, { val: value, ts: Date.now() });
      while (map.size > max) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
      persist();
    },
    delete(key) {
      hydrate();
      if (map.delete(key)) persist();
    },
  };
}

// Wipe every persistent cache (details / diffs / timelines / lists) in one call, without touching
// prefs, client IDs, or sync timestamps. Safe to expose as a "Clear cached data" action — the caches
// simply refetch on next use.
export function clearPersistentCaches(): void {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
  }
  for (const k of keys) window.localStorage.removeItem(k);
}
