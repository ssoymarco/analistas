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

// IMPORTANT: admin-init must be imported first — it calls admin.initializeApp()
// before any other module touches admin.firestore().
import './admin-init';

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { SPORTMONKS_TOKEN } from './config';
import { pollLivescoresHandler } from './poll-livescores';
import { syncFixturesHandler } from './sync-fixtures';
import { syncStandingsHandler, syncTopScorersHandler } from './sync-standings';
import { syncTeamsHandler } from './sync-teams';
import { syncSquadsHandler } from './sync-squads';
import { syncMatchEnrichmentHandler } from './sync-match-enrichment';
import { syncCoachesHandler } from './sync-coaches';
import { syncPlayersHandler } from './sync-players';

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
export const pollLivescores = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeoutSeconds: 120,
    memory: '256MiB',
    region: 'us-central1',
    retryCount: 0,  // Don't retry — next invocation will run in 1 min anyway
    secrets: [SPORTMONKS_TOKEN],
  },
  async () => {
    await pollLivescoresHandler();
  },
);

/**
 * Sync all fixtures for yesterday, today, and tomorrow.
 * Keeps the matches collection fresh with scheduled/finished matches.
 *
 * Runs every 30 minutes.
 */
export const syncFixtures = onSchedule(
  {
    schedule: 'every 30 minutes',
    timeoutSeconds: 300,
    memory: '512MiB',
    region: 'us-central1',
    retryCount: 1,
    secrets: [SPORTMONKS_TOKEN],
  },
  async () => {
    await syncFixturesHandler();
  },
);

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
const BACKFILL_ADMIN_UIDS = new Set<string>([
  // Operator UIDs allowed to trigger the backfill. Populate via Firebase Auth.
]);

import { defineSecret } from 'firebase-functions/params';
import { admin } from './admin-init';
const BACKFILL_TOKEN = defineSecret('BACKFILL_TOKEN');

export const backfillFixturesByDates = onCall(
  {
    timeoutSeconds: 540,
    memory: '512MiB',
    region: 'us-central1',
    secrets: [SPORTMONKS_TOKEN, BACKFILL_TOKEN],
    // Allow CORS + unauthenticated invocation — the token check inside the
    // body is the actual gate. Callable v2 enforces the App Check / IAM
    // layer by default which would block our one-shot curl invocation.
    invoker: 'public',
  },
  async (req) => {
    // Allow the configured admin UIDs OR a temporary bearer set via the
    // BACKFILL_TOKEN Firebase secret (used for one-shot manual cleanups
    // via curl — handy when no app user has admin rights yet).
    const uid = req.auth?.uid ?? '';
    const tokenHeader = (req.data?.adminToken as string | undefined) ?? '';
    const expectedToken = BACKFILL_TOKEN.value();
    const tokenOk = expectedToken.length > 0 && tokenHeader === expectedToken;
    const uidOk   = uid.length > 0 && BACKFILL_ADMIN_UIDS.has(uid);
    if (!tokenOk && !uidOk) {
      throw new HttpsError('permission-denied', 'Backfill requires an admin UID or matching adminToken.');
    }

    const dates: unknown = req.data?.dates;
    if (!Array.isArray(dates) || dates.length === 0 || !dates.every(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))) {
      throw new HttpsError('invalid-argument', 'Expected `dates: string[]` (YYYY-MM-DD format).');
    }
    if (dates.length > 14) {
      throw new HttpsError('invalid-argument', 'At most 14 dates per call.');
    }

    await syncFixturesHandler(dates as string[]);
    return { ok: true, dates };
  },
);

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
export const reportFcmToken = onCall(
  {
    timeoutSeconds: 30,
    memory: '256MiB',
    region: 'us-central1',
    invoker: 'public',
  },
  async (req) => {
    const fcmToken  = String(req.data?.fcmToken  ?? '');
    const apnsToken = String(req.data?.apnsToken ?? '');
    const platform  = String(req.data?.platform  ?? 'unknown');
    const buildNum  = String(req.data?.buildNum  ?? 'unknown');
    // Log the full FCM token so the operator can use it for a direct
    // sendToken push. APNs token is logged truncated — it's only useful
    // as a "did APNs bind?" signal, not a delivery target.
    logger.info('📲 FCM_DIAG', {
      platform,
      buildNum,
      hasFcmToken:  fcmToken.length > 0,
      hasApnsToken: apnsToken.length > 0,
      fcmToken:     fcmToken,
      apnsFirst16:  apnsToken.slice(0, 16),
      ts:           Date.now(),
    });
    return { ok: true };
  },
);

export const sendTestPush = onCall(
  {
    timeoutSeconds: 60,
    memory: '256MiB',
    region: 'us-central1',
    secrets: [BACKFILL_TOKEN],
    invoker: 'public',
  },
  async (req) => {
    const tokenHeader = (req.data?.adminToken as string | undefined) ?? '';
    const expectedToken = BACKFILL_TOKEN.value();
    if (!expectedToken || tokenHeader !== expectedToken) {
      throw new HttpsError('permission-denied', 'sendTestPush requires a matching adminToken.');
    }
    const topic = req.data?.topic as string | undefined;
    const title = (req.data?.title as string | undefined) ?? 'Analistas';
    const body  = (req.data?.body  as string | undefined) ?? 'Test push';
    if (!topic || typeof topic !== 'string') {
      throw new HttpsError('invalid-argument', 'Expected `topic: string`.');
    }
    const messageId = await admin.messaging().send({
      topic,
      notification: { title, body },
      data: { type: 'test', ts: String(Date.now()) },
      apns: { payload: { aps: { sound: 'default' } } },
      android: { priority: 'high', notification: { channelId: 'analistas-live', sound: 'default' } },
    });
    return { ok: true, messageId, topic };
  },
);

/**
 * Sync league standings for all configured leagues.
 * Runs every 1 hour — keeps tables fresh after match days.
 * Cost: 51 leagues × 24 executions/day = 1,224 calls/day (1.7% of Pro limit).
 * Future improvement: switch to event-driven sync from pollLivescores matchEnd.
 */
export const syncStandings = onSchedule(
  {
    schedule: 'every 1 hours',
    timeoutSeconds: 540,
    memory: '256MiB',
    region: 'us-central1',
    retryCount: 1,
    secrets: [SPORTMONKS_TOKEN],
  },
  async () => {
    await syncStandingsHandler();
  },
);

/**
 * Sync top scorers for all configured leagues.
 * Runs every 1 hour — keeps scorer rankings near-real-time so a goal at
 * 18:42 shows up in the table by 19:00 at the latest.
 * Cost: 51 leagues × 24 executions/day = 1,224 calls/day (1.7% of Pro limit).
 * Future improvement: switch to event-driven sync from pollLivescores matchEnd.
 */
export const syncTopScorers = onSchedule(
  {
    schedule: 'every 1 hours',
    timeoutSeconds: 540,
    memory: '256MiB',
    region: 'us-central1',
    retryCount: 1,
    secrets: [SPORTMONKS_TOKEN],
  },
  async () => {
    await syncTopScorersHandler();
  },
);

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
export const syncTeams = onSchedule(
  {
    schedule: 'every 24 hours',
    timeoutSeconds: 540,
    memory: '256MiB',
    region: 'us-central1',
    retryCount: 1,
    secrets: [SPORTMONKS_TOKEN],
  },
  async () => {
    await syncTeamsHandler();
  },
);

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
export const syncSquads = onSchedule(
  {
    schedule: 'every 24 hours',
    timeoutSeconds: 540,
    memory: '512MiB',
    region: 'us-central1',
    retryCount: 1,
    secrets: [SPORTMONKS_TOKEN],
  },
  async () => {
    await syncSquadsHandler();
  },
);

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
export const syncMatchEnrichment = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeoutSeconds: 300,
    memory: '512MiB',
    region: 'us-central1',
    retryCount: 0, // next invocation is in 5 min anyway
    secrets: [SPORTMONKS_TOKEN],
  },
  async () => {
    await syncMatchEnrichmentHandler();
  },
);

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
export const syncCoaches = onSchedule(
  {
    schedule: 'every 24 hours',
    timeoutSeconds: 540,
    memory: '512MiB',
    region: 'us-central1',
    retryCount: 1,
    secrets: [SPORTMONKS_TOKEN],
  },
  async () => {
    await syncCoachesHandler();
  },
);

/**
 * Sync full player profiles for every player we know about (discovered via
 * squads + topscorers). Replaces the per-user usePlayerDetail proxy call.
 *
 * Schedule: every 24h.
 *
 * Cost: ~3-5k SM calls/day on the `players` entity. ~5-7% of the 72k/day cap.
 */
export const syncPlayers = onSchedule(
  {
    schedule: 'every 24 hours',
    timeoutSeconds: 540,
    memory: '512MiB',
    region: 'us-central1',
    retryCount: 1,
    secrets: [SPORTMONKS_TOKEN],
  },
  async () => {
    await syncPlayersHandler();
  },
);
