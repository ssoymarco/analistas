// ── Smart cache with TTL ───────────────────────────────────────────────────────
// Uses AsyncStorage to persist API responses between sessions.
// Each entry carries a timestamp + TTL so stale data is never served silently.
//
// Usage:
//   await AppCache.set('key', data, 5 * 60_000);   // store, 5-min TTL
//   const data = await AppCache.get<MyType>('key'); // null if missing/expired
//   await AppCache.invalidate('key');               // force-expire one entry
//   await AppCache.clear();                         // wipe all cache entries

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Namespace prefix for all cache keys in AsyncStorage */
const PREFIX = 'analistas_cache_';

interface CacheEntry<T> {
  data: T;
  /** Unix timestamp (ms) when the entry was stored */
  at: number;
  /** How long (ms) the entry is considered fresh */
  ttl: number;
}

function isExpired<T>(entry: CacheEntry<T>): boolean {
  return Date.now() - entry.at > entry.ttl;
}

/**
 * Retrieve a cached value.
 * Returns `null` if the key doesn't exist OR the entry has expired.
 */
async function get<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);
    if (isExpired(entry)) {
      // Clean up stale entry in background
      AsyncStorage.removeItem(PREFIX + key).catch(() => {});
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Store a value with a time-to-live.
 * Fire-and-forget: awaiting is optional.
 */
async function set<T>(key: string, data: T, ttlMs: number): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, at: Date.now(), ttl: ttlMs };
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Storage full or serialization error — silently skip caching
  }
}

/** Remove a single cache entry regardless of TTL */
async function invalidate(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREFIX + key);
  } catch {}
}

/**
 * Remove ALL cache entries (not user prefs — only `analistas_cache_*` keys).
 * Called from Perfil → Borrar caché.
 */
async function clear(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter(k => k.startsWith(PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch {}
}

/** Returns how many seconds remain before an entry expires, or 0 if stale */
async function ttlRemaining(key: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return 0;
    const entry: CacheEntry<unknown> = JSON.parse(raw);
    const remaining = entry.ttl - (Date.now() - entry.at);
    return Math.max(0, Math.floor(remaining / 1000));
  } catch {
    return 0;
  }
}

export const AppCache = { get, set, invalidate, clear, ttlRemaining };

// ── Cache TTLs (ms) ────────────────────────────────────────────────────────────
export const CacheTTL = {
  /** Fixtures list for today — updated frequently due to live scores */
  fixturesLive:    2  * 60_000,      //  2 min
  /** Fixtures list for a past/future date — rarely changes */
  fixturesStatic:  12 * 60 * 60_000, // 12 h
  /** Match detail for a live fixture — matches the list-view poll cadence (10 s)
   *  so period transitions (1H→HT→2H) propagate to the detail view quickly. */
  detailLive:      10_000,           // 10 s
  /** Match detail for a scheduled fixture */
  detailScheduled: 10 * 60_000,      // 10 min
  /** Match detail for a finished fixture — immutable */
  detailFinished:  24 * 60 * 60_000, // 24 h
  /** League standings, cup bracket, top scorers */
  standings:       30 * 60_000,      // 30 min
  /** H2H, team form */
  h2h:             60 * 60_000,      //  1 h
  /** Search index (teams, players, leagues) */
  searchIndex:     60 * 60_000,      //  1 h
  /** Enriched popular players (image_path, position) — rarely changes */
  players:         7 * 24 * 60 * 60_000, // 7 days
};
