// ── useAvailableSeasons ──────────────────────────────────────────────────────
// Real-time list of historical seasons for a league, powering the season
// picker in LeagueDetailScreen. Subscribes to season_index/{leagueId} so the
// dropdown updates the moment a new crawl pass adds a season.
import { useEffect, useState } from 'react';
import { subscribeAvailableSeasons, type AvailableSeason } from '../services/firestoreApi';

export function useAvailableSeasons(leagueId: number | null): AvailableSeason[] {
  const [seasons, setSeasons] = useState<AvailableSeason[]>([]);

  useEffect(() => {
    if (!leagueId) { setSeasons([]); return; }
    const unsub = subscribeAvailableSeasons(leagueId, setSeasons, err => {
      // eslint-disable-next-line no-console
      console.warn('[useAvailableSeasons] subscribe error:', err.message);
    });
    return unsub;
  }, [leagueId]);

  return seasons;
}
