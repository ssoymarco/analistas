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
import type { FbMatchDoc } from './model';
/** Leagues at or above this popularity get their match detail from the live poller. */
export declare const POLLER_DETAIL_POPULARITY = 20;
export interface DetailMeta {
    /** Unix ms of the last provider fetch (poller or on-demand). */
    fetchedAt?: number | null;
    /** Fixture status when it was fetched. */
    statusShort?: string | null;
}
type MatchRowLike = Pick<FbMatchDoc, 'statusShort' | 'timestamp' | 'popularity'>;
/**
 * Should the match detail (events / lineups / statistics / ratings) be fetched
 * from the provider now?
 *
 * @param row     the `fb_matches` row (null when the fixture isn't stored yet)
 * @param detail  freshness metadata of `fb_match_details/{id}` (null when absent)
 */
export declare function matchDetailNeedsFetch(row: MatchRowLike | null, detail: DetailMeta | null, nowMs: number): boolean;
/** How long a match preview (H2H, absences, prediction, form) stays fresh. */
export declare function matchPreviewTtlMs(row: MatchRowLike, nowMs: number): number;
/** True when `expiresAt` (unix ms) is missing or in the past. */
export declare function isExpired(doc: {
    expiresAt?: number | null;
} | null | undefined, nowMs: number): boolean;
/**
 * The scheduled sync keeps yesterday … +14 days in `fb_matches`. Any other
 * (UTC) date is fetched the first time somebody opens it.
 */
export declare const SYNC_WINDOW_DAYS: {
    readonly past: 1;
    readonly future: 14;
};
/** How far from today a day can be requested on demand. */
export declare const ON_DEMAND_DAY_RANGE: {
    readonly past: 400;
    readonly future: 180;
};
/** Whole days between a 'YYYY-MM-DD' UTC date and today (negative = past). */
export declare function utcDayOffset(date: string, nowMs: number): number;
/** True when the scheduled sync doesn't cover this UTC date. */
export declare function isOutsideSyncWindow(date: string, nowMs: number): boolean;
export declare const FbTtl: {
    readonly team: number;
    readonly teamFixtures: number;
    readonly teamStats: number;
    readonly player: number;
    readonly coach: number;
    readonly venue: number;
    readonly league: number;
    readonly leagueFixtures: number;
    /** Standings of leagues the scheduled sync doesn't cover. */
    readonly standings: number;
    readonly topPlayers: number;
    /** Seasons that are over never change. */
    readonly finishedSeason: number;
    /** "The provider has nothing for this" — don't ask again for a while. */
    readonly empty: number;
    readonly search: number;
};
export {};
