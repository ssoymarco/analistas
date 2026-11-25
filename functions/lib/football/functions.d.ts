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
export declare const fbPollLive: import("firebase-functions/v2/scheduler").ScheduleFunction;
export declare const fbSyncFixtures: import("firebase-functions/v2/scheduler").ScheduleFunction;
export declare const fbSyncStandings: import("firebase-functions/v2/scheduler").ScheduleFunction;
export declare const fbDailyLeagues: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * Operator actions. `{ adminToken, action, dates? }`:
 *   action 'fixtures' — sync the given dates (YYYY-MM-DD, max 15) or the default window
 *   action 'catalog'  — refresh the league catalog
 *   action 'tables'   — standings + top players sweep
 * Used right after the first deploy to populate Firestore without waiting
 * for the schedules.
 */
export declare const fbAdmin: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    dates: string[];
    fixtures: number;
    written: number;
    delays: number;
    failed: string[];
    ok: boolean;
    leagues?: undefined;
} | {
    ok: boolean;
    leagues: number;
} | {
    standings: number;
    topPlayers: number;
    ok: boolean;
    leagues?: undefined;
}>, unknown>;
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
export declare const fbOnDemand: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    kind: import("../shared/football/model").FbOnDemandKind;
    data: unknown;
}>, unknown>;
