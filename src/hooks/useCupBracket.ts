// ── useCupBracket — React hook for knockout competition brackets ──────────────
import { useState, useEffect } from 'react';
import { InteractionManager } from 'react-native';
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
  isPlayoffsOnly?: boolean,
): UseCupBracketResult {
  const [rounds, setRounds]   = useState<CupRound[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!seasonId || seasonId <= 0) {
      setRounds([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    // Defer the fetch until navigation animation completes so the transition
    // doesn't block on the Firestore round-trip + synchronous bracket assembly.
    // On cache hit (memory or AsyncStorage) the work is near-zero anyway.
    const task = InteractionManager.runAfterInteractions(() => {
      getCupBracket(seasonId, currentFixtureId, isPlayoffsOnly)
        .then(data => {
          if (cancelled) return;
          setRounds(data);
          setLoading(false);
        })
        .catch(err => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : 'Error al cargar el bracket');
          setLoading(false);
        });
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [seasonId, currentFixtureId, isPlayoffsOnly]);

  return { rounds, loading, error };
}
