// ── useStandings — real-time league table ────────────────────────────────────
//
// `seasonId` is a season key (league id × 10000 + season year). The table
// lives in `fb_standings`: the backend refreshes it after every finished match
// of the big leagues, and fetches it on demand for any other league/season.
import { useState, useEffect, useRef } from 'react';
import { subscribeStandings } from '../services/football/leagueData';
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
    return subscribeStandings(
      seasonId,
      rows => {
        if (!isMounted.current) return;
        setStandings(rows);
        setLoading(false);
      },
      err => {
        if (!isMounted.current) return;
        setError(err.message || 'Error loading standings');
        setLoading(false);
      },
    );
  }, [seasonId]);

  return { standings, loading, error };
}
