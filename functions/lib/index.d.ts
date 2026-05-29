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
import './admin-init';
/**
 * Poll livescores every 1 minute.
 * Internally runs 4 polls with 15-second delays for near-real-time updates.
 * Detects goals, match starts, and match endings.
 *
 * Region: us-central1 (default, lowest latency to SportMonks EU servers)
 * Timeout: 120s (4 polls × ~15s wait + API latency)
 * Memory: 256MB
 */
export declare const pollLivescores: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * Sync all fixtures for yesterday, today, and tomorrow.
 * Keeps the matches collection fresh with scheduled/finished matches.
 *
 * Runs every 30 minutes.
 */
export declare const syncFixtures: import("firebase-functions/v2/scheduler").ScheduleFunction;
export declare const backfillFixturesByDates: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
    dates: any[];
}>, unknown>;
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
export declare const reportFcmToken: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
}>, unknown>;
export declare const sendTestPush: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
    messageId: string;
    topic: string;
}>, unknown>;
/**
 * Sync league standings for all configured leagues.
 * Runs every 1 hour — keeps tables fresh after match days.
 * Cost: 51 leagues × 24 executions/day = 1,224 calls/day (1.7% of Pro limit).
 * Future improvement: switch to event-driven sync from pollLivescores matchEnd.
 */
export declare const syncStandings: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * Sync top scorers for all configured leagues.
 * Runs every 1 hour — keeps scorer rankings near-real-time so a goal at
 * 18:42 shows up in the table by 19:00 at the latest.
 * Cost: 51 leagues × 24 executions/day = 1,224 calls/day (1.7% of Pro limit).
 * Future improvement: switch to event-driven sync from pollLivescores matchEnd.
 */
export declare const syncTopScorers: import("firebase-functions/v2/scheduler").ScheduleFunction;
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
export declare const syncTeams: import("firebase-functions/v2/scheduler").ScheduleFunction;
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
export declare const syncSquads: import("firebase-functions/v2/scheduler").ScheduleFunction;
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
export declare const syncMatchEnrichment: import("firebase-functions/v2/scheduler").ScheduleFunction;
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
export declare const syncCoaches: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * Sync full player profiles for every player we know about (discovered via
 * squads + topscorers). Replaces the per-user usePlayerDetail proxy call.
 *
 * Schedule: every 24h.
 *
 * Cost: ~3-5k SM calls/day on the `players` entity. ~5-7% of the 72k/day cap.
 */
export declare const syncPlayers: import("firebase-functions/v2/scheduler").ScheduleFunction;
