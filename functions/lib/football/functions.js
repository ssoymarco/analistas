"use strict";
/**
 * football/functions.ts
 *
 * Cloud Functions for the API-Sports football backend.
 *
 *   fbPollLive        every 1 min   live scores + push notifications (1-4 polls/min, adaptive)
 *   fbSyncFixtures    every 5 min   fixtures for yesterday … +14 days, all leagues
 *   fbSyncStandings   every 10 min  standings of leagues that just finished a match
 *   fbDailyLeagues    daily 04:17   league catalog + standings/top players sweep
 *   fbAdmin           callable      operator actions (gated by BACKFILL_TOKEN)
 *   fbOnDemand        callable      team / player / preview / calendars / search, cached in Firestore
 *
 * Every function that talks to API-Sports binds the APISPORTS_KEY secret.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fbOnDemand = exports.fbAdmin = exports.fbDailyLeagues = exports.fbSyncStandings = exports.fbSyncFixtures = exports.fbPollLive = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const diagnostics_1 = require("../diagnostics");
const apisports_1 = require("./apisports");
const on_demand_1 = require("./on-demand");
const poll_live_1 = require("./poll-live");
const sync_fixtures_1 = require("./sync-fixtures");
const sync_league_data_1 = require("./sync-league-data");
const store_1 = require("./store");
const REGION = 'us-central1';
exports.fbPollLive = (0, scheduler_1.onSchedule)({
    schedule: 'every 1 minutes',
    timeoutSeconds: 120,
    memory: '512MiB',
    region: REGION,
    retryCount: 0, // the next minute's run supersedes a failed one
    secrets: [apisports_1.APISPORTS_KEY],
}, async () => { await (0, poll_live_1.pollFootballLive)(); });
exports.fbSyncFixtures = (0, scheduler_1.onSchedule)({
    schedule: 'every 5 minutes',
    timeoutSeconds: 300,
    memory: '512MiB',
    region: REGION,
    retryCount: 0,
    secrets: [apisports_1.APISPORTS_KEY],
}, async () => { await (0, sync_fixtures_1.syncFootballFixtures)(); });
exports.fbSyncStandings = (0, scheduler_1.onSchedule)({
    schedule: 'every 10 minutes',
    timeoutSeconds: 300,
    memory: '256MiB',
    region: REGION,
    retryCount: 0,
    secrets: [apisports_1.APISPORTS_KEY],
}, async () => { await (0, sync_league_data_1.syncDirtyStandings)(); });
exports.fbDailyLeagues = (0, scheduler_1.onSchedule)({
    schedule: '17 4 * * *',
    timeZone: 'Etc/UTC',
    timeoutSeconds: 540,
    memory: '512MiB',
    region: REGION,
    retryCount: 1,
    secrets: [apisports_1.APISPORTS_KEY],
}, async () => {
    await (0, sync_league_data_1.syncFootballCatalog)();
    await (0, sync_league_data_1.syncAllLeagueTables)();
    await (0, store_1.deleteOldFingerprints)();
});
/**
 * Operator actions. `{ adminToken, action, dates? }`:
 *   action 'fixtures' — sync the given dates (YYYY-MM-DD, max 15) or the default window
 *   action 'catalog'  — refresh the league catalog
 *   action 'tables'   — standings + top players sweep
 * Used right after the first deploy to populate Firestore without waiting
 * for the schedules.
 */
exports.fbAdmin = (0, https_1.onCall)({
    timeoutSeconds: 540,
    memory: '512MiB',
    region: REGION,
    secrets: [apisports_1.APISPORTS_KEY, diagnostics_1.BACKFILL_TOKEN],
    invoker: 'public',
}, async (req) => {
    const token = String(req.data?.adminToken ?? '');
    const expected = diagnostics_1.BACKFILL_TOKEN.value();
    if (!expected || token !== expected)
        throw new https_1.HttpsError('permission-denied', 'Requires matching adminToken.');
    const action = String(req.data?.action ?? '');
    switch (action) {
        case 'fixtures': {
            const dates = req.data?.dates;
            if (dates !== undefined && (!Array.isArray(dates) || dates.length > 15 ||
                !dates.every(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))) {
                throw new https_1.HttpsError('invalid-argument', 'dates must be ≤15 YYYY-MM-DD strings');
            }
            return { ok: true, ...(await (0, sync_fixtures_1.syncFootballFixtures)(dates)) };
        }
        case 'catalog':
            return { ok: true, leagues: await (0, sync_league_data_1.syncFootballCatalog)() };
        case 'tables':
            return { ok: true, ...(await (0, sync_league_data_1.syncAllLeagueTables)()) };
        default:
            throw new https_1.HttpsError('invalid-argument', "action must be 'fixtures' | 'catalog' | 'tables'");
    }
});
/**
 * Data the app asks for the first time a screen needs it (team, squad,
 * player, match preview, season calendars, minor-league tables, search). Every
 * answer is cached in Firestore with a TTL, so API-Sports is called once per
 * document no matter how many users open it. See on-demand.ts.
 *
 * Public on purpose: onboarding searches teams before the user has a session.
 * Inputs are validated, and a daily quota reserve keeps on-demand work from
 * ever starving the live poller.
 */
exports.fbOnDemand = (0, https_1.onCall)({
    timeoutSeconds: 60,
    memory: '256MiB',
    region: REGION,
    secrets: [apisports_1.APISPORTS_KEY],
    invoker: 'public',
    concurrency: 40,
    maxInstances: 10,
}, async (req) => (0, on_demand_1.toPlain)(await (0, on_demand_1.handleOnDemand)(req.data)));
//# sourceMappingURL=functions.js.map