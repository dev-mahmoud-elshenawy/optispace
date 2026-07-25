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
