// ── useStandings — Firestore-backed standings with proxy fallback ───────────
//
// Reads from `standings/{seasonId}` in Firestore, which the `syncStandings`
// Cloud Function refreshes every 1 hour. The Firestore subscription pushes
// updates the moment a new sync lands — no client polling.
//
// Falls back to SportMonks (via getStandings → proxy) when:
//   • the season isn't in the synced league list (51 leagues today), or
//   • the Firestore document hasn't been written yet for a brand-new season, or
//   • Firestore is unavailable (rules error, network, etc.).
import { useState, useEffect, useRef } from 'react';
import { subscribeStandings } from '../services/firestoreApi';
import { getStandings } from '../services/sportsApi';
import type { LeagueStanding } from '../data/types';

interface UseStandingsResult {
  standings: LeagueStanding[];
  loading: boolean;
  error: string | null;
}

export function useStandings(seasonId: number | null): UseStandingsResult {
  const [standings, setStandings] = useState<LeagueStanding[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const isMounted                 = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (!seasonId || seasonId <= 0) {
      setStandings([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Helper: fetch from SportMonks proxy as a fallback
    const loadFromProxy = () => {
      getStandings(seasonId)
        .then(data => {
          if (!isMounted.current) return;
          setStandings(data);
          setLoading(false);
        })
        .catch(err => {
          if (!isMounted.current) return;
          setError(err instanceof Error ? err.message : 'Error loading standings');
          setLoading(false);
        });
    };

    // Subscribe to Firestore. If the doc doesn't exist (empty array) OR the
    // subscription errors out, fall back to the proxy. Otherwise keep streaming.
    let receivedAny = false;
    const unsubscribe = subscribeStandings(
      seasonId,
      rows => {
        if (!isMounted.current) return;
        receivedAny = true;
        if (rows.length === 0) {
          // Doc doesn't exist yet for this season — try the proxy once
          loadFromProxy();
        } else {
          setStandings(rows);
          setLoading(false);
        }
      },
      err => {
        if (!isMounted.current) return;
        if (!receivedAny) {
          console.warn('[useStandings] Firestore failed, using proxy:', err.message);
          loadFromProxy();
        }
      },
    );

    return unsubscribe;
  }, [seasonId]);

  return { standings, loading, error };
}
