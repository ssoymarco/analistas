/**
 * config.ts
 *
 * SportMonks API configuration + league registry for Cloud Functions.
 * When expanding to 120 leagues, add entries to LEAGUES array.
 */

// ── SportMonks API ──────────────────────────────────────────────────────────

export const SM_API_TOKEN = 'fJSTWbE3MXoQFM8cOTbZcoEomEMx9xJEh9F77IGS7RKjs2wGHd0vQDNanYIN';
export const SM_BASE_URL  = 'https://api.sportmonks.com/v3/football';

/** Timeout for each SportMonks API request (ms) */
export const SM_TIMEOUT = 15_000;

// ── Polling Intervals ───────────────────────────────────────────────────────

/** Seconds between livescore polls within a single Cloud Function invocation */
export const LIVESCORE_POLL_INTERVAL_SEC = 15;

/** Number of polls per Cloud Function invocation (1 invocation = 1 minute) */
export const POLLS_PER_INVOCATION = 4;

/** Max live matches to enrich per invocation (rate limit safety) */
export const MAX_ENRICHMENTS_PER_RUN = 20;

// ── League Configuration ────────────────────────────────────────────────────

export interface LeagueConfig {
  id: number;
  name: string;
  country: string;
  flag: string;
  currentSeasonId: number | null;
}

/**
 * All available leagues.
 * Currently 2 leagues (free plan). Expand to 120 with Pro plan.
 * Update currentSeasonId each season start.
 */
export const LEAGUES: LeagueConfig[] = [
  { id: 271, name: 'Danish Superliga', country: 'Denmark', flag: '🇩🇰', currentSeasonId: 25536 },
  { id: 501, name: 'Scottish Premiership', country: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', currentSeasonId: 25598 },
  // ── Pro plan leagues (add as they are enabled) ────────────────────────────
  // { id: 8,   name: 'Premier League', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', currentSeasonId: null },
  // { id: 564, name: 'La Liga', country: 'Spain', flag: '🇪🇸', currentSeasonId: null },
  // { id: 82,  name: 'Bundesliga', country: 'Germany', flag: '🇩🇪', currentSeasonId: null },
  // { id: 384, name: 'Serie A', country: 'Italy', flag: '🇮🇹', currentSeasonId: null },
  // { id: 301, name: 'Ligue 1', country: 'France', flag: '🇫🇷', currentSeasonId: null },
  // { id: 309, name: 'Liga MX', country: 'Mexico', flag: '🇲🇽', currentSeasonId: null },
  // { id: 462, name: 'Brasileirão', country: 'Brazil', flag: '🇧🇷', currentSeasonId: null },
  // { id: 2,   name: 'Champions League', country: 'Europe', flag: '🇪🇺', currentSeasonId: null },
];

/** Comma-separated league IDs for SportMonks API filter params */
export function getLeagueIdsCsv(): string {
  return LEAGUES.map(l => l.id).join(',');
}

/**
 * Split league IDs into chunks for API requests (avoid URL length limits).
 * Returns arrays of comma-separated ID strings, each with max `chunkSize` leagues.
 */
export function getLeagueIdChunks(chunkSize = 25): string[] {
  const ids = LEAGUES.map(l => l.id);
  const chunks: string[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize).join(','));
  }
  return chunks;
}

/** Find a league config by SportMonks id */
export function getLeagueConfig(id: number): LeagueConfig | undefined {
  return LEAGUES.find(l => l.id === id);
}

/** Get all leagues that have a valid currentSeasonId */
export function getLeaguesWithSeason(): LeagueConfig[] {
  return LEAGUES.filter(l => l.currentSeasonId !== null);
}
