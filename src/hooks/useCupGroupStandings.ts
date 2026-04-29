// ── useCupGroupStandings ───────────────────────────────────────────────────────
// Fetches the group-stage standings for a cup competition (e.g. Copa
// Libertadores Groups A–H, CONCACAF Champions Cup pools, etc.).
// Returns { hasGroups: false } for knockout-only competitions or while loading.
import { useState, useEffect, useRef } from 'react';
import { getCupGroupStandings } from '../services/sportsApi';
import type { CupGroupsResult } from '../data/types';

const EMPTY: CupGroupsResult = { hasGroups: false, groups: [] };

export function useCupGroupStandings(seasonId: number | null): {
  result: CupGroupsResult;
  loading: boolean;
} {
  const [result, setResult]   = useState<CupGroupsResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (!seasonId || seasonId <= 0) {
      setResult(EMPTY);
      setLoading(false);
      return;
    }

    setLoading(true);
    getCupGroupStandings(seasonId)
      .then(data => {
        if (!isMounted.current) return;
        setResult(data);
        setLoading(false);
      })
      .catch(() => {
        if (!isMounted.current) return;
        setLoading(false);
      });
  }, [seasonId]);

  return { result, loading };
}
