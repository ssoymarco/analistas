"use strict";
/**
 * config.ts
 *
 * SportMonks API configuration + league registry for Cloud Functions.
 * When expanding to 120 leagues, add entries to LEAGUES array.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEAGUES = exports.MAX_ENRICHMENTS_PER_RUN = exports.POLLS_PER_INVOCATION = exports.LIVESCORE_POLL_INTERVAL_SEC = exports.SM_TIMEOUT = exports.SM_BASE_URL = exports.SM_API_TOKEN = void 0;
exports.getLeagueIdsCsv = getLeagueIdsCsv;
exports.getLeagueIdChunks = getLeagueIdChunks;
exports.getLeagueConfig = getLeagueConfig;
exports.getLeaguesWithSeason = getLeaguesWithSeason;
// ── SportMonks API ──────────────────────────────────────────────────────────
exports.SM_API_TOKEN = 'fJSTWbE3MXoQFM8cOTbZcoEomEMx9xJEh9F77IGS7RKjs2wGHd0vQDNanYIN';
exports.SM_BASE_URL = 'https://api.sportmonks.com/v3/football';
/** Timeout for each SportMonks API request (ms) */
exports.SM_TIMEOUT = 15_000;
// ── Polling Intervals ───────────────────────────────────────────────────────
/** Seconds between livescore polls within a single Cloud Function invocation */
exports.LIVESCORE_POLL_INTERVAL_SEC = 15;
/** Number of polls per Cloud Function invocation (1 invocation = 1 minute) */
exports.POLLS_PER_INVOCATION = 4;
/** Max live matches to enrich per invocation (rate limit safety) */
exports.MAX_ENRICHMENTS_PER_RUN = 20;
/**
 * All available leagues.
 * Currently 2 leagues (free plan). Expand to 120 with Pro plan.
 * Update currentSeasonId each season start.
 */
exports.LEAGUES = [
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
function getLeagueIdsCsv() {
    return exports.LEAGUES.map(l => l.id).join(',');
}
/**
 * Split league IDs into chunks for API requests (avoid URL length limits).
 * Returns arrays of comma-separated ID strings, each with max `chunkSize` leagues.
 */
function getLeagueIdChunks(chunkSize = 25) {
    const ids = exports.LEAGUES.map(l => l.id);
    const chunks = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
        chunks.push(ids.slice(i, i + chunkSize).join(','));
    }
    return chunks;
}
/** Find a league config by SportMonks id */
function getLeagueConfig(id) {
    return exports.LEAGUES.find(l => l.id === id);
}
/** Get all leagues that have a valid currentSeasonId */
function getLeaguesWithSeason() {
    return exports.LEAGUES.filter(l => l.currentSeasonId !== null);
}
//# sourceMappingURL=config.js.map