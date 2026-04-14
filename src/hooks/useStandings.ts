// ── useStandings — React hook for league standings ──────────────────────────
import { useState, useEffect, useRef } from 'react';
import { getStandings } from '../services/sportsApi';
import type { LeagueStanding } from '../data/types';

interface UseStandingsResult {
  standings: LeagueStanding[];
  loading: boolean;
  error: string | null;
}

export function useStandings(seasonId: number | null): UseStandingsResult {
  const [standings, setStandings] = useState<LeagueStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

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

    getStandings(seasonId)
      .then(data => {
        if (isMounted.current) {
          setStandings(data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted.current) {
          setError(err instanceof Error ? err.message : 'Error loading standings');
          setLoading(false);
        }
      });
  }, [seasonId]);

  return { standings, loading, error };
}
