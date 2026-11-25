"use strict";
/**
 * shared/football/freshness.ts
 *
 * When does a cached football document need a trip to the provider? The rules
 * live here, dependency-free, because BOTH sides apply them:
 *   - the app, to decide whether to call `fbOnDemand` at all (most opens are
 *     served straight from Firestore);
 *   - the callable, as the authority (a client with a wrong clock or an old
 *     build can't make it spend API quota on something that is still fresh).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FbTtl = exports.ON_DEMAND_DAY_RANGE = exports.SYNC_WINDOW_DAYS = exports.POLLER_DETAIL_POPULARITY = void 0;
exports.matchDetailNeedsFetch = matchDetailNeedsFetch;
exports.matchPreviewTtlMs = matchPreviewTtlMs;
exports.isExpired = isExpired;
exports.utcDayOffset = utcDayOffset;
exports.isOutsideSyncWindow = isOutsideSyncWindow;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const LIVE_SHORT = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'SUSP', 'INT']);
const FINISHED_SHORT = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
const DEAD_SHORT = new Set(['PST', 'CANC', 'ABD']);
/** Leagues at or above this popularity get their match detail from the live poller. */
exports.POLLER_DETAIL_POPULARITY = 20;
/** Lineups are published roughly an hour before kickoff. */
const LINEUP_WINDOW_MS = 75 * MIN;
/** A detail fetched this long after kickoff, with the match over, is final. */
const FINAL_AFTER_KICKOFF_MS = 130 * MIN;
/**
 * Should the match detail (events / lineups / statistics / ratings) be fetched
 * from the provider now?
 *
 * @param row     the `fb_matches` row (null when the fixture isn't stored yet)
 * @param detail  freshness metadata of `fb_match_details/{id}` (null when absent)
 */
function matchDetailNeedsFetch(row, detail, nowMs) {
    if (!row)
        return true; // unknown fixture (older than the sync window) — fetch once
    const short = row.statusShort;
    const kickoffMs = row.timestamp * 1000;
    const age = detail?.fetchedAt ? nowMs - detail.fetchedAt : Number.POSITIVE_INFINITY;
    if (DEAD_SHORT.has(short))
        return false; // postponed / cancelled: nothing to show
    if (FINISHED_SHORT.has(short)) {
        if (!detail?.fetchedAt)
            return true;
        const fetchedFinished = FINISHED_SHORT.has(detail.statusShort ?? '');
        const isFinal = fetchedFinished && detail.fetchedAt >= kickoffMs + FINAL_AFTER_KICKOFF_MS;
        if (isFinal)
            return false;
        // Fetched while still in play, or right at the whistle: late events
        // (stoppage-time scorer, ratings) land a few minutes later.
        return age > 10 * MIN;
    }
    if (LIVE_SHORT.has(short)) {
        if (row.popularity >= exports.POLLER_DETAIL_POPULARITY) {
            // The poller enriches these every 2-4 min; only step in if it fell behind.
            return age > 6 * MIN;
        }
        return age > 1 * MIN;
    }
    // Scheduled (TBD / NS): nothing to fetch until lineups are due.
    const untilKickoff = kickoffMs - nowMs;
    if (untilKickoff > LINEUP_WINDOW_MS)
        return false;
    // Kickoff passed but the row still says NS (feed lag): treat like live.
    if (untilKickoff < -5 * MIN)
        return age > 2 * MIN;
    return age > 10 * MIN;
}
/** How long a match preview (H2H, absences, prediction, form) stays fresh. */
function matchPreviewTtlMs(row, nowMs) {
    const short = row.statusShort;
    if (LIVE_SHORT.has(short) || FINISHED_SHORT.has(short) || DEAD_SHORT.has(short))
        return 30 * DAY;
    const untilKickoff = row.timestamp * 1000 - nowMs;
    if (untilKickoff > DAY)
        return 12 * HOUR;
    if (untilKickoff > 3 * HOUR)
        return 3 * HOUR;
    return 45 * MIN;
}
/** True when `expiresAt` (unix ms) is missing or in the past. */
function isExpired(doc, nowMs) {
    return !doc || typeof doc.expiresAt !== 'number' || doc.expiresAt <= nowMs;
}
/**
 * The scheduled sync keeps yesterday … +14 days in `fb_matches`. Any other
 * (UTC) date is fetched the first time somebody opens it.
 */
exports.SYNC_WINDOW_DAYS = { past: 1, future: 14 };
/** How far from today a day can be requested on demand. */
exports.ON_DEMAND_DAY_RANGE = { past: 400, future: 180 };
/** Whole days between a 'YYYY-MM-DD' UTC date and today (negative = past). */
function utcDayOffset(date, nowMs) {
    const day = Date.parse(`${date}T00:00:00Z`);
    const today = Math.floor(nowMs / 86_400_000) * 86_400_000;
    return Math.round((day - today) / 86_400_000);
}
/** True when the scheduled sync doesn't cover this UTC date. */
function isOutsideSyncWindow(date, nowMs) {
    const off = utcDayOffset(date, nowMs);
    return off < -exports.SYNC_WINDOW_DAYS.past || off > exports.SYNC_WINDOW_DAYS.future;
}
exports.FbTtl = {
    team: 24 * HOUR,
    teamFixtures: 6 * HOUR,
    teamStats: 12 * HOUR,
    player: 24 * HOUR,
    coach: 7 * DAY,
    venue: 30 * DAY,
    league: 7 * DAY,
    leagueFixtures: 6 * HOUR,
    /** Standings of leagues the scheduled sync doesn't cover. */
    standings: 3 * HOUR,
    topPlayers: 12 * HOUR,
    /** Seasons that are over never change. */
    finishedSeason: 30 * DAY,
    /** "The provider has nothing for this" — don't ask again for a while. */
    empty: 24 * HOUR,
    search: 7 * DAY,
};
//# sourceMappingURL=freshness.js.map