// ── useLivescores — React hook with auto-refresh for live matches ───────────
import { useState, useEffect, useCallback, useRef } from 'react';
import { getLiveFixtures } from '../services/sportsApi';
import type { Match } from '../data/types';

const REFRESH_INTERVAL_MS = 30_000; // 30 seconds

interface UseLivescoresResult {
  matches: Match[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useLivescores(enabled = true): UseLivescoresResult {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      const data = await getLiveFixtures();
      if (isMounted.current) setMatches(data);
    } catch (err: unknown) {
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : 'Error loading livescores');
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  // Initial load + auto-refresh
  useEffect(() => {
    if (!enabled) {
      setMatches([]);
      setLoading(false);
      return;
    }

    load(false);

    intervalRef.current = setInterval(() => {
      load(true); // silent refresh
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, load]);

  const refresh = useCallback(() => load(false), [load]);

  return { matches, loading, error, refresh };
}
