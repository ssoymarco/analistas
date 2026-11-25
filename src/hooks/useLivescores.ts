// ── useLivescores — matches in play right now, in real time ─────────────────
//
// A Firestore listener on `fb_matches` (status live/interrupted, all leagues).
// The backend's live poller writes every score/minute change, so the UI gets
// it pushed — no client polling.
import { useState, useEffect, useRef, useCallback } from 'react';
import { getLivescores, subscribeLivescores } from '../services/football/matches';
import type { Match } from '../data/types';

interface UseLivescoresResult {
  matches: Match[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useLivescores(enabled = true): UseLivescoresResult {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const isMounted             = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Manual refresh — only matters if the listener dropped (it re-reads once).
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLivescores();
      if (isMounted.current) setMatches(data);
    } catch (err) {
      if (isMounted.current) setError(err instanceof Error ? err.message : 'Error loading livescores');
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setMatches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    return subscribeLivescores(
      data => {
        if (!isMounted.current) return;
        setMatches(data);
        setLoading(false);
        setError(null);
      },
      err => {
        if (!isMounted.current) return;
        setError(err.message);
        setLoading(false);
      },
    );
  }, [enabled]);

  return { matches, loading, error, refresh };
}
