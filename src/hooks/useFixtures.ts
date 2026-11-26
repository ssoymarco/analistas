// ── useFixtures — the matches of a (device-local) day, in real time ──────────
//
// Reads `fb_matches` through Firestore listeners: when the backend writes a
// goal the list updates within a moment, with no client polling.
//
// Two tiers, so an ordinary open doesn't download every fixture on the planet:
//   • curated leagues (Liga MX, Premier, LaLiga, Champions… ~90 competitions)
//     and the user's followed teams — loaded at once;
//   • every other league — loaded when `loadAllLeagues()` is called (the list
//     reached its end, or a filter needs the complete day).

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  countFixturesByDate, dayNeedsRequest, groupMatchesByLeague, requestDayIfUnsynced,
  subscribeFixturesByDate, subscribeOtherFixturesByDate, subscribeTeamsFixturesByDate, type LeagueWithMatches,
} from '../services/football/matches';
import { sortForDisplay } from '../services/football/mappers';
import type { Match } from '../data/types';

interface UseFixturesResult {
  /** Loaded matches for the selected date */
  matches: Match[];
  /** Matches grouped by league */
  leagues: LeagueWithMatches[];
  /** True while the initial load is in progress */
  loading: boolean;
  /** True while a manual refresh is in progress */
  refreshing: boolean;
  /** Error message, if any */
  error: string | null;
  /** Pull-to-refresh acknowledgement (the data is already live) */
  refresh: () => void;
  /** True when there's at least one live match (drives the live indicator) */
  isPolling: boolean;
  /** Fixtures of the day in leagues not loaded yet (0 once everything is loaded) */
  pendingOtherCount: number;
  /** True once the non-curated leagues have been requested */
  allLeaguesRequested: boolean;
  /** Load the rest of the day's leagues (idempotent) */
  loadAllLeagues: () => void;
}

export function useFixtures(date: string, followedTeamIds: string[] = []): UseFixturesResult {
  const [curated, setCurated]       = useState<Match[]>([]);
  const [other, setOther]           = useState<Match[]>([]);
  const [mine, setMine]             = useState<Match[]>([]);
  const [dayTotal, setDayTotal]     = useState(0);
  const [wantAll, setWantAll]       = useState(false);
  const [otherLoaded, setOtherLoaded] = useState(false);
  const [loading, setLoading]       = useState(true);
  const [fetchingDay, setFetchingDay] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Curated tier — always on.
  useEffect(() => {
    setLoading(true);
    setError(null);
    setCurated([]);
    setOther([]);
    setMine([]);
    setDayTotal(0);
    setWantAll(false);
    setOtherLoaded(false);

    const unsubscribe = subscribeFixturesByDate(
      date,
      data => {
        if (!isMounted.current) return;
        setCurated(data);
        setLoading(false);
      },
      err => {
        if (!isMounted.current) return;
        setError(err.message || 'Error loading fixtures');
        setLoading(false);
      },
    );
    // Size of the whole day (one aggregate read): what isn't in the curated
    // tier is what's left to load — the screen can count it without
    // downloading it.
    let cancelled = false;
    const count = () => countFixturesByDate(date)
      .then(n => { if (!cancelled && isMounted.current) setDayTotal(n); })
      .catch(() => {});
    count();
    // A day outside the window the backend keeps synced (older results,
    // fixtures far ahead) is fetched the first time anyone opens it; the
    // listener above then delivers the rows.
    const needsRequest = dayNeedsRequest(date);
    setFetchingDay(needsRequest);
    if (needsRequest) {
      requestDayIfUnsynced(date)
        .then(stored => (stored ? count() : undefined))
        .finally(() => { if (!cancelled && isMounted.current) setFetchingDay(false); });
    }
    return () => { cancelled = true; unsubscribe(); };
  }, [date]);

  // Followed teams playing in leagues outside the curated set — live too.
  const teamsKey = followedTeamIds.join(',');
  useEffect(() => {
    if (!followedTeamIds.length) { setMine([]); return; }
    return subscribeTeamsFixturesByDate(followedTeamIds, date, list => {
      if (isMounted.current) setMine(list);
    });
  }, [date, teamsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Other tier — on demand.
  useEffect(() => {
    if (!wantAll) return;
    return subscribeOtherFixturesByDate(
      date,
      data => {
        if (!isMounted.current) return;
        setOther(data);
        setOtherLoaded(true);
      },
      () => { if (isMounted.current) setOtherLoaded(true); },
    );
  }, [date, wantAll]);

  // Fixtures of the day outside the curated leagues, while they aren't loaded.
  const otherCount = loading ? 0 : Math.max(0, dayTotal - curated.length);

  // A day with (almost) nothing in the curated leagues: don't make the user ask.
  useEffect(() => {
    if (!loading && !wantAll && otherCount > 0 && curated.length < 12) setWantAll(true);
  }, [loading, wantAll, otherCount, curated.length]);

  const matches = useMemo(() => {
    const byId = new Map<string, Match>();
    for (const m of mine) byId.set(m.id, m);
    for (const m of other) byId.set(m.id, m);
    for (const m of curated) byId.set(m.id, m);
    return [...byId.values()].sort(sortForDisplay);
  }, [curated, other, mine]);

  const leagues = useMemo(() => groupMatchesByLeague(matches), [matches]);
  const isPolling = useMemo(() => matches.some(m => m.status === 'live'), [matches]);

  const loadAllLeagues = useCallback(() => setWantAll(true), []);

  // Pull-to-refresh: the listeners are already live, so there is nothing to
  // fetch — acknowledge the gesture with a short pulse.
  const refresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => { if (isMounted.current) setRefreshing(false); }, 300);
  }, []);

  return {
    matches, leagues,
    // An empty list isn't "no matches" while the backend is still fetching the day.
    loading: loading || (fetchingDay && matches.length === 0),
    refreshing, error, refresh, isPolling,
    pendingOtherCount: otherLoaded ? 0 : otherCount,
    allLeaguesRequested: wantAll,
    loadAllLeagues,
  };
}
