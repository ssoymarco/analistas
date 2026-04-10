// ── useFixtureDetail — loads full match data (real API or mock) ──────────────
import { useState, useEffect, useRef } from 'react';
import { getFixtureDetail } from '../services/sportsApi';
import { getMatchDetail } from '../data/mockData';
import type { MatchDetail } from '../data/types';

interface UseFixtureDetailResult {
  detail: MatchDetail | null;
  loading: boolean;
  error: string | null;
}

/** IDs over 1000 are real SportMonks fixture IDs; small ones are mock */
function isRealFixture(id: string): boolean {
  const n = Number(id);
  return !isNaN(n) && n > 1000;
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

    if (!isRealFixture(matchId)) {
      // Mock data — synchronous lookup
      const mock = getMatchDetail(matchId);
      setDetail(mock ?? null);
      setLoading(false);
      return;
    }

    // Real SportMonks fixture
    getFixtureDetail(Number(matchId))
      .then(result => {
        if (!mounted.current) return;
        if (!result) {
          // API returned nothing — try mock as fallback
          setDetail(getMatchDetail(matchId) ?? null);
        } else {
          // Build a MatchDetail from the partial API data
          const partial = result.detail;
          setDetail({
            matchId: result.match.id,
            venue: partial.venue ?? { name: 'Estadio', city: '', capacity: 0, surface: 'grass' },
            referee: partial.referee ?? { name: 'Árbitro', nationality: '', flag: '' },
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
          });
        }
        setLoading(false);
      })
      .catch(err => {
        if (!mounted.current) return;
        // Try mock fallback on error
        const mock = getMatchDetail(matchId);
        setDetail(mock ?? null);
        setError(err instanceof Error ? err.message : 'Error loading match');
        setLoading(false);
      });
  }, [matchId, homeTeamId, awayTeamId]);

  return { detail, loading, error };
}
