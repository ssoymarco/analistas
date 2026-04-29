// ── useFixtures — React hook for date-based fixture loading ─────────────────
//
// Live polling strategy (two speeds):
//
//   Every 10 s  →  /livescores/latest  (1 API call)
//                  Only returns fixtures that changed in the last 10 s.
//                  Merges score + status into current state silently.
//                  Empty response = no re-render. 95% cheaper than full fetch.
//
//   Every 60 s  →  full re-fetch (getFixturesByDate + getLeaguesByDate)
//                  Syncs state changes: scheduled→live, live→finished,
//                  new matches appearing, league groupings, etc.
//
// This matches SportMonks' own recommended polling strategy and keeps us well
// within the 3,000 calls/entity/hour rate limit even with many active users.

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getFixturesByDate, groupMatchesByLeague, fetchLatestLivescoreUpdates,
  reapplyLiveStatus,
  type LeagueWithMatches,
} from '../services/sportsApi';
import type { Match } from '../data/types';

/** Fast poll: score/status updates via /livescores/latest (ms) */
const SCORE_POLL_MS = 10_000;
/** Full re-sync interval: how many fast ticks before a complete re-fetch */
const FULL_SYNC_EVERY = 6; // 6 × 10 s = 60 s
/** Scheduled-match check interval (no live games active) */
const SCHEDULED_POLL_MS = 60_000;

/** Returns "YYYY-MM-DD" in local time */
function localDateString(d = new Date()): string {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

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
  /** True when auto-refresh is active (live matches or scheduled on today) */
  isPolling: boolean;
}

export function useFixtures(date: string): UseFixturesResult {
  const [matches, setMatches] = useState<Match[]>([]);
  const [leagues, setLeagues] = useState<LeagueWithMatches[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  // Tracked as real state (not just a ref) so the polling effect re-runs and
  // resets the interval speed when live mode ends (prevents the 10s interval
  // from staying active and firing load() every 10s after all games finish).
  const [isLive, setIsLive] = useState(false);

  const isMounted = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Always-current refs so interval callbacks don't capture stale state
  const matchesRef = useRef<Match[]>([]);
  const leaguesRef = useRef<LeagueWithMatches[]>([]);
  const isLiveRef  = useRef(false);
  const tickRef    = useRef(0); // counts fast-poll ticks for full-sync cadence

  useEffect(() => { matchesRef.current = matches; }, [matches]);
  useEffect(() => { leaguesRef.current = leagues; }, [leagues]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // ── Full load/refresh ────────────────────────────────────────────────────
  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      // One API call: getFixturesByDate reads/writes cache; leagues are derived
      // synchronously so we never call fetchFixturesWithLiveState twice.
      const matchData  = await getFixturesByDate(date);
      const leagueData = groupMatchesByLeague(matchData);
      if (!isMounted.current) return;
      setMatches(matchData);
      setLeagues(leagueData);

      const hasLive          = matchData.some(m => m.status === 'live');
      const hasScheduledToday = date === localDateString() &&
                                matchData.some(m => m.status === 'scheduled');
      isLiveRef.current = hasLive;
      setIsLive(hasLive);
      tickRef.current = 0; // reset sync counter after a full load
      setIsPolling(hasLive || hasScheduledToday);
    } catch (err: unknown) {
      if (!isMounted.current) return;
      setError(err instanceof Error ? err.message : 'Error loading fixtures');
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [date]);

  // Load on mount and when date changes
  useEffect(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    load(false);
  }, [load]);

  // ── Polling ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (!isPolling) return;

    // Use isLive state (not ref) here: this line runs when the effect fires,
    // which is exactly when isLive changed — guaranteeing the right interval.
    const interval = isLive ? SCORE_POLL_MS : SCHEDULED_POLL_MS;

    pollTimerRef.current = setInterval(async () => {
      if (!isMounted.current) return;

      if (!isLiveRef.current) {
        // Scheduled mode: full refresh to catch kickoffs
        load(false);
        return;
      }

      tickRef.current += 1;
      const doFullSync = tickRef.current >= FULL_SYNC_EVERY;

      if (doFullSync) {
        // ── Every 60 s: full re-fetch ─────────────────────────────────────
        tickRef.current = 0;
        try {
          // Invalidate the cache so the full sync always fetches fresh data,
          // then derive leagues synchronously (zero extra API call).
          const { AppCache } = await import('../services/cache');
          AppCache.invalidate(`fixtures_${date}`);

          const matchData  = await getFixturesByDate(date);
          const leagueData = groupMatchesByLeague(matchData);
          if (!isMounted.current) return;
          setMatches(matchData);
          setLeagues(leagueData);

          const stillLive = matchData.some(m => m.status === 'live');
          const stillScheduled = date === localDateString() &&
                                  matchData.some(m => m.status === 'scheduled');

          isLiveRef.current = stillLive;
          // Setting isLive as state (not just ref) causes the polling effect to
          // re-run → resets the interval to SCHEDULED_POLL_MS (60s) if live
          // mode just ended, preventing 10s polling after all games finish.
          setIsLive(stillLive);
          if (!stillLive && !stillScheduled) setIsPolling(false);
        } catch { /* keep polling on network error */ }
      } else {
        // ── Every 10 s: quick score + status merge ────────────────────────
        try {
          const updates = await fetchLatestLivescoreUpdates();
          if (!isMounted.current || updates.size === 0) return; // nothing changed

          // After the merge we always run reapplyLiveStatus over the whole list.
          // This re-promotes any match left as 'scheduled' (either in the prev
          // state or by a weak patch) back to 'live' via time-based inference.
          // Without this step, a match at minute 70+ whose state_id=1 lags on
          // the feed stays visually 'scheduled' even as its real minute climbs.
          setMatches(prev => {
            let changed = false;
            const merged = prev.map(m => {
              const u = updates.get(Number(m.id));
              if (!u) return m;
              changed = true;
              return { ...m, ...u };
            });
            if (!changed) return prev;
            return reapplyLiveStatus(merged);
          });

          setLeagues(prev => {
            let changed = false;
            const next = prev.map(lg => {
              let lgChanged = false;
              const updatedMatches = lg.matches.map(m => {
                const u = updates.get(Number(m.id));
                if (!u) return m;
                lgChanged = true;
                changed = true;
                return { ...m, ...u };
              });
              return lgChanged
                ? { ...lg, matches: reapplyLiveStatus(updatedMatches) }
                : lg;
            });
            return changed ? next : prev;
          });
        } catch { /* silently ignore — will retry in 10 s */ }
      }
    }, interval);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  // isLive in deps: when live mode ends, effect re-runs → interval resets to
  // SCHEDULED_POLL_MS (60s) instead of staying stuck at the 10s live cadence.
  }, [isPolling, isLive, date, load]);

  const refresh = useCallback(() => { load(true); }, [load]);

  return { matches, leagues, loading, refreshing, error, refresh, isPolling };
}
