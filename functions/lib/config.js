"use strict";
/**
 * config.ts
 *
 * SportMonks API configuration + league registry for Cloud Functions.
 * When expanding to 120 leagues, add entries to LEAGUES array.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEAGUES = exports.MAX_ENRICHMENTS_PER_RUN = exports.POLLS_PER_INVOCATION = exports.LIVESCORE_POLL_INTERVAL_SEC = exports.SM_TIMEOUT = exports.SM_BASE_URL = exports.SPORTMONKS_TOKEN = void 0;
exports.getSportmonksToken = getSportmonksToken;
exports.getLeagueIdsCsv = getLeagueIdsCsv;
exports.getLeagueIdChunks = getLeagueIdChunks;
exports.getLeagueConfig = getLeagueConfig;
exports.getLeaguesWithSeason = getLeaguesWithSeason;
// ── SportMonks API ──────────────────────────────────────────────────────────
const params_1 = require("firebase-functions/params");
/**
 * SportMonks API token — stored as a Firebase Secret (not in code).
 * Set it once with:  firebase functions:secrets:set SPORTMONKS_TOKEN
 * Every function that calls SportMonks must declare it in its `secrets: [...]` option.
 */
exports.SPORTMONKS_TOKEN = (0, params_1.defineSecret)('SPORTMONKS_TOKEN');
/**
 * Resolve the SportMonks token at runtime. Two sources, in order:
 *   1. Firebase Secret (when running inside a Cloud Function that binds
 *      SPORTMONKS_TOKEN in its `secrets: []` option).
 *   2. `process.env.SPORTMONKS_TOKEN` (for local scripts / CI / one-off
 *      crawls that don't run inside a Firebase function).
 *
 * Throws if neither source has a value.
 */
function getSportmonksToken() {
    // 1. Cloud Function runtime
    try {
        const fromSecret = exports.SPORTMONKS_TOKEN.value();
        if (fromSecret)
            return fromSecret;
    }
    catch {
        // Reading defineSecret outside a function context can throw — fall through.
    }
    // 2. Local script / CI environment
    const fromEnv = process.env.SPORTMONKS_TOKEN;
    if (fromEnv)
        return fromEnv;
    throw new Error('SPORTMONKS_TOKEN is not set. Either bind the Firebase secret in `secrets: [SPORTMONKS_TOKEN]` ' +
        'or export SPORTMONKS_TOKEN in your local environment before running the script.');
}
exports.SM_BASE_URL = 'https://api.sportmonks.com/v3/football';
/** Timeout for each SportMonks API request (ms) */
exports.SM_TIMEOUT = 15_000;
// ── Polling Intervals ───────────────────────────────────────────────────────
/**
 * Seconds between livescore polls within a single Cloud Function invocation.
 * Lowered from 15s → 4s on 2026-05-28 to push score/minute freshness closer
 * to real-time on the client (live tick + push notifications). SportMonks Pro
 * limit is 3000 calls/h per entity → 4s × 15/min × 60 = 900/h = 30% of quota
 * on livescores alone, comfortable margin for other endpoints.
 */
exports.LIVESCORE_POLL_INTERVAL_SEC = 4;
/**
 * Number of polls per Cloud Function invocation. The scheduled trigger fires
 * every 1 minute, and we sleep LIVESCORE_POLL_INTERVAL_SEC between polls, so
 * POLLS_PER_INVOCATION × LIVESCORE_POLL_INTERVAL_SEC ≈ 60s.
 *
 * 15 × 4s = 60s → fits exactly in one scheduled invocation.
 */
exports.POLLS_PER_INVOCATION = 15;
/** Max live matches to enrich per invocation (rate limit safety) */
exports.MAX_ENRICHMENTS_PER_RUN = 20;
/**
 * All available leagues.
 * Currently 2 leagues (free plan). Expand to 120 with Pro plan.
 * Update currentSeasonId each season start.
 */
exports.LEAGUES = [
    // ── Europe — Top 5 ────────────────────────────────────────────────────────
    { id: 8, name: 'Premier League', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', currentSeasonId: 25583 },
    { id: 564, name: 'La Liga', country: 'Spain', flag: '🇪🇸', currentSeasonId: 25659 },
    { id: 82, name: 'Bundesliga', country: 'Germany', flag: '🇩🇪', currentSeasonId: 25646 },
    { id: 384, name: 'Serie A', country: 'Italy', flag: '🇮🇹', currentSeasonId: 25533 },
    { id: 301, name: 'Ligue 1', country: 'France', flag: '🇫🇷', currentSeasonId: 25651 },
    // ── Europe — Segundas divisiones ──────────────────────────────────────────
    { id: 9, name: 'Championship', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', currentSeasonId: 25648 },
    { id: 567, name: 'La Liga 2', country: 'Spain', flag: '🇪🇸', currentSeasonId: 25673 },
    { id: 85, name: '2. Bundesliga', country: 'Germany', flag: '🇩🇪', currentSeasonId: 25652 },
    { id: 387, name: 'Serie B', country: 'Italy', flag: '🇮🇹', currentSeasonId: 26164 },
    { id: 304, name: 'Ligue 2', country: 'France', flag: '🇫🇷', currentSeasonId: 25658 },
    // ── Europe — Otros ────────────────────────────────────────────────────────
    { id: 462, name: 'Liga Portugal', country: 'Portugal', flag: '🇵🇹', currentSeasonId: 25745 },
    { id: 72, name: 'Eredivisie', country: 'Netherlands', flag: '🇳🇱', currentSeasonId: 25597 },
    { id: 208, name: 'Pro League', country: 'Belgium', flag: '🇧🇪', currentSeasonId: 25600 },
    { id: 600, name: 'Süper Lig', country: 'Turkey', flag: '🇹🇷', currentSeasonId: 25682 },
    { id: 501, name: 'Premiership', country: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', currentSeasonId: 25598 },
    { id: 271, name: 'Superliga', country: 'Denmark', flag: '🇩🇰', currentSeasonId: 25536 },
    { id: 486, name: 'Premier League', country: 'Russia', flag: '🇷🇺', currentSeasonId: 25599 },
    { id: 806, name: 'Premier League', country: 'Egypt', flag: '🇪🇬', currentSeasonId: 26173 },
    { id: 860, name: 'Botola Pro', country: 'Morocco', flag: '🇲🇦', currentSeasonId: 26027 },
    // ── Europe — Copas ────────────────────────────────────────────────────────
    { id: 24, name: 'FA Cup', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', currentSeasonId: 25919 },
    { id: 570, name: 'Copa del Rey', country: 'Spain', flag: '🇪🇸', currentSeasonId: 26557 },
    { id: 109, name: 'DFB Pokal', country: 'Germany', flag: '🇩🇪', currentSeasonId: 25548 },
    { id: 390, name: 'Coppa Italia', country: 'Italy', flag: '🇮🇹', currentSeasonId: 25642 },
    { id: 307, name: 'Coupe de France', country: 'France', flag: '🇫🇷', currentSeasonId: 26654 },
    { id: 27, name: 'Carabao Cup', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', currentSeasonId: 25654 },
    // ── Américas — Ligas principales ──────────────────────────────────────────
    { id: 743, name: 'Liga MX', country: 'Mexico', flag: '🇲🇽', currentSeasonId: 25539 },
    { id: 779, name: 'Major League Soccer', country: 'USA', flag: '🇺🇸', currentSeasonId: 26720 },
    { id: 636, name: 'Liga Profesional', country: 'Argentina', flag: '🇦🇷', currentSeasonId: 26808 },
    { id: 648, name: 'Brasileirão Serie A', country: 'Brazil', flag: '🇧🇷', currentSeasonId: 26763 },
    { id: 672, name: 'Liga BetPlay', country: 'Colombia', flag: '🇨🇴', currentSeasonId: 26881 },
    { id: 663, name: 'Primera División', country: 'Chile', flag: '🇨🇱', currentSeasonId: 26873 },
    { id: 687, name: 'Primera División', country: 'Uruguay', flag: '🇺🇾', currentSeasonId: 25761 },
    { id: 702, name: 'Primera División', country: 'Paraguay', flag: '🇵🇾', currentSeasonId: 25889 },
    { id: 708, name: 'Primera División', country: 'Peru', flag: '🇵🇪', currentSeasonId: 25594 },
    { id: 696, name: 'Liga Pro', country: 'Ecuador', flag: '🇪🇨', currentSeasonId: 27249 },
    { id: 734, name: 'Liga Nacional', country: 'Honduras', flag: '🇭🇳', currentSeasonId: 25763 },
    // ── Américas — Segundas + copas ───────────────────────────────────────────
    { id: 749, name: 'Liga de Expansión MX', country: 'Mexico', flag: '🇲🇽', currentSeasonId: 25886 },
    { id: 645, name: 'Primera B Nacional', country: 'Argentina', flag: '🇦🇷', currentSeasonId: 26809 },
    { id: 651, name: 'Brasileirão Serie B', country: 'Brazil', flag: '🇧🇷', currentSeasonId: 27198 },
    { id: 654, name: 'Copa do Brasil', country: 'Brazil', flag: '🇧🇷', currentSeasonId: 27151 },
    // ── Asia + Medio Oriente ──────────────────────────────────────────────────
    { id: 944, name: 'Saudi Pro League', country: 'Saudi Arabia', flag: '🇸🇦', currentSeasonId: 26276 },
    { id: 968, name: 'J1 League', country: 'Japan', flag: '🇯🇵', currentSeasonId: 26810 },
    { id: 1034, name: 'K League 1', country: 'South Korea', flag: '🇰🇷', currentSeasonId: 26894 },
    { id: 902, name: 'Persian Gulf Pro League', country: 'Iran', flag: '🇮🇷', currentSeasonId: 26175 },
    // ── Europa — Copas continentales (UEFA) ───────────────────────────────────
    { id: 2, name: 'Champions League', country: 'Europe', flag: '⭐', currentSeasonId: 25580 },
    { id: 5, name: 'Europa League', country: 'Europe', flag: '🟠', currentSeasonId: 25582 },
    { id: 2286, name: 'Europa Conference League', country: 'Europe', flag: '🟢', currentSeasonId: 25581 },
    // ── Competiciones internacionales ─────────────────────────────────────────
    { id: 1122, name: 'Copa Libertadores', country: 'South America', flag: '🏆', currentSeasonId: 26784 },
    { id: 1116, name: 'Copa Sudamericana', country: 'South America', flag: '🏆', currentSeasonId: 26783 },
    { id: 1111, name: 'CONCACAF Champions Cup', country: 'North America', flag: '🏆', currentSeasonId: 26750 },
    { id: 1741, name: 'CONCACAF Nations League', country: 'North America', flag: '🏆', currentSeasonId: 27491 },
    { id: 1107, name: 'CAF Champions League', country: 'Africa', flag: '🏆', currentSeasonId: 26228 },
    { id: 1108, name: 'CAF Confederation Cup', country: 'Africa', flag: '🏆', currentSeasonId: 26264 },
    // ── Selecciones / mundialista ─────────────────────────────────────────────
    { id: 732, name: 'Mundial 2026', country: 'World', flag: '🌍', currentSeasonId: 26618 },
    // ── Otros + Femenil ───────────────────────────────────────────────────────
    { id: 1082, name: 'Amistosos Internacionales', country: 'World', flag: '🌍', currentSeasonId: 26758 },
    { id: 1579, name: 'Liga MX Femenil', country: 'Mexico', flag: '🇲🇽', currentSeasonId: 25595 },
    { id: 1568, name: 'Primera División Femenil', country: 'Spain', flag: '🇪🇸', currentSeasonId: 25801 },
    { id: 1419, name: 'UEFA Women\'s Champions League', country: 'Europe', flag: '🏆', currentSeasonId: 25515 },
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