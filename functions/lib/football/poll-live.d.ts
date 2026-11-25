/**
 * football/poll-live.ts
 *
 * The live engine. Scheduled every minute; inside one invocation it polls
 * `/fixtures?live=all` 1-4 times depending on what's being played:
 *
 *   top league live (popularity ≥ 75: Liga MX, Premier, LaLiga, MLS, UCL…) → every 15 s
 *   priority league live (≥ 20)                                         → every 30 s
 *   only minor leagues live                                             → every 60 s
 *   nothing live or about to start                                      → no API call
 *
 * API-Sports refreshes live data every ~15 s, so polling faster buys nothing.
 * At peak (busy Saturday) this costs ~4 calls/min; with enrichment and the
 * fixtures sync the daily total stays well inside the Pro plan's 7,500.
 *
 * Per poll:
 *   1. live feed (1 call) + re-fetch of matches that just left the feed
 *      (finished/abandoned — 1 call per 20). A match that left the feed while
 *      still "in play" (storm suspension) is re-checked every 5 min for up to
 *      3 h so its final whistle still gets a push.
 *   2. diff vs snapshot → changes → push notifications
 *   3. write changed rows to fb_matches; Live Activities updates
 * Once per invocation (first poll):
 *   4. pre-match reminders (Firestore query, no API call)
 *   5. detail enrichment (events/lineups/stats/ratings) for priority matches
 *      via /fixtures?ids= (≤20 per call), "lineups confirmed" pushes (team +
 *      followed players), and post-final settle passes (+2/5/10/20 min) that
 *      pick up late events (stoppage-time scorer, post-whistle red card).
 */
import { type Snapshot } from './live-detect';
/** Polls to run this minute (0 = skip). Pure — exported for tests. */
export declare function decideCadence(opts: {
    nowSec: number;
    gate: Array<[number, number, number]>;
    snapshot: Snapshot;
    remainingDay: number;
    minuteOfDay: number;
}): {
    polls: number;
    maxPop: number;
    enrich: boolean;
};
export declare function pollFootballLive(): Promise<void>;
