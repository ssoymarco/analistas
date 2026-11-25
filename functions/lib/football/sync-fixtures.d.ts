/**
 * football/sync-fixtures.ts
 *
 * Keeps `fb_matches` filled with every fixture API-Sports has for a rolling
 * window (yesterday … +14 days), all leagues. One `/fixtures?date=` call per
 * date returns every league at once (no pagination), so cost depends only on
 * how often each date is refreshed:
 *
 *   today              every run (5 min)   → 288 calls/day
 *   yesterday/tomorrow every 30 min        →  96
 *   +2 … +7            every 6 h           →  24
 *   +8 … +14           once a day          →   7
 *                                            ≈ 415 calls/day
 *
 * Live fixtures are skipped here — the live poller owns them (fresher data and
 * a stable clock anchor). Rows are only written when their fingerprint changed.
 * The run also rebuilds the "live gate" the poller reads to know when to wake.
 *
 * Kickoff delays: API-Sports has no "delayed" status — a delay shows up as a
 * NEW kickoff time (status still NS), a postponement as NS → PST. Both are
 * detected here by comparing with the previous run (the per-date fingerprint
 * stores "hash:kickoff:status") and pushed as `kickoffDelayed` to the
 * followers of both teams when the original kickoff was within 8 h.
 */
/** Which day offsets to refresh on this run. Pure — exported for tests. */
export declare function datesForRun(nowMs: number): number[];
export interface SyncResult {
    dates: string[];
    fixtures: number;
    written: number;
    delays: number;
    /** Dates the provider call failed for (nothing was stored for them). */
    failed: string[];
}
/** "1 h", "1 h 30 min", "45 min" — timezone-free delay text. */
export declare function formatDelay(sec: number): string;
/** Delay / postponement of an imminent match vs the previous run. Pure — exported for tests. */
export declare function kickoffDelayFor(old: {
    ts: number;
    short: string;
} | null, cur: {
    ts: number;
    short: string;
}, nowSec: number): string | null;
export declare function syncFootballFixtures(explicitDates?: string[], nowMs?: number): Promise<SyncResult>;
