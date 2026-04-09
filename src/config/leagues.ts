// ── League Configuration ─────────────────────────────────────────────────────
// Available leagues on the SportMonks free plan.
// Update currentSeasonId each season — it is used for standings, top scorers, etc.

export interface LeagueConfig {
  id: number;
  name: string;
  country: string;
  flag: string;
  currentSeasonId: number | null;
}

export const AVAILABLE_LEAGUES: LeagueConfig[] = [
  { id: 271, name: 'Danish Superliga', country: 'Denmark', flag: '🇩🇰', currentSeasonId: null },
  { id: 501, name: 'Scottish Premiership', country: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', currentSeasonId: 25598 },
];

/** Comma-separated league IDs for API filter params */
export const LEAGUE_IDS = AVAILABLE_LEAGUES.map((l) => l.id).join(',');

/** Find a league config by its SportMonks id */
export function getLeagueConfig(id: number): LeagueConfig | undefined {
  return AVAILABLE_LEAGUES.find((l) => l.id === id);
}
