/**
 * football/standings-repair.ts
 *
 * API-Sports sometimes returns a standings row without the team's id and crest
 * (seen for Club León in Liga MX 2026: `{ id: null, name: "Club Leon", logo:
 * null }`). Such a row can't be opened, highlighted or matched to a followed
 * team, so the missing team is identified before the table is stored:
 *
 *   1. from the previously stored table (no provider call), else
 *   2. from the league's team list (`/teams?league=&season=`, one call).
 *
 * A team is matched by name — the significant words of one name contained in
 * the other ("Club Leon" ↔ "Leon") — among the teams the table doesn't already
 * list; when a single row and a single team are left over they are paired.
 */

import * as logger from 'firebase-functions/logger';
import { afGet } from './apisports';
import type { AfTeamEntry } from './apisports-types';
import { deriveShortName } from './mapping';
import type { FbStandingsDoc, FbTeamRef } from '../shared/football/model';

export const hasTeamId = (id: unknown): boolean =>
  typeof id === 'string' && /^\d+$/.test(id) && id !== '0';

const GENERIC = new Set(['club', 'fc', 'cf', 'cd', 'ca', 'sc', 'ac', 'afc', 'de', 'del', 'la', 'el', 'the', 'deportivo']);

function nameWords(name: string): string[] {
  const all = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  const significant = all.filter(w => !GENERIC.has(w));
  return significant.length ? significant : all;
}

function sameTeamName(a: string, b: string): boolean {
  const wa = nameWords(a);
  const wb = nameWords(b);
  if (!wa.length || !wb.length) return false;
  return wa.every(w => wb.includes(w)) || wb.every(w => wa.includes(w));
}

/** Team ids the table already lists. */
function listedIds(doc: FbStandingsDoc): Set<string> {
  const ids = new Set<string>();
  for (const g of doc.groups) for (const r of g.rows) if (hasTeamId(r.team.id)) ids.add(r.team.id);
  return ids;
}

/** Names of the rows that came without a team id. */
export function rowsWithoutTeam(doc: FbStandingsDoc): string[] {
  const names = new Set<string>();
  for (const g of doc.groups) for (const r of g.rows) if (!hasTeamId(r.team.id)) names.add(r.team.name);
  return [...names];
}

/**
 * Give the id-less rows the team they belong to, choosing among `candidates`
 * (teams of the league that the table doesn't list). Pure — exported for tests.
 * Returns the names that could not be resolved.
 */
export function fillMissingTeams(doc: FbStandingsDoc, candidates: FbTeamRef[]): string[] {
  const listed = listedIds(doc);
  let pool = candidates.filter(c => hasTeamId(c.id) && !listed.has(c.id));
  const resolved = new Map<string, FbTeamRef>();
  const pending = rowsWithoutTeam(doc);

  for (const name of pending) {
    const hits = pool.filter(c => sameTeamName(name, c.name));
    if (hits.length === 1) {
      resolved.set(name, hits[0]);
      pool = pool.filter(c => c.id !== hits[0].id);
    }
  }
  const left = pending.filter(n => !resolved.has(n));
  if (left.length === 1 && pool.length === 1) resolved.set(left[0], pool[0]);

  for (const g of doc.groups) {
    for (const r of g.rows) {
      const team = hasTeamId(r.team.id) ? null : resolved.get(r.team.name);
      if (team) r.team = { ...team };
    }
  }
  return pending.filter(n => !resolved.has(n));
}

/**
 * Identify the teams of id-less rows (mutates and returns `doc`). `prev` is the
 * table stored before this refresh, when there is one.
 */
export async function repairStandings(doc: FbStandingsDoc, prev?: FbStandingsDoc | null): Promise<FbStandingsDoc> {
  if (!rowsWithoutTeam(doc).length) return doc;

  let unresolved = rowsWithoutTeam(doc);
  if (prev?.groups?.length) {
    const known: FbTeamRef[] = [];
    for (const g of prev.groups) for (const r of g.rows) if (hasTeamId(r.team.id)) known.push(r.team);
    unresolved = fillMissingTeams(doc, known);
  }
  if (unresolved.length) {
    try {
      const teams = await afGet<AfTeamEntry[]>('/teams', { league: doc.leagueId, season: doc.season });
      unresolved = fillMissingTeams(doc, teams.map(t => ({
        id: String(t.team.id),
        name: t.team.name,
        shortName: t.team.code || deriveShortName(t.team.name),
        logo: t.team.logo,
      })));
    } catch (err) {
      logger.warn('standings: could not load the league teams to repair a row', { league: doc.leagueId, err: String(err) });
    }
  }
  if (unresolved.length) {
    logger.warn('standings: rows left without a team id', { league: doc.leagueId, season: doc.season, unresolved });
    // Never store the literal "null": the app treats an empty id as "no team page".
    for (const g of doc.groups) for (const r of g.rows) if (!hasTeamId(r.team.id)) r.team = { ...r.team, id: '', logo: r.team.logo ?? '' };
  }
  return doc;
}
