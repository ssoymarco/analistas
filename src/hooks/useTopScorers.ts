// ── useTopScorers — top scorers of a season ──────────────────────────────────
//
// `seasonId` is a season key (league id × 10000 + season year). Read from
// `fb_topscorers` (refreshed daily for the big leagues, fetched on demand for
// the rest).
import { useState, useEffect, useRef } from 'react';
import { getTopScorers } from '../services/football/leagueData';

export interface TopScorerView {
  playerId: number;
  playerName: string;
  playerImage: string;
  goals: number;
  position: number;
  teamName: string;
  teamLogo: string;
}

interface UseTopScorersResult {
  scorers: TopScorerView[];
  loading: boolean;
  error: string | null;
}

export function useTopScorers(seasonId: number | null): UseTopScorersResult {
  const [scorers, setScorers] = useState<TopScorerView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const isMounted             = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (!seasonId || seasonId <= 0) {
      setScorers([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTopScorers(seasonId)
      .then(rows => {
        if (cancelled || !isMounted.current) return;
        setScorers(rows.map(r => ({
          playerId:    Number(r.playerId) || 0,
          playerName:  r.playerName,
          playerImage: r.playerImage,
          goals:       r.goals,
          position:    r.position,
          teamName:    r.teamName,
          teamLogo:    r.teamLogo,
        })));
        setLoading(false);
      })
      .catch(err => {
        if (cancelled || !isMounted.current) return;
        setError(err instanceof Error ? err.message : 'Error loading top scorers');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [seasonId]);

  return { scorers, loading, error };
}
