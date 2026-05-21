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
import {
  subscribeFixturesByDate,
  isWithinFirestoreSyncWindow,
} from '../services/firestoreApi';
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

  const useFirestore = isWithinFirestoreSyncWindow(date);

  // Apply sort + group in a single pass
  const commit = useCallback((raw: Match[]) => {
    const sorted = [...raw].sort(sortForDisplay);
    setMatches(sorted);
    setLeagues(groupMatchesByLeague(sorted));
    setIsPolling(sorted.some(m => m.status === 'live'));
  }, []);

  // Proxy load — used outside the sync window, on Firestore errors, and on
  // manual pull-to-refresh (which hits Firestore's cached data + a proxy fresh
  // fetch in parallel, but we keep it simple and re-fetch from proxy).
  const loadFromProxy = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
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

  // Main effect — subscribe to Firestore or fetch from proxy
  useEffect(() => {
    if (useFirestore) {
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
          // If we did, keep the displayed data and report the error silently —
          // the next reconnection will resume the stream.
          if (!receivedFirstSnapshot) {
            console.warn('[useFixtures] Firestore unavailable, using proxy:', err.message);
            loadFromProxy(false);
          }
        },
      );

      return unsubscribe;
    }
    // Outside sync window — proxy only
    loadFromProxy(false);
  }, [date, useFirestore, commit, loadFromProxy]);

  const refresh = useCallback(() => loadFromProxy(true), [loadFromProxy]);

  return { matches, leagues, loading, refreshing, error, refresh, isPolling };
}
