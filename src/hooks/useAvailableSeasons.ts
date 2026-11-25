// ── useAvailableSeasons — seasons a league has (season picker) ───────────────
//
// Loaded once per league from `fb_leagues/{id}` (fetched on demand, cached for
// a week). Empty until it arrives — the picker hides itself meanwhile.
import { useEffect, useState } from 'react';
import { getAvailableSeasons, type AvailableSeason } from '../services/football/leagueData';

export function useAvailableSeasons(leagueId: number | null): AvailableSeason[] {
  const [seasons, setSeasons] = useState<AvailableSeason[]>([]);

  useEffect(() => {
    if (!leagueId) { setSeasons([]); return; }
    let cancelled = false;
    setSeasons([]);
    getAvailableSeasons(leagueId)
      .then(list => { if (!cancelled) setSeasons(list); })
      .catch(() => { /* picker stays hidden */ });
    return () => { cancelled = true; };
  }, [leagueId]);

  return seasons;
}
