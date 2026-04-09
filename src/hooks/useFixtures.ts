// ── useFixtures — React hook for date-based fixture loading ─────────────────
import { useState, useEffect, useCallback, useRef } from 'react';
import { getLeaguesByDate, getFixturesByDate, type LeagueWithMatches } from '../services/sportsApi';
import type { Match } from '../data/types';

interface UseFixturesResult {
  /** All matches for the selected date */
  matches: Match[];
  /** Matches grouped by league */
  leagues: LeagueWithMatches[];
  /** True while the initial load is in progress */
  loading: boolean;
  /** True while a background refresh is in progress */
  refreshing: boolean;
  /** Error message, if any */
  error: string | null;
  /** Trigger a manual refresh (for pull-to-refresh) */
  refresh: () => void;
}

export function useFixtures(date: string): UseFixturesResult {
  const [matches, setMatches] = useState<Match[]>([]);
  const [leagues, setLeagues] = useState<LeagueWithMatches[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [matchData, leagueData] = await Promise.all([
        getFixturesByDate(date),
        getLeaguesByDate(date),
      ]);
      if (!isMounted.current) return;
      setMatches(matchData);
      setLeagues(leagueData);
    } catch (err: unknown) {
      if (!isMounted.current) return;
      const msg = err instanceof Error ? err.message : 'Error loading fixtures';
      setError(msg);
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [date]);

  // Load on mount and when date changes
  useEffect(() => {
    load(false);
  }, [load]);

  const refresh = useCallback(() => {
    load(true);
  }, [load]);

  return { matches, leagues, loading, refreshing, error, refresh };
}
