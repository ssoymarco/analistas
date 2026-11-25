// ── useFixtureDetail — everything behind the match screen, in real time ──────
//
// Subscribes to the match in Firestore (see subscribeMatchDetail):
//   • fb_matches/{id}        score, status, clock — pushed by the live poller
//   • fb_match_details/{id}  events, lineups, statistics, ratings
//   • fb_match_previews/{id} H2H, absences, form, prediction, stadium
//
// For the big leagues the backend keeps the detail fresh on its own; for any
// other match the subscription asks the `fbOnDemand` function to fetch it the
// first time somebody opens it. Either way this hook only reads Firestore —
// the app makes no calls to the data provider.

import { useState, useEffect, useRef } from 'react';
import { subscribeMatchDetail } from '../services/football/matches';
import type { Match, MatchDetail } from '../data/types';

interface UseFixtureDetailResult {
  detail: MatchDetail | null;
  /** Fresh match row — current score, status, minute. Use this for display. */
  liveMatch: Match | null;
  loading: boolean;
  error: string | null;
}

/** How long to wait for the match row before telling the user it couldn't load. */
const NOT_FOUND_AFTER_MS = 12_000;

export function useFixtureDetail(
  matchId: string,
  _homeTeamId?: number | string,    // kept for call-site compatibility
  _awayTeamId?: number | string,
  _matchStatus?: string,
): UseFixtureDetailResult {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [liveMatch, setLiveMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!matchId) return;
    setLoading(true);
    setError(null);
    setDetail(null);
    setLiveMatch(null);
    let gotMatch = false;

    // A match that isn't stored yet (older than the synced window) is fetched
    // on demand; give that a moment before declaring it missing.
    const notFoundTimer = setTimeout(() => {
      if (!mounted.current || gotMatch) return;
      setError('No se pudo cargar el detalle del partido');
      setLoading(false);
    }, NOT_FOUND_AFTER_MS);

    const unsubscribe = subscribeMatchDetail(
      matchId,
      sub => {
        if (!mounted.current || !sub.match || !sub.detail) return;
        gotMatch = true;
        clearTimeout(notFoundTimer);
        setLiveMatch(sub.match);
        setDetail(sub.detail);
        setError(null);
        setLoading(false);
      },
      err => {
        if (!mounted.current || gotMatch) return;
        clearTimeout(notFoundTimer);
        setError(err.message || 'Error loading match');
        setLoading(false);
      },
    );

    return () => {
      clearTimeout(notFoundTimer);
      unsubscribe();
    };
  }, [matchId]);

  return { detail, liveMatch, loading, error };
}
