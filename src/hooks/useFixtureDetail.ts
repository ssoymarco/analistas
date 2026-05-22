// ── useFixtureDetail — Firestore-backed match detail (zero SM calls per user)
//
// Previous version called SportMonks `/fixtures/{id}` on mount AND polled it
// every 10s while the match was live (360 calls/hour PER concurrent viewer
// → instantly blew past the 3,000/hour per-entity cap with even a handful
// of users).
//
// New design:
//   1. Subscribe to `matches/{id}` in Firestore via onSnapshot.
//   2. Cloud Functions write all data to that doc:
//      - `pollLivescores` (every 15s for live matches): writes events,
//        statistics, periods, score, state.
//      - `syncMatchEnrichment` (every 5 min for hot-window matches):
//        writes lineups, venue, referees, h2h, sidelined, predictions, etc.
//   3. Client reads the doc and assembles MatchDetail with the existing
//      mapper (`buildFixtureDetailFromFirestoreData`).
//   4. Updates from the server arrive in the client within ~100ms of the
//      Cloud Function write — same UX as polling, zero per-user SM calls.
//
// Fallback: when the doc isn't yet enriched (very cold match outside the
// hot window), we make ONE proxy call to populate the screen and let the
// scheduled enrichment catch up. Used only on first ever view.

import { useState, useEffect, useRef } from 'react';
import { getFixtureDetail } from '../services/sportsApi';
import { subscribeMatchDetail } from '../services/firestoreApi';
import type { Match, MatchDetail } from '../data/types';

interface UseFixtureDetailResult {
  detail: MatchDetail | null;
  /** Updated Match from the API — has current score, status, minute. Use this for display. */
  liveMatch: Match | null;
  loading: boolean;
  error: string | null;
}

/** Maps a raw API result to the MatchDetail shape used by the UI. */
function mapDetail(result: NonNullable<Awaited<ReturnType<typeof getFixtureDetail>>>): MatchDetail {
  const partial = result.detail;
  return {
    matchId: result.match.id,
    venue:            partial.venue            ?? { name: 'Estadio', city: '', capacity: 0, surface: 'grass' },
    referee:          partial.referee          ?? { name: 'Árbitro', nationality: '', flag: '' },
    assistantReferees: partial.assistantReferees,
    fourthOfficial:   partial.fourthOfficial,
    refereeStats:     partial.refereeStats,
    weather:          partial.weather,
    events:           partial.events           ?? [],
    statistics:       partial.statistics       ?? [],
    homeLineup:       partial.homeLineup       ?? { formation: '?', starters: [], bench: [], coach: '', coachNationality: '' },
    awayLineup:       partial.awayLineup       ?? { formation: '?', starters: [], bench: [], coach: '', coachNationality: '' },
    homePlayerRatings: partial.homePlayerRatings ?? [],
    awayPlayerRatings: partial.awayPlayerRatings ?? [],
    odds:             partial.odds             ?? [],
    h2h:              partial.h2h              ?? { homeTeam: '', awayTeam: '', results: [] },
    missingPlayers:   partial.missingPlayers   ?? { home: [], away: [] },
    tvStations:       partial.tvStations,
    commentaries:     partial.commentaries,
    resultInfo:       partial.resultInfo,
    predictions:      partial.predictions,
    homeForm:         partial.homeForm,
    awayForm:         partial.awayForm,
    pressureIndex:    partial.pressureIndex,
    aggregateScore:   partial.aggregateScore,
  };
}

export function useFixtureDetail(
  matchId: string,
  _homeTeamId?: number,    // kept for API compatibility
  _awayTeamId?: number,
  _matchStatus?: string,
): UseFixtureDetailResult {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [liveMatch, setLiveMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const didProxyFallbackRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Reset fallback flag when matchId changes
  useEffect(() => {
    didProxyFallbackRef.current = false;
  }, [matchId]);

  useEffect(() => {
    if (!matchId) return;
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeMatchDetail(
      matchId,
      sub => {
        if (!mounted.current) return;

        // Always update liveMatch with the basic match shape (score, status,
        // minute — these come from pollLivescores even before enrichment).
        if (sub.match) setLiveMatch(sub.match);

        if (sub.isEnriched && sub.detail) {
          // Firestore has the full enrichment → render from it. Zero SM calls.
          setDetail(mapDetail({ match: sub.match!, detail: sub.detail }));
          setLoading(false);
        } else if (sub.match && !sub.isEnriched && !didProxyFallbackRef.current) {
          // Match exists in Firestore but enrichment hasn't been written yet
          // (cold match outside the hot window). Make ONE proxy call to
          // populate the screen — scheduled enrichment will catch up by the
          // next 5-min tick.
          didProxyFallbackRef.current = true;
          getFixtureDetail(Number(matchId))
            .then(result => {
              if (!mounted.current || !result) return;
              setDetail(mapDetail(result));
              setLoading(false);
            })
            .catch(err => {
              if (!mounted.current) return;
              setError(err instanceof Error ? err.message : 'Error loading match');
              setLoading(false);
            });
        } else if (!sub.match) {
          // No doc at all in Firestore — proxy fallback once
          if (!didProxyFallbackRef.current) {
            didProxyFallbackRef.current = true;
            getFixtureDetail(Number(matchId))
              .then(result => {
                if (!mounted.current) return;
                if (!result) {
                  setError('No se pudo cargar el detalle del partido');
                } else {
                  setDetail(mapDetail(result));
                  setLiveMatch(result.match);
                }
                setLoading(false);
              })
              .catch(err => {
                if (!mounted.current) return;
                setError(err instanceof Error ? err.message : 'Error loading match');
                setLoading(false);
              });
          }
        }
      },
      err => {
        if (!mounted.current) return;
        // Firestore subscription failed — fall back to proxy once
        if (didProxyFallbackRef.current) return;
        didProxyFallbackRef.current = true;
        console.warn('[useFixtureDetail] Firestore unavailable, using proxy:', err.message);
        getFixtureDetail(Number(matchId))
          .then(result => {
            if (!mounted.current || !result) return;
            setDetail(mapDetail(result));
            setLiveMatch(result.match);
            setLoading(false);
          })
          .catch(e => {
            if (!mounted.current) return;
            setError(e instanceof Error ? e.message : 'Error loading match');
            setLoading(false);
          });
      },
    );

    return unsubscribe;
  }, [matchId]);

  return { detail, liveMatch, loading, error };
}
