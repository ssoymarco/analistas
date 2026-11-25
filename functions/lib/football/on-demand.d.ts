/**
 * football/on-demand.ts
 *
 * Data fetched the first time somebody asks for it (the `fbOnDemand` callable)
 * instead of on a schedule: team pages, player pages, match previews, season
 * calendars, tables of leagues the scheduled sync doesn't cover, search.
 *
 * Contract with the app (shapes in shared/football/model.ts):
 *   1. the app reads the Firestore doc directly;
 *   2. only when it is missing or past `expiresAt` it calls the function;
 *   3. the function re-checks freshness itself (it is the authority), asks
 *      API-Sports, stores the doc with a TTL and returns it.
 *
 * So API-Sports is hit once per document per TTL no matter how many users
 * open the screen, and the provider key never leaves the server.
 *
 * QUOTA: on-demand work must never starve the live poller. Every fetch first
 * checks the day's remaining requests against a reserve sized for the rest of
 * the day's polling (see `onDemandReserve`). When the reserve is reached the
 * function serves the stale doc if there is one, or fails with
 * `resource-exhausted` — live scores and pushes keep working either way.
 */
import type { FbCached, FbCoachDoc, FbLeagueDoc, FbLeagueFixturesDoc, FbMatchDetailDoc, FbMatchDoc, FbMatchPreviewDoc, FbOnDemandKind, FbPlayerDoc, FbSearchDoc, FbStandingsDoc, FbTeamDoc, FbTeamFixturesDoc, FbTeamStatsDoc, FbTopPlayersDoc } from '../shared/football/model';
/**
 * Requests to keep untouched for the scheduled pipeline for the rest of the
 * UTC day: ~3 calls per remaining minute (live polls + enrichment + fixture
 * sync at a busy-evening rate) plus a fixed cushion. Early in the day this
 * leaves ~3,000 of the Pro plan's 7,500 for on-demand work; the share grows as
 * the day goes by and the real polling stays under the worst case.
 */
export declare function onDemandReserve(nowMs: number): number;
export declare function budgetAllows(cost: number, nowMs: number): Promise<boolean>;
/** Lowercase ASCII letters/digits/spaces — the only characters API-Sports' search accepts. */
export declare function normalizeSearch(raw: unknown): string;
export interface MatchResult {
    match: FbMatchDoc | null;
    detail: FbMatchDetailDoc | null;
}
/**
 * Make sure `fb_matches/{id}` and `fb_match_details/{id}` exist and are as
 * fresh as the shared rules ask. Matches of priority leagues are enriched by
 * the live poller; this covers everything else (minor leagues, fixtures older
 * than the sync window, lineups before kickoff).
 */
export declare function ensureMatch(id: number, nowMs: number): Promise<MatchResult>;
export interface DayResult {
    date: string;
    /** Fixtures the provider has for that date (0 when the schedule owns it). */
    fixtures: number;
    synced: boolean;
}
/**
 * Store every fixture of a UTC date the scheduled sync doesn't cover (results
 * from before the window, fixtures further ahead than two weeks). One provider
 * call per date: past dates are final once fetched, future ones are refreshed
 * at most once a day. The rows land in `fb_matches`, so the app's listeners
 * pick them up.
 */
export declare function ensureDay(dateArg: unknown, nowMs: number): Promise<DayResult>;
export declare function ensureMatchPreview(id: number, nowMs: number): Promise<FbMatchPreviewDoc>;
export declare function ensureTeam(id: number, nowMs: number): Promise<FbTeamDoc>;
export declare function ensureTeamFixtures(id: number, seasonArg: number | undefined, nowMs: number): Promise<FbTeamFixturesDoc>;
export declare function ensureTeamStats(id: number, leagueId: number, season: number, nowMs: number): Promise<FbTeamStatsDoc>;
export declare function ensurePlayer(id: number, nowMs: number): Promise<FbPlayerDoc>;
export declare function ensureCoach(id: number, nowMs: number): Promise<FbCoachDoc>;
export declare function ensureLeague(id: number, nowMs: number): Promise<FbLeagueDoc>;
export declare function ensureLeagueFixtures(id: number, season: number, nowMs: number): Promise<FbLeagueFixturesDoc>;
type StandingsCached = FbStandingsDoc & Partial<FbCached>;
type TopPlayersCached = FbTopPlayersDoc & Partial<FbCached>;
export declare function ensureStandings(id: number, season: number, nowMs: number): Promise<StandingsCached>;
export declare function ensureTopPlayers(id: number, season: number, nowMs: number): Promise<TopPlayersCached>;
export declare function ensureSearch(rawQuery: unknown, nowMs: number): Promise<FbSearchDoc>;
export declare function mapLegacyPlayers(idsArg: unknown, nowMs: number): Promise<Record<string, string | null>>;
export interface OnDemandRequest {
    kind?: unknown;
    id?: unknown;
    leagueId?: unknown;
    season?: unknown;
    q?: unknown;
    ids?: unknown;
    date?: unknown;
}
/** Route one request. Always resolves to `{ kind, data }` or throws an HttpsError. */
export declare function handleOnDemand(req: OnDemandRequest | null | undefined, nowMs?: number): Promise<{
    kind: FbOnDemandKind;
    data: unknown;
}>;
/** Callable results must be plain JSON: drop Firestore Timestamps (`updatedAt`). */
export declare function toPlain<T>(value: T): T;
export {};
