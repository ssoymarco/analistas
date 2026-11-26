/**
 * football/mapping.ts
 *
 * API-Sports → Firestore document mappers (see shared/football/model.ts).
 * Pure functions: no I/O, no clock reads except through the `nowSec` argument,
 * so they are unit-testable against recorded API responses.
 *
 * App conventions this file preserves (the UI depends on them):
 *   - own goals: `event.team` is the side of the player who put it into his own
 *     net (the CONCEDING side) — the UI flips it to award the goal. API-Sports
 *     reports the credited team instead, so we flip on the way in.
 *   - substitutions: `player` = player coming ON, `relatedPlayer` = going OFF.
 *     API-Sports reports `player` = going off, `assist` = coming on.
 *   - positions: Spanish labels + POR/DEF/MED/DEL short codes.
 *   - statistics: same Spanish categories/labels the app showed before.
 */
import type { FbEvent, FbLiveClock, FbMatchDetailDoc, FbMatchDoc, FbMatchStatus, FbPressure, FbStatCategory, FbStandingsDoc, FbTopPlayer } from '../shared/football/model';
import type { AfEvent, AfFixtureCore, AfFixtureFull, AfStandingsResponse, AfTeamStatistics, AfTopPlayerEntry } from './apisports-types';
export declare function mapStatus(short: string): FbMatchStatus;
export declare function isLiveShort(short: string): boolean;
export declare function isFinishedShort(short: string): boolean;
/** Ball-in-play statuses (used to tell a genuine halt from a paused break). */
export declare function isPlayingShort(short: string): boolean;
/** 3-letter code from a team name ("Club America" → "AME", "Real Madrid" → "RMA"). */
export declare function deriveShortName(name: string): string;
export declare function isShootoutEvent(e: AfEvent): boolean;
export declare function isRedCardEvent(e: AfEvent): boolean;
export declare function isYellowCardEvent(e: AfEvent): boolean;
export declare function isMissedPenaltyEvent(e: AfEvent): boolean;
export declare function isScoredGoalEvent(e: AfEvent): boolean;
/** VAR took a goal off the board. */
export declare function isGoalRuledOutEvent(e: AfEvent): boolean;
/**
 * The latest event that changes how the match reads — goal, red card, missed
 * penalty, goal ruled out — as one short line in Spanish. When a team is a
 * player down and the line is about something else, it says so at the end
 * ("· 🟥 Monterrey"). Null when nothing of the kind has happened.
 */
export declare function lastEventLine(f: {
    teams: AfFixtureCore['teams'];
    events?: AfEvent[];
}): string | null;
/**
 * Each side's key events in one line for the Live Activity: scorers with their
 * minutes ("⚽ H. Martín 52', 78'"), then players sent off ("🟥 R. Chávez 11'").
 * Own goals go to the side they count for — the provider is not consistent
 * about which team it files them under, so the reading that adds up to the
 * real score is the one used.
 */
export declare function sideEventLines(f: {
    teams: AfFixtureCore['teams'];
    goals?: AfFixtureCore['goals'];
    events?: AfEvent[];
}): {
    homeEvents: string | null;
    awayEvents: string | null;
};
/** [home possession %, shots on goal home, away, corners home, away] from a fixture with statistics; null without them. */
export declare function compactLiveStats(f: AfFixtureFull): number[] | null;
export declare function countBy(events: AfEvent[] | undefined, teamId: number, pred: (e: AfEvent) => boolean): number;
/**
 * Anchor for client-side minute extrapolation. Uses the API's period start
 * timestamps when present; for extra time (no timestamps) derives the anchor
 * from `elapsed` but keeps the previous anchor while still in the same period
 * so the client clock doesn't jitter between polls.
 */
export declare function liveClockFor(f: AfFixtureCore, nowSec: number, prev?: FbLiveClock | null): FbLiveClock | null;
export interface MapMatchOptions {
    nowSec: number;
    prevClock?: FbLiveClock | null;
}
/**
 * Map a fixture to its `fb_matches` row. When the fixture carries `events`
 * (live feed, detail feed) red cards are counted from them; otherwise
 * `homeRedCards`/`awayRedCards` are 0 and the writer must NOT overwrite the
 * stored counts (see `omitRedCardsWhenUnknown`).
 */
export declare function mapFixtureToMatch(f: AfFixtureCore & {
    events?: AfEvent[];
}, opts: MapMatchOptions): FbMatchDoc;
/** Strip red-card counts from a write when the source had no events. */
export declare function omitRedCardsWhenUnknown(doc: FbMatchDoc, hadEvents: boolean): Partial<FbMatchDoc>;
/**
 * Fields that change what a user sees in a list row. Used to skip Firestore
 * writes when nothing visible changed (writes are the dominant Firestore cost).
 */
export declare function matchFingerprint(d: Partial<FbMatchDoc>): string;
/**
 * Map API-Sports events to the app's timeline events.
 * @param starterIds player ids in each starting XI (when lineups are known),
 *   used to fix substitution direction if API-Sports ever reports it reversed.
 */
export declare function mapEvents(f: AfFixtureFull, starterIds?: Set<number>): FbEvent[];
/** Raw per-side stat values keyed by API-Sports type (null when absent). */
export declare function statValues(stats: AfTeamStatistics[] | undefined, homeId: number): Map<string, {
    home: number;
    away: number;
}>;
export declare function mapStatistics(f: AfFixtureFull): FbStatCategory[];
/**
 * Dominance share 0-100 per side from live stats. Weights reflect how much
 * each signal indicates territorial/attacking control: shots on target and
 * box shots weigh most, possession and corners less. Returns null when the
 * match has no stats yet.
 */
export declare function computePressureShare(f: AfFixtureFull): {
    home: number;
    away: number;
} | null;
export declare function nextPressure(prev: FbPressure | null | undefined, f: AfFixtureFull): FbPressure | null;
export declare function mapFixtureToDetail(f: AfFixtureFull, prevPressure?: FbPressure | null): FbMatchDetailDoc;
export declare function mapStandings(r: AfStandingsResponse): FbStandingsDoc;
export declare function mapTopPlayers(list: AfTopPlayerEntry[], metric: 'goals' | 'assists' | 'yellow'): FbTopPlayer[];
