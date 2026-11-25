// ── League configuration ─────────────────────────────────────────────────────
//
// The curated league catalog (names, flags, standings zones, popularity
// ordering) lives in ONE place shared with the backend:
//   functions/src/shared/football/leagues.ts
// This module is the app-side view of it plus the few helpers that need i18n.
// All ids are API-Sports league ids.
//
// Current seasons are NOT configured here — they come from the league catalog
// the backend refreshes nightly (see services/football/catalog.ts).

import i18n from '../i18n';
import {
  COPYRIGHT_SENSITIVE_LEAGUE_IDS as SHARED_SENSITIVE_IDS,
  FOOTBALL_LEAGUES,
  LEAGUE_POPULARITY,
  LEAGUE_POPULARITY_BY_COUNTRY,
  getFootballLeague,
  getLeaguePopularity as sharedLeaguePopularity,
  type FootballLeagueConfig,
  type LeagueMeta,
  type LeagueZone,
} from '../../functions/src/shared/football/leagues';

export type { LeagueZone, LeagueMeta };
export type LeagueConfig = FootballLeagueConfig;
export { LEAGUE_POPULARITY, LEAGUE_POPULARITY_BY_COUNTRY };

/** Curated leagues, in catalog order. */
export const AVAILABLE_LEAGUES: LeagueConfig[] = FOOTBALL_LEAGUES;

/** FIFA World Cup (national teams). */
export const WORLD_CUP_LEAGUE_ID = 1;

/** Find a curated league by its id (undefined for the ~1,200 uncurated ones). */
export function getLeagueConfig(id: number | string): LeagueConfig | undefined {
  return getFootballLeague(id);
}

/** Find a curated league by its name (case-insensitive; fallback when the id is missing). */
export function getLeagueConfigByName(name: string): LeagueConfig | undefined {
  const lower = name.toLowerCase();
  return AVAILABLE_LEAGUES.find(l => l.name.toLowerCase() === lower);
}

// ── Trademark-sensitive overrides ────────────────────────────────────────────
// Competitions whose official logo / English name we must not display (FIFA
// marks): the curated name + flag emoji are rendered instead.
export const COPYRIGHT_SENSITIVE_LEAGUE_IDS: ReadonlySet<number> = SHARED_SENSITIVE_IDS;

/** True when the given league should NOT show its remote logo / English name. */
export function isCopyrightSensitiveLeague(id: number | string): boolean {
  const numId = typeof id === 'string' ? Number(id) : id;
  return Number.isFinite(numId) && COPYRIGHT_SENSITIVE_LEAGUE_IDS.has(numId);
}

/** Friendlies come as several competitions ("Friendlies", "Friendlies Clubs",
 *  "Friendlies Women"…) — an implementation detail of the data the user
 *  shouldn't see. Detected by NAME. Note "friendl", not "friendly":
 *  "Friendlies" (plural) doesn't contain "friendly". */
export const FRIENDLIES_RE = /friendl|amistoso/i;

export function isFriendliesLeague(name: string | null | undefined): boolean {
  return !!name && FRIENDLIES_RE.test(name);
}

/**
 * Display name for a league: "Amistosos" for any friendlies competition, the
 * curated name for trademark-sensitive leagues, else whatever the data layer
 * already produced (`fallback`).
 */
export function getLeagueDisplayName(id: number | string, fallback: string): string {
  if (isFriendliesLeague(fallback)) return i18n.t('league.friendlies');
  if (!isCopyrightSensitiveLeague(id)) return fallback;
  return getLeagueConfig(id)?.name ?? fallback;
}

/**
 * Display flag/logo for a league. Trademark-sensitive leagues get their
 * curated emoji (e.g. 🌍 for the World Cup); everything else keeps the logo.
 */
export function getLeagueDisplayFlag(id: number | string, fallbackLogo: string): string {
  if (isCopyrightSensitiveLeague(id)) return getLeagueConfig(id)?.flag || '🌍';
  return fallbackLogo;
}

// ── "Sugerida" league logic (onboarding) ─────────────────────────────────────
//
// A league is marked "Sugerida" when it is one of the global top competitions
// or its country matches the device's region (expo-localization — no GPS).

/** Global top leagues suggested to everyone regardless of location. */
export const SUGGESTED_GLOBAL_LEAGUE_IDS: ReadonlySet<number> = new Set([
  39,   // Premier League
  140,  // LaLiga
  78,   // Bundesliga
  135,  // Serie A
  61,   // Ligue 1
  2,    // UEFA Champions League
  3,    // UEFA Europa League
  253,  // MLS
  262,  // Liga MX
  71,   // Brasileirão Serie A
]);

/** ISO 3166-1 alpha-2 → the `country` strings used in the league catalog. */
const COUNTRY_LEAGUE_NAMES: Record<string, ReadonlyArray<string>> = {
  AR: ['Argentina'],
  AU: ['Australia'],
  BE: ['Belgium'],
  BR: ['Brazil'],
  CL: ['Chile'],
  CN: ['China'],
  CO: ['Colombia'],
  DE: ['Germany'],
  DK: ['Denmark'],
  EC: ['Ecuador'],
  EG: ['Egypt'],
  ES: ['Spain'],
  FR: ['France'],
  GB: ['England', 'Scotland'],
  GR: ['Greece'],
  HN: ['Honduras'],
  IR: ['Iran'],
  IT: ['Italy'],
  JP: ['Japan'],
  KR: ['South-Korea', 'South Korea'],
  MA: ['Morocco'],
  MX: ['Mexico'],
  NL: ['Netherlands'],
  PE: ['Peru'],
  PT: ['Portugal'],
  PY: ['Paraguay'],
  QA: ['Qatar'],
  RO: ['Romania'],
  RU: ['Russia'],
  SA: ['Saudi-Arabia', 'Saudi Arabia'],
  SE: ['Sweden'],
  TR: ['Turkey'],
  US: ['USA'],
  UY: ['Uruguay'],
};

/** True when a league should be flagged "Sugerida" in onboarding for this device country. */
export function isSuggestedLeague(
  league: { id: number; country: string },
  deviceCountry: string | undefined,
): boolean {
  if (SUGGESTED_GLOBAL_LEAGUE_IDS.has(league.id)) return true;
  if (!deviceCountry) return false;
  const countries = COUNTRY_LEAGUE_NAMES[deviceCountry];
  return !!countries && countries.includes(league.country);
}

// ── Popularity ───────────────────────────────────────────────────────────────

/**
 * Popularity score of a league, 0-100 (higher lists first). Country override →
 * global table → small heuristic score (0-4) for uncurated leagues, which
 * needs `meta` (name / country / type) to tell a top division from a youth
 * cup. See the shared module for the tables.
 */
export function getLeaguePopularity(leagueId: number | string, country?: string, meta?: LeagueMeta): number {
  return sharedLeaguePopularity(leagueId, country, meta);
}
