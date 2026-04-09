// ── useTopScorers — React hook for season top scorers ───────────────────────
import { useState, useEffect, useRef } from 'react';
import { getTopScorers, type TopScorer } from '../services/sportsApi';

interface UseTopScorersResult {
  scorers: TopScorer[];
  loading: boolean;
  error: string | null;
}

export function useTopScorers(seasonId: number | null): UseTopScorersResult {
  const [scorers, setScorers] = useState<TopScorer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (!seasonId) {
      setScorers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    getTopScorers(seasonId)
      .then(data => {
        if (isMounted.current) {
          setScorers(data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted.current) {
          setError(err instanceof Error ? err.message : 'Error loading top scorers');
          setLoading(false);
        }
      });
  }, [seasonId]);

  return { scorers, loading, error };
}
