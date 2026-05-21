// ── useFixtures — date-based matches with Firestore real-time + proxy fallback
//
// Data sources:
//   • Firestore  → when the selected date is in the Cloud Functions sync
//                  window (±1 day from today). Real-time via onSnapshot — when
//                  the pollLivescores function writes a goal update to
//                  matches/{id}, this hook receives it within ~100ms with no
//                  client polling and zero SportMonks tokens consumed.
//
//   • SportMonks proxy → for dates outside the sync window (older history or
//                  far-future fixtures). Still cached locally via the existing
//                  sportsApi cache layer.
//
// The hook surface is unchanged from the previous polling-based implementation
// so PartidosScreen (and any future consumer) needs no changes.

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getFixturesByDate,
  groupMatchesByLeague,
  type LeagueWithMatches,
} from '../services/sportsApi';
import { subscribeFixturesByDate } from '../services/firestoreApi';
import type { Match } from '../data/types';

interface UseFixturesResult {
  /** All matches for the selected date */
  matches: Match[];
  /** Matches grouped by league */
  leagues: LeagueWithMatches[];
  /** True while the initial load is in progress */
  loading: boolean;
  /** True while a manual refresh is in progress */
  refreshing: boolean;
  /** Error message, if any */
  error: string | null;
  /** Trigger a manual refresh (for pull-to-refresh) */
  refresh: () => void;
  /** True when there's at least one live match (used to drive UI live indicator) */
  isPolling: boolean;
}

// ── Display sort: live first, then scheduled by kickoff time, then finished ──
function sortForDisplay(a: Match, b: Match): number {
  const order = { live: 0, scheduled: 1, finished: 2 };
  const so = order[a.status] - order[b.status];
  if (so !== 0) return so;
  // Within the same status, sort by start time (or id as final tiebreaker)
  const ta = a.startingAtUtc ?? '';
  const tb = b.startingAtUtc ?? '';
  if (ta !== tb) return ta.localeCompare(tb);
  return a.id.localeCompare(b.id);
}

export function useFixtures(date: string): UseFixturesResult {
  const [matches, setMatches]       = useState<Match[]>([]);
  const [leagues, setLeagues]       = useState<LeagueWithMatches[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [isPolling, setIsPolling]   = useState(false);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Apply sort + group in a single pass
  const commit = useCallback((raw: Match[]) => {
    const sorted = [...raw].sort(sortForDisplay);
    setMatches(sorted);
    setLeagues(groupMatchesByLeague(sorted));
    setIsPolling(sorted.some(m => m.status === 'live'));
  }, []);

  // Emergency-only proxy load. ALL date queries now read from Firestore (the
  // 2026-05 historical crawl wrote ~282k fixtures spanning every league SM
  // covers — there's no "outside the sync window" anymore). This function
  // is invoked exclusively when Firestore returns an error on the first
  // subscription emit (network down, permissions, etc.). Any other usage
  // would re-introduce per-user SportMonks calls and break the "scales to
  // any user count" property of the architecture.
  const loadFromProxyOnError = useCallback(async () => {
    setError(null);
    try {
      const data = await getFixturesByDate(date);
      if (!isMounted.current) return;
      commit(data);
    } catch (err) {
      if (!isMounted.current) return;
      setError(err instanceof Error ? err.message : 'Error loading fixtures');
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [date, commit]);

  // Main effect — always subscribe to Firestore. onSnapshot pushes server
  // changes (~100ms latency) so the displayed data is as fresh as anything
  // the proxy could fetch. Proxy fallback only fires on a hard error.
  useEffect(() => {
    setLoading(true);
    setError(null);
    let receivedFirstSnapshot = false;

    const unsubscribe = subscribeFixturesByDate(
      date,
      data => {
        if (!isMounted.current) return;
        receivedFirstSnapshot = true;
        commit(data);
        setLoading(false);
      },
      err => {
        if (!isMounted.current) return;
        // If we never got a first snapshot, fall back to the proxy fully.
        // If we did, keep the displayed data and report the error silently
        // — the next reconnection will resume the stream.
        if (!receivedFirstSnapshot) {
          console.warn('[useFixtures] Firestore unavailable, using proxy:', err.message);
          loadFromProxyOnError();
        }
      },
    );

    return unsubscribe;
  }, [date, commit, loadFromProxyOnError]);

  // Pull-to-refresh: no-op against the network. Firestore's onSnapshot is
  // already live — by the time the user releases the pull, the displayed
  // data is already current. We give a short visual refreshing pulse so the
  // gesture feels acknowledged.
  const refresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      if (isMounted.current) setRefreshing(false);
    }, 300);
  }, []);

  return { matches, leagues, loading, refreshing, error, refresh, isPolling };
}
