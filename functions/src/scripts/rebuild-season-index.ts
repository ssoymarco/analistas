/**
 * rebuild-season-index.ts
 *
 * Standalone script that (re)builds the `season_index/{leagueId}` documents
 * in Firestore. Those docs power the season picker dropdown in
 * LeagueDetailScreen — a single read per league returns every historical
 * edition we have access to.
 *
 * Schema written per league:
 *   season_index/{leagueId}
 *     leagueId:   number
 *     leagueName: string
 *     seasons: [
 *       { id: number, name: string, year: number, current: boolean,
 *         finished: boolean, pending: boolean }, …
 *     ]   // sorted newest → oldest
 *     updatedAt: Timestamp
 *
 * Run after a crawl, after adding new leagues to config, or any time the
 * season list seems stale:
 *
 *   cd functions && npm run rebuild:index
 *
 * Setup (same as the crawl): see crawl-historical.ts file header.
 */

import * as admin from 'firebase-admin';
import { LEAGUES } from '../config';
import { getSportmonksToken } from '../config';

const SM_BASE_URL = 'https://api.sportmonks.com/v3/football';
const REQUEST_PAUSE_MS = 300; // rebuild is small — can be faster than the crawl

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface SMSeason {
  id: number;
  league_id: number;
  name: string;
  starting_at: string | null;
  ending_at: string | null;
  is_current: boolean;
  pending: boolean;
  finished: boolean;
}

interface SMResp<T> {
  data: T;
  pagination?: { has_more?: boolean };
}

async function fetchSeasonsForLeague(leagueId: number): Promise<SMSeason[]> {
  const all: SMSeason[] = [];
  let page = 1;
  while (page <= 5) {
    const url = `${SM_BASE_URL}/seasons?api_token=${getSportmonksToken()}` +
                `&filters=seasonLeagues:${leagueId}&per_page=50&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`SportMonks ${res.status} on seasons (league ${leagueId})`);
    }
    const body = (await res.json()) as SMResp<SMSeason[]>;
    if (Array.isArray(body.data)) all.push(...body.data);
    if (!body.pagination?.has_more) break;
    page++;
    await sleep(REQUEST_PAUSE_MS);
  }
  return all;
}

interface SeasonEntry {
  id: number;
  name: string;
  /** Year extracted from starting_at, or from the name as a fallback. */
  year: number;
  current: boolean;
  finished: boolean;
  pending: boolean;
}

function buildEntries(seasons: SMSeason[]): SeasonEntry[] {
  return seasons
    .map(s => {
      const yearFromStart = (s.starting_at ?? '').slice(0, 4);
      const yearFromName  = (s.name ?? '').match(/(\d{4})/)?.[1] ?? '';
      const year = parseInt(yearFromStart || yearFromName, 10) || 0;
      return {
        id:       s.id,
        name:     s.name || String(s.id),
        year,
        current:  Boolean(s.is_current),
        finished: Boolean(s.finished),
        pending:  Boolean(s.pending),
      };
    })
    .sort((a, b) => b.year - a.year || b.id - a.id); // newest first
}

async function main(): Promise<void> {
  console.log('📋 Rebuilding season_index for all leagues');

  admin.initializeApp({ credential: admin.credential.applicationDefault() });
  const db = admin.firestore();

  try { getSportmonksToken(); }
  catch (e) { console.error('❌', (e as Error).message); process.exit(1); }

  let totalSeasons = 0;
  let i = 0;
  for (const league of LEAGUES) {
    i++;
    process.stdout.write(`  [${String(i).padStart(2)}/${LEAGUES.length}] ${league.name.padEnd(35)} `);
    try {
      const raw     = await fetchSeasonsForLeague(league.id);
      const seasons = buildEntries(raw);
      await db.collection('season_index').doc(String(league.id)).set({
        leagueId:   league.id,
        leagueName: league.name,
        seasons,
        updatedAt:  admin.firestore.Timestamp.now(),
      });
      totalSeasons += seasons.length;
      process.stdout.write(`${seasons.length} seasons\n`);
    } catch (err) {
      process.stdout.write(`failed: ${(err as Error).message}\n`);
    }
    await sleep(REQUEST_PAUSE_MS);
  }

  console.log(`\n✅ Done. ${totalSeasons} season entries across ${LEAGUES.length} leagues.`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Crashed:', err);
  process.exit(1);
});
