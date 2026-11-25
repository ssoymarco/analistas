/**
 * football/legacyMigration.ts
 *
 * One-time move of a user's saved data from the previous data provider's ids
 * (Sportmonks) to the current one (API-Sports), on the first launch of a build
 * that reads the `fb_*` collections.
 *
 * What is migrated and how:
 *   • followed teams, rival teams → `legacyTeamMap.json` (2,413 of 2,478 teams)
 *   • followed leagues            → SM_TO_AF_LEAGUE
 *   • followed players            → `legacyPlayerMap.json` for the popular ones,
 *                                   the backend (`fbOnDemand` legacyPlayers,
 *                                   which matches by surname + birth date) for
 *                                   the rest — resolved in the background
 *   • favorite / muted matches    → dropped (fixture ids can't be translated,
 *                                   and they only matter for a few days)
 *
 * Two id spaces must never mix, so the migration is recorded explicitly:
 *   - on the device, by MIGRATION_KEY in AsyncStorage (the favorites keys are
 *     rewritten in place; the old lists are kept under LEGACY_BACKUP_KEY);
 *   - in the cloud, by living in a different field: migrated favorites are
 *     stored in `users/{uid}.favoritesFb`, while `users/{uid}.favorites` keeps
 *     the legacy ids untouched for devices still running an old build.
 *
 * Push topics follow the ids: FavoritesContext unsubscribes the legacy topics
 * (fcmTopics.unsubscribeLegacyTopics) and subscribes the `fb_*` ones.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  mapLegacyLeagueId, mapLegacyTeamId, migrateLegacyIds,
} from '../../../functions/src/shared/football/legacy';
import legacyPlayerMap from '../../../functions/src/shared/football/legacyPlayerMap.json';
import { callOnDemand } from './onDemand';

// ── Storage keys ─────────────────────────────────────────────────────────────

export const FAVORITES_KEYS = {
  matches: 'analistas_match_favorites',
  teams:   'analistas_team_favorites',
  players: 'analistas_player_favorites',
  leagues: 'analistas_league_favorites',
  rivals:  'analistas_rival_teams',
} as const;

/** Set once the device's saved ids are API-Sports ids. */
export const MIGRATION_KEY = 'analistas_fb_migration_v1';
/** The pre-migration lists (legacy ids) — needed to unsubscribe old push topics and to retry players. */
export const LEGACY_BACKUP_KEY = 'analistas_legacy_favorites_v1';
/** Legacy player ids still waiting for the backend to translate them. */
export const PENDING_PLAYERS_KEY = 'analistas_fb_pending_players_v1';

/** Per-match state keyed by legacy fixture ids, and caches of legacy data: all dropped. */
const STALE_KEYS = [
  'analistas_muted_matches',
  'analistas_estadio_matches',
  'analistas_estadio_delays',
  'analistas_match_event_overrides',
  'analistas_recent_searches',
  'league_seasons_map_v2',
  'cache:matches:live',
];
const STALE_PREFIXES = ['analistas_cache_', 'cache:matches:date:'];

export interface FavoriteLists {
  matchIds: string[];
  teamIds: string[];
  playerIds: string[];
  leagueIds: string[];
  rivalTeamIds: string[];
}

export const EMPTY_FAVORITES: FavoriteLists = {
  matchIds: [], teamIds: [], playerIds: [], leagueIds: [], rivalTeamIds: [],
};

// ── Players ──────────────────────────────────────────────────────────────────

const PLAYER_MAP = legacyPlayerMap as Record<string, number>;

/**
 * The favorites picker used to store popular players under a name slug
 * ("pop_lionel_messi") instead of a numeric id. Slug → API-Sports player id.
 */
const PLAYER_SLUGS: Record<string, number> = {
  pop_achraf_hakimi: 9, pop_alejandro_balde: 161928, pop_alejandro_garnacho: 284324,
  pop_antoine_griezmann: 56, pop_bernardo_silva: 636, pop_bukayo_saka: 1460, pop_cody_gakpo: 247,
  pop_cristiano_ronaldo: 874, pop_darwin_nunez: 51617, pop_dusan_vlahovic: 30415, pop_endrick: 377122,
  pop_erling_haaland: 1100, pop_federico_valverde: 756, pop_florian_wirtz: 203224, pop_gavi: 296667,
  pop_guillermo_ochoa: 2098, pop_harry_kane: 184, pop_hirving_lozano: 248, pop_jonathan_david: 8489,
  pop_jude_bellingham: 129718, pop_julian_quinones: 35532, pop_karim_benzema: 759, pop_kevin_de_bruyne: 629,
  pop_khvicha_kvaratskhelia: 483, pop_kylian_mbappe: 278, pop_lamine_yamal: 386828, pop_leny_yoro: 342970,
  pop_lionel_messi: 154, pop_luis_diaz: 2489, pop_luka_modric: 754, pop_marcus_rashford: 909,
  pop_mathys_tel: 270510, pop_mohamed_salah: 306, pop_neymar_jr: 276, pop_nico_williams: 183799,
  pop_ousmane_dembele: 153, pop_pau_cubarsi: 396623, pop_pedri: 133609, pop_phil_foden: 631,
  pop_raphinha: 1496, pop_raul_jimenez: 2887, pop_richarlison: 2413, pop_robert_lewandowski: 521,
  pop_rodri: 44, pop_ruben_dias: 567, pop_ruben_neves: 2676, pop_santiago_gimenez: 94562,
  pop_serhou_guirassy: 21393, pop_tijjani_reijnders: 36902, pop_trent_alexander_arnold: 283,
  pop_victor_osimhen: 2780, pop_vinicius_junior: 762, pop_virgil_van_dijk: 290, pop_vitinha: 128384,
  pop_warren_zaire_emery: 336657,
};

/** API-Sports id of a legacy player id known locally (static map or slug), else undefined. */
export function mapLegacyPlayerLocally(legacyId: string): string | undefined {
  const hit = PLAYER_SLUGS[legacyId] ?? PLAYER_MAP[legacyId];
  return hit ? String(hit) : undefined;
}

// ── Pure translation ─────────────────────────────────────────────────────────

const dedupe = (ids: string[]) => Array.from(new Set(ids.filter(Boolean).map(String)));

export interface TranslatedFavorites {
  lists: FavoriteLists;
  /** Legacy player ids the backend still has to translate. */
  pendingPlayerIds: string[];
  /** Legacy ids with no equivalent (minor teams / leagues the new source doesn't have). */
  unmapped: { teams: string[]; leagues: string[]; rivals: string[] };
}

/** Translate legacy lists with what is available offline. Pure. */
export function translateLegacyFavorites(legacy: Partial<FavoriteLists>): TranslatedFavorites {
  const teams = migrateLegacyIds(legacy.teamIds ?? [], mapLegacyTeamId);
  const rivals = migrateLegacyIds(legacy.rivalTeamIds ?? [], mapLegacyTeamId);
  const leagues = migrateLegacyIds(legacy.leagueIds ?? [], mapLegacyLeagueId);

  const playerIds: string[] = [];
  const pendingPlayerIds: string[] = [];
  for (const id of dedupe(legacy.playerIds ?? [])) {
    const local = mapLegacyPlayerLocally(id);
    if (local) playerIds.push(local);
    else if (/^\d+$/.test(id)) pendingPlayerIds.push(id); // numeric → the backend can look it up
  }

  // A team can't be followed and a rival at once (following wins).
  const followed = new Set(teams.mapped);
  return {
    lists: {
      matchIds: [], // fixture ids don't translate
      teamIds: teams.mapped,
      playerIds: dedupe(playerIds),
      leagueIds: leagues.mapped,
      rivalTeamIds: rivals.mapped.filter(id => !followed.has(id)),
    },
    pendingPlayerIds,
    unmapped: { teams: teams.unmapped, leagues: leagues.unmapped, rivals: rivals.unmapped },
  };
}

/** Ask the backend to translate legacy player ids. Unknown ones come back null. */
export async function resolveLegacyPlayers(legacyIds: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (let i = 0; i < legacyIds.length; i += 40) {
    const chunk = legacyIds.slice(i, i + 40);
    const res = await callOnDemand<Record<string, string | null>>({ kind: 'legacyPlayers', ids: chunk });
    Object.assign(out, res);
  }
  return out;
}

// ── Device migration ─────────────────────────────────────────────────────────

function parseList(raw: string | null): string[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export async function readLocalFavorites(): Promise<FavoriteLists> {
  const [m, t, p, l, r] = await Promise.all([
    AsyncStorage.getItem(FAVORITES_KEYS.matches),
    AsyncStorage.getItem(FAVORITES_KEYS.teams),
    AsyncStorage.getItem(FAVORITES_KEYS.players),
    AsyncStorage.getItem(FAVORITES_KEYS.leagues),
    AsyncStorage.getItem(FAVORITES_KEYS.rivals),
  ]);
  return {
    matchIds: parseList(m), teamIds: parseList(t), playerIds: parseList(p),
    leagueIds: parseList(l), rivalTeamIds: parseList(r),
  };
}

export async function writeLocalFavorites(lists: FavoriteLists): Promise<void> {
  await AsyncStorage.multiSet([
    [FAVORITES_KEYS.matches, JSON.stringify(lists.matchIds)],
    [FAVORITES_KEYS.teams,   JSON.stringify(lists.teamIds)],
    [FAVORITES_KEYS.players, JSON.stringify(lists.playerIds)],
    [FAVORITES_KEYS.leagues, JSON.stringify(lists.leagueIds)],
    [FAVORITES_KEYS.rivals,  JSON.stringify(lists.rivalTeamIds)],
  ]);
}

export interface MigrationRecord {
  at: number;
  /** How many of each kind were carried over / had no equivalent. */
  teams: number; leagues: number; players: number; rivals: number;
  unmapped: number;
  pendingPlayers: number;
}

let migrationPromise: Promise<void> | null = null;

/**
 * Run the device migration if it hasn't run yet. Fast (AsyncStorage only — no
 * network) and idempotent; resolves when the favorites keys hold API-Sports
 * ids. The app waits for this before mounting anything that reads them.
 */
export function ensureLocalMigration(): Promise<void> {
  if (!migrationPromise) migrationPromise = runLocalMigration().catch(() => { migrationPromise = null; });
  return migrationPromise;
}

async function runLocalMigration(): Promise<void> {
  if (await AsyncStorage.getItem(MIGRATION_KEY)) return;

  const legacy = await readLocalFavorites();
  const hadData = Object.values(legacy).some(list => list.length > 0);
  let record: MigrationRecord = { at: Date.now(), teams: 0, leagues: 0, players: 0, rivals: 0, unmapped: 0, pendingPlayers: 0 };

  if (hadData) {
    const t = translateLegacyFavorites(legacy);
    // Order matters for crash safety: keep the originals first, flip the flag last.
    // Muted matches ride along: their legacy mute topics must be left too.
    const mutedMatchIds = parseList(await AsyncStorage.getItem('analistas_muted_matches'));
    await AsyncStorage.setItem(LEGACY_BACKUP_KEY, JSON.stringify({ ...legacy, mutedMatchIds }));
    if (t.pendingPlayerIds.length) await AsyncStorage.setItem(PENDING_PLAYERS_KEY, JSON.stringify(t.pendingPlayerIds));
    await writeLocalFavorites(t.lists);
    record = {
      at: Date.now(),
      teams: t.lists.teamIds.length,
      leagues: t.lists.leagueIds.length,
      players: t.lists.playerIds.length,
      rivals: t.lists.rivalTeamIds.length,
      unmapped: t.unmapped.teams.length + t.unmapped.leagues.length + t.unmapped.rivals.length,
      pendingPlayers: t.pendingPlayerIds.length,
    };
  }

  // Per-match state and caches built from legacy data (also present on a
  // device that never followed anything).
  try {
    const keys = await AsyncStorage.getAllKeys();
    const stale = keys.filter(k => STALE_KEYS.includes(k) || STALE_PREFIXES.some(p => k.startsWith(p)));
    if (stale.length) await AsyncStorage.multiRemove(stale);
  } catch { /* stale caches expire on their own */ }

  await AsyncStorage.setItem(MIGRATION_KEY, JSON.stringify(record));
}

/** The pre-migration lists (legacy ids) plus the matches that were muted, or null when this device had none. */
export async function readLegacyBackup(): Promise<(FavoriteLists & { mutedMatchIds: string[] }) | null> {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_BACKUP_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<FavoriteLists & { mutedMatchIds: string[] }>;
    return { ...EMPTY_FAVORITES, mutedMatchIds: [], ...v };
  } catch {
    return null;
  }
}

/**
 * Background step: translate the legacy player ids the device couldn't map on
 * its own. Returns the API-Sports ids to add to the followed players (empty
 * when there is nothing pending or the backend can't be reached — it is
 * retried on the next launch). Ids the backend has no match for are dropped.
 */
export async function resolvePendingPlayers(): Promise<string[]> {
  const pending = parseList(await AsyncStorage.getItem(PENDING_PLAYERS_KEY));
  if (!pending.length) return [];
  const resolved = await resolveLegacyPlayers(pending);
  const answered = pending.filter(id => id in resolved);
  const stillPending = pending.filter(id => !(id in resolved));
  if (stillPending.length) await AsyncStorage.setItem(PENDING_PLAYERS_KEY, JSON.stringify(stillPending));
  else await AsyncStorage.removeItem(PENDING_PLAYERS_KEY);
  return dedupe(answered.map(id => resolved[id]).filter((v): v is string => !!v));
}

/**
 * Translate a cloud favorites object that still holds legacy ids
 * (`users/{uid}.favorites`), including the backend lookup for players.
 */
export async function migrateRemoteFavorites(legacy: Partial<FavoriteLists>): Promise<FavoriteLists> {
  const t = translateLegacyFavorites(legacy);
  if (!t.pendingPlayerIds.length) return t.lists;
  let extra: string[] = [];
  try {
    const resolved = await resolveLegacyPlayers(t.pendingPlayerIds);
    extra = Object.values(resolved).filter((v): v is string => !!v);
  } catch { /* players the backend couldn't translate are left out */ }
  return { ...t.lists, playerIds: dedupe([...t.lists.playerIds, ...extra]) };
}
