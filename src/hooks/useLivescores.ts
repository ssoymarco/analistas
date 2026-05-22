// ── useLivescores — Firestore-backed real-time live matches ─────────────────
//
// Reads from the `matches` Firestore collection (populated by the
// `pollLivescores` Cloud Function every 15s). Uses `onSnapshot` so the UI
// receives push updates within ~100ms of a goal being detected server-side —
// no client polling, no SportMonks tokens consumed per app open.
//
// Falls back to a one-shot SportMonks call only on Firestore errors (permission,
// network) to keep the screen functional during incidents.
import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribeLivescores, getLivescoresFromFirestore } from '../services/firestoreApi';
import { getLiveFixtures } from '../services/sportsApi';
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

  // Manual refresh — only useful when Firestore subscription is unavailable.
  // With onSnapshot active, the data is already real-time.
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLivescoresFromFirestore();
      if (isMounted.current) setMatches(data);
    } catch (err) {
      // Firestore failed — try SportMonks proxy as a last resort
      try {
        const fallback = await getLiveFixtures();
        if (isMounted.current) setMatches(fallback);
      } catch {
        if (isMounted.current) {
          setError(err instanceof Error ? err.message : 'Error loading livescores');
        }
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  // Real-time subscription
  useEffect(() => {
    if (!enabled) {
      setMatches([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeLivescores(
      data => {
        if (!isMounted.current) return;
        setMatches(data);
        setLoading(false);
        setError(null);
      },
      err => {
        if (!isMounted.current) return;
        // Subscription failed — fall back to SportMonks one-shot
        getLiveFixtures()
          .then(data => { if (isMounted.current) setMatches(data); })
          .catch(() => { if (isMounted.current) setError(err.message); })
          .finally(() => { if (isMounted.current) setLoading(false); });
      },
    );

    return unsubscribe;
  }, [enabled]);

  return { matches, loading, error, refresh };
}
