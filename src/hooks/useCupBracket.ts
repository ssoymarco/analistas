// ── useCupBracket — React hook for knockout competition brackets ──────────────
import { useState, useEffect, useRef } from 'react';
import { getCupBracket } from '../services/sportsApi';
import type { CupRound } from '../services/sportsApi';

interface UseCupBracketResult {
  rounds: CupRound[];
  loading: boolean;
  error: string | null;
}

export function useCupBracket(
  seasonId: number | null,
  currentFixtureId?: string,
): UseCupBracketResult {
  const [rounds, setRounds]   = useState<CupRound[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (!seasonId || seasonId <= 0) {
      setRounds([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    getCupBracket(seasonId, currentFixtureId)
      .then(data => {
        if (!isMounted.current) return;
        setRounds(data);
        setLoading(false);
      })
      .catch(err => {
        if (!isMounted.current) return;
        setError(err instanceof Error ? err.message : 'Error al cargar el bracket');
        setLoading(false);
      });
  }, [seasonId, currentFixtureId]);

  return { rounds, loading, error };
}
