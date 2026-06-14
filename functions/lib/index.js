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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncPlayers = exports.syncCoaches = exports.syncMatchEnrichment = exports.syncSquads = exports.syncTeams = exports.syncTopScorers = exports.syncStandings = exports.sendTestPush = exports.backfillEnrichmentByMatchIds = exports.reportFcmToken = exports.backfillFixturesByDates = exports.syncFixtures = exports.pollLivescores = exports.deliverDelayedPush = void 0;
// IMPORTANT: admin-init must be imported first — it calls admin.initializeApp()
// before any other module touches admin.firestore().
require("./admin-init");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const config_1 = require("./config");
const poll_livescores_1 = require("./poll-livescores");
const sync_fixtures_1 = require("./sync-fixtures");
const sync_standings_1 = require("./sync-standings");
const sync_teams_1 = require("./sync-teams");
const sync_squads_1 = require("./sync-squads");
const sync_match_enrichment_1 = require("./sync-match-enrichment");
const sync_coaches_1 = require("./sync-coaches");
const sync_players_1 = require("./sync-players");
// ── Modo Estadio — delayed push via Cloud Tasks ─────────────────────────────
var deliver_delayed_push_1 = require("./deliver-delayed-push");
Object.defineProperty(exports, "deliverDelayedPush", { enumerable: true, get: function () { return deliver_delayed_push_1.deliverDelayedPush; } });
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
 * On-demand backfill: re-syncs every fixture on the supplied date(s).
 *
 * Why this exists: when an upstream bug in the SM_STATE_IDS map was fixed
 * (commit 2c21d9b — see git history), most live matches self-healed on the
 * next pollLivescores tick, but historical FINISHED matches (e.g. 2022 World
 * Cup penalty shootouts) were never touched again — pollLivescores only
 * writes currently in-play fixtures and scheduled syncFixtures only covers
 * yesterday/today/tomorrow. This callable lets an operator manually heal a
 * specific date range without inflating the scheduled function's footprint.
 *
 * Auth: the function checks for a hard-coded admin UID list inline (kept
 * private — the calling app is the only legitimate consumer). Anonymous and
 * unauthenticated calls are rejected. Each call burns ~3 SM token credits
 * per supplied date.
 *
 * Invocation example (Firebase Console > Functions > Test):
 *   { "data": { "dates": ["2022-12-09", "2022-12-18"] } }
 */
const BACKFILL_ADMIN_UIDS = new Set([
// Operator UIDs allowed to trigger the backfill. Populate via Firebase Auth.
]);
const params_1 = require("firebase-functions/params");
const admin_init_1 = require("./admin-init");
const BACKFILL_TOKEN = (0, params_1.defineSecret)('BACKFILL_TOKEN');
exports.backfillFixturesByDates = (0, https_1.onCall)({
    timeoutSeconds: 540,
    memory: '512MiB',
    region: 'us-central1',
    secrets: [config_1.SPORTMONKS_TOKEN, BACKFILL_TOKEN],
    // Allow CORS + unauthenticated invocation — the token check inside the
    // body is the actual gate. Callable v2 enforces the App Check / IAM
    // layer by default which would block our one-shot curl invocation.
    invoker: 'public',
}, async (req) => {
    // Allow the configured admin UIDs OR a temporary bearer set via the
    // BACKFILL_TOKEN Firebase secret (used for one-shot manual cleanups
    // via curl — handy when no app user has admin rights yet).
    const uid = req.auth?.uid ?? '';
    const tokenHeader = req.data?.adminToken ?? '';
    const expectedToken = BACKFILL_TOKEN.value();
    const tokenOk = expectedToken.length > 0 && tokenHeader === expectedToken;
    const uidOk = uid.length > 0 && BACKFILL_ADMIN_UIDS.has(uid);
    if (!tokenOk && !uidOk) {
        throw new https_1.HttpsError('permission-denied', 'Backfill requires an admin UID or matching adminToken.');
    }
    const dates = req.data?.dates;
    if (!Array.isArray(dates) || dates.length === 0 || !dates.every(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))) {
        throw new https_1.HttpsError('invalid-argument', 'Expected `dates: string[]` (YYYY-MM-DD format).');
    }
    if (dates.length > 14) {
        throw new https_1.HttpsError('invalid-argument', 'At most 14 dates per call.');
    }
    await (0, sync_fixtures_1.syncFixturesHandler)(dates);
    return { ok: true, dates };
});
/**
 * Diagnostic endpoint: send a test FCM push to an arbitrary topic so an
 * operator can verify that a specific device is subscribed end-to-end.
 *
 * Why this exists — the user reported zero notifications on Build 13 +
 * Build 14 because the client never bound APNs↔FCM (see commit ea1be8f).
 * After Build 15 ships the fix, we need a way to confirm the binding
 * worked WITHOUT having to wait for a real goal to be scored. This
 * endpoint takes a topic + title + body and dispatches via the same
 * `admin.messaging().send({topic})` path the real notifications use.
 *
 * Gated on the same BACKFILL_TOKEN as the other diagnostic endpoint —
 * an explicit allow-list approach is cleaner than wiring per-endpoint
 * secrets.
 *
 * Invocation example (curl):
 *   curl -X POST .../sendTestPush -d '{
 *     "data": {
 *       "adminToken": "...",
 *       "topic": "team_3371_goals",
 *       "title": "Test",
 *       "body":  "Si ves esto el binding funciona"
 *     }
 *   }'
 */
/**
 * Diagnostic endpoint: records the FCM + APNs tokens reported by a device
 * after `initializeFCM` runs. Used to verify end-to-end binding when the
 * topic-targeted push diagnostic fails — a direct token-targeted push
 * bypasses topic membership entirely and isolates whether the device is
 * truly registered with FCM or whether the registration token itself
 * is a phantom.
 *
 * Public endpoint (the device hits it on launch, no auth available there).
 * Tokens are PII-adjacent — store in logs only, no Firestore write, so
 * they age out with the normal Cloud Logging retention.
 */
exports.reportFcmToken = (0, https_1.onCall)({
    timeoutSeconds: 30,
    memory: '256MiB',
    region: 'us-central1',
    invoker: 'public',
}, async (req) => {
    const fcmToken = String(req.data?.fcmToken ?? '');
    const apnsToken = String(req.data?.apnsToken ?? '');
    const platform = String(req.data?.platform ?? 'unknown');
    const buildNum = String(req.data?.buildNum ?? 'unknown');
    // Log the full FCM token so the operator can use it for a direct
    // sendToken push. APNs token is logged truncated — it's only useful
    // as a "did APNs bind?" signal, not a delivery target.
    logger.info('📲 FCM_DIAG', {
        platform,
        buildNum,
        hasFcmToken: fcmToken.length > 0,
        hasApnsToken: apnsToken.length > 0,
        fcmToken: fcmToken,
        apnsFirst16: apnsToken.slice(0, 16),
        ts: Date.now(),
    });
    return { ok: true };
});
/**
 * Backfill enrichment (events, lineups, h2h, statistics) for arbitrary match
 * IDs that are outside the scheduled hot window. Primary use case: historical
 * cup matches that went to ET/penalties (2022 WC knockouts, etc.) whose
 * `detail.events` only has shootout kicks because the scheduled enrichment
 * function never revisits finished matches older than 2 hours.
 *
 * Input: `{ matchIds: string[], adminToken: string }` — max 20 IDs per call
 * (each requires a separate SportMonks API call + H2H call).
 */
exports.backfillEnrichmentByMatchIds = (0, https_1.onCall)({
    timeoutSeconds: 540,
    memory: '512MiB',
    region: 'us-central1',
    secrets: [config_1.SPORTMONKS_TOKEN, BACKFILL_TOKEN],
    invoker: 'public',
}, async (req) => {
    const tokenHeader = req.data?.adminToken ?? '';
    const expectedToken = BACKFILL_TOKEN.value();
    if (!expectedToken || tokenHeader !== expectedToken) {
        throw new https_1.HttpsError('permission-denied', 'Requires matching adminToken.');
    }
    const matchIds = req.data?.matchIds;
    if (!Array.isArray(matchIds) || matchIds.length === 0 ||
        !matchIds.every(id => typeof id === 'string' || typeof id === 'number')) {
        throw new https_1.HttpsError('invalid-argument', 'Expected `matchIds: (string|number)[]`.');
    }
    if (matchIds.length > 20) {
        throw new https_1.HttpsError('invalid-argument', 'At most 20 match IDs per call.');
    }
    const ids = matchIds.map(String);
    const result = await (0, sync_match_enrichment_1.enrichMatchesByIds)(ids);
    return { ok: true, ...result, matchIds: ids };
});
exports.sendTestPush = (0, https_1.onCall)({
    timeoutSeconds: 60,
    memory: '256MiB',
    region: 'us-central1',
    secrets: [BACKFILL_TOKEN],
    invoker: 'public',
}, async (req) => {
    const tokenHeader = req.data?.adminToken ?? '';
    const expectedToken = BACKFILL_TOKEN.value();
    if (!expectedToken || tokenHeader !== expectedToken) {
        throw new https_1.HttpsError('permission-denied', 'sendTestPush requires a matching adminToken.');
    }
    const topic = req.data?.topic;
    const token = req.data?.token;
    const title = req.data?.title ?? 'Analistas';
    const body = req.data?.body ?? 'Test push';
    if (!topic && !token) {
        throw new https_1.HttpsError('invalid-argument', 'Expected `topic` OR `token` string.');
    }
    const target = token
        ? { token }
        : { topic: topic };
    const messageId = await admin_init_1.admin.messaging().send({
        ...target,
        notification: { title, body },
        data: { type: 'test', ts: String(Date.now()) },
        apns: { payload: { aps: { sound: 'default' } } },
        android: { priority: 'high', notification: { channelId: 'analistas-live', sound: 'default' } },
    });
    return { ok: true, messageId, target };
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