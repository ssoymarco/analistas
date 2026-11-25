/**
 * football/sync-league-data.ts
 *
 * League-level data: the league catalog (current season per league), standings
 * and top players.
 *
 * Budget:
 *   catalog                     1 call/day
 *   standings, event-driven     1 call per priority league that finished a match
 *                               (debounced through fb_meta/standingsDirty)
 *   standings, daily sweep      ~85 calls (every priority league in season)
 *   top scorers/assists/yellows 3 calls × ~45 leagues (popularity ≥ 50), daily
 */

import * as logger from 'firebase-functions/logger';
import { admin, db } from '../admin-init';
import { LEAGUE_POPULARITY } from '../shared/football/leagues';
import { afGet } from './apisports';
import type { AfLeagueEntry, AfStandingsResponse, AfTopPlayerEntry } from './apisports-types';
import type { FbCatalogEntry, FbStandingsDoc, FbTeamIndexDoc } from '../shared/football/model';
import { mapStandings, mapTopPlayers } from './mapping';
import { COL } from './store';

/** Shape of `fb_meta/leagueCatalog.leagues[id]` — shared with the app. */
export type CatalogEntry = FbCatalogEntry;

const now = () => admin.firestore.Timestamp.now();

export async function syncFootballCatalog(): Promise<number> {
  const list = await afGet<AfLeagueEntry[]>('/leagues', { current: 'true' });
  const leagues: Record<string, CatalogEntry> = {};
  for (const x of list) {
    const cur = x.seasons?.find(s => s.current) ?? x.seasons?.[x.seasons.length - 1];
    const cov = (cur?.coverage ?? {}) as { standings?: boolean };
    leagues[String(x.league.id)] = {
      n: x.league.name, c: x.country.name, t: x.league.type, logo: x.league.logo,
      flag: x.country.flag ?? null, s: cur?.year ?? null, st: !!cov.standings,
      b: cur?.start ?? null, e: cur?.end ?? null,
    };
  }
  await db.doc(`${COL.meta}/leagueCatalog`).set({ leagues, count: list.length, updatedAt: now() });
  logger.info('fbSyncCatalog: done', { leagues: list.length });
  return list.length;
}

async function loadCatalog(): Promise<Record<string, CatalogEntry>> {
  const s = await db.doc(`${COL.meta}/leagueCatalog`).get();
  return ((s.exists ? s.data()?.leagues : undefined) as Record<string, CatalogEntry>) ?? {};
}

async function refreshStandings(leagueId: string, cat: CatalogEntry | undefined): Promise<FbStandingsDoc | null> {
  if (!cat?.s || !cat.st) return null;
  const res = await afGet<AfStandingsResponse[]>('/standings', { league: leagueId, season: cat.s });
  if (!res.length) return null;
  const doc = mapStandings(res[0]);
  await db.doc(`${COL.standings}/${leagueId}_${cat.s}`).set({ ...doc, updatedAt: now() });
  return doc;
}

/**
 * `fb_meta/teamIndex`: every team that appears in a curated league's table,
 * most popular league first. One small doc the app reads once so team search
 * is instant and offline-friendly (no provider call per keystroke).
 */
export function buildTeamIndex(tables: FbStandingsDoc[]): FbTeamIndexDoc['teams'] {
  const sorted = [...tables].sort((a, b) =>
    (LEAGUE_POPULARITY[Number(b.leagueId)] ?? 0) - (LEAGUE_POPULARITY[Number(a.leagueId)] ?? 0));
  const seen = new Set<string>();
  const teams: FbTeamIndexDoc['teams'] = [];
  for (const table of sorted) {
    for (const group of table.groups) {
      for (const row of group.rows) {
        if (!row.team.id || seen.has(row.team.id)) continue;
        seen.add(row.team.id);
        teams.push({ i: row.team.id, n: row.team.name, l: table.leagueId });
      }
    }
  }
  return teams;
}

async function refreshTopPlayers(leagueId: string, cat: CatalogEntry | undefined): Promise<boolean> {
  if (!cat?.s) return false;
  const [scorers, assists, yellows] = await Promise.all([
    afGet<AfTopPlayerEntry[]>('/players/topscorers', { league: leagueId, season: cat.s }),
    afGet<AfTopPlayerEntry[]>('/players/topassists', { league: leagueId, season: cat.s }),
    afGet<AfTopPlayerEntry[]>('/players/topyellowcards', { league: leagueId, season: cat.s }),
  ]);
  await db.doc(`${COL.topscorers}/${leagueId}_${cat.s}`).set({
    leagueId, season: cat.s,
    scorers: mapTopPlayers(scorers, 'goals'),
    assists: mapTopPlayers(assists, 'assists'),
    yellowCards: mapTopPlayers(yellows, 'yellow'),
    updatedAt: now(),
  });
  return true;
}

/** Event-driven refresh of leagues marked dirty by the live poller. */
export async function syncDirtyStandings(maxLeagues = 15): Promise<number> {
  const ref = db.doc(`${COL.meta}/standingsDirty`);
  const snap = await ref.get();
  const dirty = ((snap.exists ? snap.data()?.leagues : undefined) as string[] | undefined) ?? [];
  if (!dirty.length) return 0;
  const cat = await loadCatalog();
  const batch = dirty.slice(0, maxLeagues);
  let done = 0;
  for (const id of batch) {
    try {
      if (await refreshStandings(id, cat[id])) done++;
    } catch (err) {
      logger.warn(`fbStandings: league ${id} failed`, { err: String(err) });
    }
  }
  await ref.set({ leagues: admin.firestore.FieldValue.arrayRemove(...batch), updatedAt: now() }, { merge: true });
  logger.info('fbStandings (dirty): done', { refreshed: done, pending: dirty.length - batch.length });
  return done;
}

/** Daily sweep: standings for every priority league, top players for the big ones. */
export async function syncAllLeagueTables(): Promise<{ standings: number; topPlayers: number }> {
  const cat = await loadCatalog();
  let standings = 0;
  let topPlayers = 0;
  const tables: FbStandingsDoc[] = [];
  const ids = Object.entries(LEAGUE_POPULARITY).filter(([, p]) => p >= 20).map(([id]) => id);
  for (const id of ids) {
    try {
      const table = await refreshStandings(id, cat[id]);
      if (table) { standings++; tables.push(table); }
    } catch (err) {
      logger.warn(`fbTables: standings ${id} failed`, { err: String(err) });
    }
    if ((LEAGUE_POPULARITY[Number(id)] ?? 0) >= 50) {
      try {
        if (await refreshTopPlayers(id, cat[id])) topPlayers++;
      } catch (err) {
        logger.warn(`fbTables: top players ${id} failed`, { err: String(err) });
      }
    }
  }
  // Only replace the index after a healthy sweep — a provider outage must not
  // leave the app with an empty search index.
  if (tables.length >= 20) {
    const teams = buildTeamIndex(tables);
    await db.doc(`${COL.meta}/teamIndex`).set({ teams, updatedAt: now() })
      .catch(err => logger.warn('fbTables: team index write failed', { err: String(err) }));
  }
  logger.info('fbTables: done', { standings, topPlayers });
  return { standings, topPlayers };
}
