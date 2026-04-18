// ── useFixtureDetail — loads full match data from SportMonks API ─────────────
// For live matches, silently re-fetches every LIVE_POLL_MS milliseconds so the
// user sees score updates, events and stats without needing to pull-to-refresh.
import { useState, useEffect, useRef } from 'react';
import { getFixtureDetail } from '../services/sportsApi';
import type { Match, MatchDetail } from '../data/types';

/** Re-fetch interval for live matches.
 *  10 s matches SportMonks' own recommended polling cadence for /livescores.
 *  SportMonks publishes goal events within ~10 s of real time.
 *  Cost: 1 API call/10 s = 360 calls/hour, well within the 3000/hour limit. */
const LIVE_POLL_MS = 10_000;

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
  };
}

/**
 * @param matchId     Fixture ID
 * @param homeTeamId  Used as effect dependency so the hook resets on match change
 * @param awayTeamId  Same
 * @param matchStatus Pass match.status ('live' | 'scheduled' | 'finished').
 *                    When 'live', the hook polls silently every 25 s.
 */
export function useFixtureDetail(
  matchId: string,
  homeTeamId: string,
  awayTeamId: string,
  matchStatus?: string,
): UseFixtureDetailResult {
  const [detail, setDetail]       = useState<MatchDetail | null>(null);
  const [liveMatch, setLiveMatch] = useState<Match | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);

    getFixtureDetail(Number(matchId))
      .then(result => {
        if (!mounted.current) return;
        if (!result) {
          setDetail(null);
          setLiveMatch(null);
          setError('No se pudo cargar el detalle del partido');
        } else {
          setDetail(mapDetail(result));
          setLiveMatch(result.match); // ← real score + status from API
        }
        setLoading(false);
      })
      .catch(err => {
        if (!mounted.current) return;
        setDetail(null);
        setLiveMatch(null);
        setError(err instanceof Error ? err.message : 'Error loading match');
        setLoading(false);
      });
  }, [matchId, homeTeamId, awayTeamId]);

  // ── Live polling — silent refresh every 10 s ────────────────────────────────
  useEffect(() => {
    if (matchStatus !== 'live') return;

    const poll = setInterval(async () => {
      if (!mounted.current) return;
      try {
        const result = await getFixtureDetail(Number(matchId));
        if (!mounted.current || !result) return;
        setDetail(mapDetail(result));
        setLiveMatch(result.match); // ← keeps score/minute fresh
      } catch {
        // Silently ignore polling errors — user still sees last known data
      }
    }, LIVE_POLL_MS);

    return () => clearInterval(poll);
  }, [matchId, matchStatus]);

  return { detail, liveMatch, loading, error };
}
