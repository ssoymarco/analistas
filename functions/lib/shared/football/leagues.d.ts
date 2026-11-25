/**
 * shared/football/leagues.ts
 *
 * Single source of truth for the football league catalog, shared by the
 * Cloud Functions (sync budgets, notification priority) AND the app (league
 * ordering, standings zones, onboarding). The app imports this file directly
 * from `functions/src/shared/...`, so it MUST stay dependency-free: plain data
 * and pure functions only — no firebase, no react-native, no node imports.
 *
 * All IDs are API-Sports (api-football v3) league IDs. The previous provider's
 * (Sportmonks) IDs only survive in `SM_TO_AF_LEAGUE`, used once to migrate
 * users' saved favorites.
 *
 * Ordering: every league gets a popularity score 0-100. Curated leagues use
 * LEAGUE_POPULARITY (+ per-country overrides); the ~1,200 remaining API-Sports
 * leagues get a small heuristic score (0-4) so they always list AFTER every
 * curated league, top divisions of big football countries first and youth /
 * reserve / regional competitions last.
 */
/** A colored zone band in the standings table. */
export interface LeagueZone {
    /** Label shown in the legend (proper noun — same in all languages). */
    label: string;
    /** Hex color for the side bar and legend pill. */
    color: string;
    /** First position in the zone (inclusive). */
    from: number;
    /** Last position in the zone (inclusive). */
    to: number;
}
export interface FootballLeagueConfig {
    /** API-Sports league id. */
    id: number;
    /** Display name (curated; may differ from the API name, e.g. Spanish or trademark-safe). */
    name: string;
    /** Country (English, as API-Sports spells it) or a region label for international comps. */
    country: string;
    flag: string;
    /** Knockout competition — shows a bracket instead of a standings table. */
    isCup?: boolean;
    /** Has both a table AND a playoff bracket (Liga MX Liguilla, MLS Playoffs…). */
    hasPlayoffs?: boolean;
    /** Label for the playoff toggle ("Liguilla", "Playoffs", "Cuadrangulares"). */
    playoffsLabel?: string;
    /** Standings legend zones. Omitted → generic fallback in the UI. */
    zones?: LeagueZone[];
    /** Hidden search aliases (for trademark-sensitive names we can't display). */
    searchAliases?: string[];
}
export declare const FOOTBALL_LEAGUES: FootballLeagueConfig[];
/** Curated config for a league, or undefined when it's not in the catalog. */
export declare function getFootballLeague(id: number | string): FootballLeagueConfig | undefined;
export declare const COPYRIGHT_SENSITIVE_LEAGUE_IDS: ReadonlySet<number>;
export declare const LEAGUE_POPULARITY: Record<number, number>;
/**
 * Per-market overrides (ISO 3166-1 alpha-2 → leagueId → score). Missing pairs
 * fall back to LEAGUE_POPULARITY. Ported 1:1 from the pre-migration config.
 */
export declare const LEAGUE_POPULARITY_BY_COUNTRY: Record<string, Record<number, number>>;
/** Minimal league metadata the fallback heuristic needs (comes from API-Sports). */
export interface LeagueMeta {
    name: string;
    country: string;
    /** API-Sports league type: 'League' | 'Cup'. */
    type?: string;
}
/**
 * Heuristic 0-4 score for leagues outside LEAGUE_POPULARITY. Always below every
 * curated league (min curated score is 5), so the owner's ordering is preserved.
 */
export declare function fallbackLeagueScore(meta: LeagueMeta | undefined): number;
/**
 * Popularity score for a league (higher = earlier). Country override first,
 * then the global table, then the heuristic for uncatalogued leagues.
 *
 * @example
 *   getLeaguePopularity(262)               // 100 — Liga MX
 *   getLeaguePopularity(253, 'US')         // 100 — MLS for US users
 *   getLeaguePopularity(9999, undefined, { name: 'Liga II', country: 'Romania', type: 'League' }) // 2
 */
export declare function getLeaguePopularity(leagueId: number | string, country?: string, meta?: LeagueMeta): number;
/**
 * Comparator for sorting leagues/matches by popularity (desc), then by
 * country and name so the uncatalogued tail is stable and readable.
 */
export declare function compareLeagues(a: {
    id: number | string;
    name: string;
    country: string;
    type?: string;
}, b: {
    id: number | string;
    name: string;
    country: string;
    type?: string;
}, userCountry?: string): number;
/** Leagues the backend treats as high priority (faster syncs, scheduled standings). */
export declare function isPriorityLeague(leagueId: number | string): boolean;
export declare const SM_TO_AF_LEAGUE: Readonly<Record<number, number>>;
