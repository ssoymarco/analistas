// ── useFixtureDetail — loads full match data from SportMonks API ─────────────
import { useState, useEffect, useRef } from 'react';
import { getFixtureDetail } from '../services/sportsApi';
import type { MatchDetail } from '../data/types';

interface UseFixtureDetailResult {
  detail: MatchDetail | null;
  loading: boolean;
  error: string | null;
}

export function useFixtureDetail(matchId: string, homeTeamId: string, awayTeamId: string): UseFixtureDetailResult {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    getFixtureDetail(Number(matchId))
      .then(result => {
        if (!mounted.current) return;
        if (!result) {
          setDetail(null);
          setError('No se pudo cargar el detalle del partido');
        } else {
          const partial = result.detail;
          setDetail({
            matchId: result.match.id,
            venue: partial.venue ?? { name: 'Estadio', city: '', capacity: 0, surface: 'grass' },
            referee: partial.referee ?? { name: 'Árbitro', nationality: '', flag: '' },
            assistantReferees: partial.assistantReferees,
            fourthOfficial: partial.fourthOfficial,
            refereeStats: partial.refereeStats,
            weather: partial.weather,
            events: partial.events ?? [],
            statistics: partial.statistics ?? [],
            homeLineup: partial.homeLineup ?? { formation: '?', starters: [], bench: [], coach: '', coachNationality: '' },
            awayLineup: partial.awayLineup ?? { formation: '?', starters: [], bench: [], coach: '', coachNationality: '' },
            homePlayerRatings: partial.homePlayerRatings ?? [],
            awayPlayerRatings: partial.awayPlayerRatings ?? [],
            odds: partial.odds ?? [],
            h2h: partial.h2h ?? { homeTeam: '', awayTeam: '', results: [] },
            missingPlayers: partial.missingPlayers ?? { home: [], away: [] },
            tvStations: partial.tvStations,
            commentaries: partial.commentaries,
            resultInfo: partial.resultInfo,
            predictions: partial.predictions,
            homeForm: partial.homeForm,
            awayForm: partial.awayForm,
            pressureIndex: partial.pressureIndex,
          });
        }
        setLoading(false);
      })
      .catch(err => {
        if (!mounted.current) return;
        setDetail(null);
        setError(err instanceof Error ? err.message : 'Error loading match');
        setLoading(false);
      });
  }, [matchId, homeTeamId, awayTeamId]);

  return { detail, loading, error };
}
