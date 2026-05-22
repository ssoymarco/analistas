"use strict";
/**
 * index.ts
 *
 * Cloud Functions entry point for Analistas.
 * Exports all scheduled functions that power the real-time backend.
 *
 * Functions:
 * - pollLivescores:   Every 1 min → 4 polls × 15s = real-time live scores
 * - syncFixtures:     Every 30 min → all matches for yesterday/today/tomorrow
 * - syncStandings:    Every 6 hours → league tables for all configured leagues
 * - syncTopScorers:   Every 12 hours → top scorers for all configured leagues
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncPlayers = exports.syncCoaches = exports.syncMatchEnrichment = exports.syncSquads = exports.syncTeams = exports.syncTopScorers = exports.syncStandings = exports.syncFixtures = exports.pollLivescores = void 0;
// IMPORTANT: admin-init must be imported first — it calls admin.initializeApp()
// before any other module touches admin.firestore().
require("./admin-init");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const config_1 = require("./config");
const poll_livescores_1 = require("./poll-livescores");
const sync_fixtures_1 = require("./sync-fixtures");
const sync_standings_1 = require("./sync-standings");
const sync_teams_1 = require("./sync-teams");
const sync_squads_1 = require("./sync-squads");
const sync_match_enrichment_1 = require("./sync-match-enrichment");
const sync_coaches_1 = require("./sync-coaches");
const sync_players_1 = require("./sync-players");
// ── Scheduled Functions ─────────────────────────────────────────────────────
/**
 * Poll livescores every 1 minute.
 * Internally runs 4 polls with 15-second delays for near-real-time updates.
 * Detects goals, match starts, and match endings.
 *
 * Region: us-central1 (default, lowest latency to SportMonks EU servers)
 * Timeout: 120s (4 polls × ~15s wait + API latency)
 * Memory: 256MB
 */
exports.pollLivescores = (0, scheduler_1.onSchedule)({
    schedule: 'every 1 minutes',
    timeoutSeconds: 120,
    memory: '256MiB',
    region: 'us-central1',
    retryCount: 0, // Don't retry — next invocation will run in 1 min anyway
    secrets: [config_1.SPORTMONKS_TOKEN],
}, async () => {
    await (0, poll_livescores_1.pollLivescoresHandler)();
});
/**
 * Sync all fixtures for yesterday, today, and tomorrow.
 * Keeps the matches collection fresh with scheduled/finished matches.
 *
 * Runs every 30 minutes.
 */
exports.syncFixtures = (0, scheduler_1.onSchedule)({
    schedule: 'every 30 minutes',
    timeoutSeconds: 300,
    memory: '512MiB',
    region: 'us-central1',
    retryCount: 1,
    secrets: [config_1.SPORTMONKS_TOKEN],
}, async () => {
    await (0, sync_fixtures_1.syncFixturesHandler)();
});
/**
 * Sync league standings for all configured leagues.
 * Runs every 1 hour — keeps tables fresh after match days.
 * Cost: 51 leagues × 24 executions/day = 1,224 calls/day (1.7% of Pro limit).
 * Future improvement: switch to event-driven sync from pollLivescores matchEnd.
 */
exports.syncStandings = (0, scheduler_1.onSchedule)({
    schedule: 'every 1 hours',
    timeoutSeconds: 540,
    memory: '256MiB',
    region: 'us-central1',
    retryCount: 1,
    secrets: [config_1.SPORTMONKS_TOKEN],
}, async () => {
    await (0, sync_standings_1.syncStandingsHandler)();
});
/**
 * Sync top scorers for all configured leagues.
 * Runs every 1 hour — keeps scorer rankings near-real-time so a goal at
 * 18:42 shows up in the table by 19:00 at the latest.
 * Cost: 51 leagues × 24 executions/day = 1,224 calls/day (1.7% of Pro limit).
 * Future improvement: switch to event-driven sync from pollLivescores matchEnd.
 */
exports.syncTopScorers = (0, scheduler_1.onSchedule)({
    schedule: 'every 1 hours',
    timeoutSeconds: 540,
    memory: '256MiB',
    region: 'us-central1',
    retryCount: 1,
    secrets: [config_1.SPORTMONKS_TOKEN],
}, async () => {
    await (0, sync_standings_1.syncTopScorersHandler)();
});
/**
 * Sync full team info (stadium, coach, founded, logo) for every team in
 * the configured leagues. Replaces per-user fetchTeamById proxy calls.
 *
 * Runs every 24 hours. Team metadata changes on a weekly-to-yearly scale,
 * so daily is generous.
 *
 * Cost: ~51 leagues × 1 paginated call/league = ~60-100 SM calls/day.
 * Timeout 540s; the handler sleeps 500ms between leagues to be a polite
 * API neighbour.
 */
exports.syncTeams = (0, scheduler_1.onSchedule)({
    schedule: 'every 24 hours',
    timeoutSeconds: 540,
    memory: '256MiB',
    region: 'us-central1',
    retryCount: 1,
    secrets: [config_1.SPORTMONKS_TOKEN],
}, async () => {
    await (0, sync_teams_1.syncTeamsHandler)();
});
/**
 * Sync the full roster for every team in the configured leagues. One doc
 * per (seasonId, teamId) at squads/{seasonId}_{teamId}. Replaces per-user
 * fetchSquad calls.
 *
 * Runs every 24 hours. Higher SM cost than syncTeams (one call per team)
 * but still bounded — ~51 leagues × ~25 teams ≈ 1,300 calls/day, which
 * sits at ~1.8% of the Pro plan.
 *
 * Timeout: 9 minutes (540s). Sequential per-team fetches with a 250ms
 * pause between each. ~1,300 × 0.5s = ~11 min worst-case, which would
 * tip over the timeout — handler logs partial progress and the next
 * day's run picks up where it left off (every write is idempotent).
 */
exports.syncSquads = (0, scheduler_1.onSchedule)({
    schedule: 'every 24 hours',
    timeoutSeconds: 540,
    memory: '512MiB',
    region: 'us-central1',
    retryCount: 1,
    secrets: [config_1.SPORTMONKS_TOKEN],
}, async () => {
    await (0, sync_squads_1.syncSquadsHandler)();
});
/**
 * Enrich "hot" matches (live, near-kickoff, or recently-finished) with the
 * full /fixtures/{id} payload so MatchDetail can render from Firestore.
 *
 * Closes the per-user-polling leak — useFixtureDetail used to call SportMonks
 * every 10s while a match was live (360 calls/hour PER concurrent viewer).
 * This Cloud Function runs at a fixed cadence regardless of user count.
 *
 * Schedule: every 5 minutes. Cost: ~30-80 SM calls per run for the
 * `fixtures` entity. Well below the 3,000/hour cap.
 */
exports.syncMatchEnrichment = (0, scheduler_1.onSchedule)({
    schedule: 'every 5 minutes',
    timeoutSeconds: 300,
    memory: '512MiB',
    region: 'us-central1',
    retryCount: 0, // next invocation is in 5 min anyway
    secrets: [config_1.SPORTMONKS_TOKEN],
}, async () => {
    await (0, sync_match_enrichment_1.syncMatchEnrichmentHandler)();
});
/**
 * Sync full coach profiles (career stats + teams managed) for every active
 * coach we know about (discovered via enriched matches). Replaces the
 * per-user getCoachProfile proxy call in AlineacionTab.
 *
 * Schedule: every 24h.
 *
 * Cost: ~1,000-1,500 SM calls/day on the `coaches` entity. ~6% of the
 * 72k/day per-entity cap.
 */
exports.syncCoaches = (0, scheduler_1.onSchedule)({
    schedule: 'every 24 hours',
    timeoutSeconds: 540,
    memory: '512MiB',
    region: 'us-central1',
    retryCount: 1,
    secrets: [config_1.SPORTMONKS_TOKEN],
}, async () => {
    await (0, sync_coaches_1.syncCoachesHandler)();
});
/**
 * Sync full player profiles for every player we know about (discovered via
 * squads + topscorers). Replaces the per-user usePlayerDetail proxy call.
 *
 * Schedule: every 24h.
 *
 * Cost: ~3-5k SM calls/day on the `players` entity. ~5-7% of the 72k/day cap.
 */
exports.syncPlayers = (0, scheduler_1.onSchedule)({
    schedule: 'every 24 hours',
    timeoutSeconds: 540,
    memory: '512MiB',
    region: 'us-central1',
    retryCount: 1,
    secrets: [config_1.SPORTMONKS_TOKEN],
}, async () => {
    await (0, sync_players_1.syncPlayersHandler)();
});
//# sourceMappingURL=index.js.map