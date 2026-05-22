/**
 * sync-teams.ts
 *
 * Cloud Function: syncs full team info for every team that plays in any of
 * the 51 configured leagues. Writes one `teams/{teamId}` doc per team with
 * enough detail to power TeamDetailScreen without any client-side
 * SportMonks calls.
 *
 * Architecture rationale: previously `useTeamDetail` hit the SportMonks
 * proxy three times per team-page open (fetchTeamById + fetchSquad +
 * fetchTeamRecentFixtures). With ~15k users that scales linearly into the
 * API quota. This function pulls the data once per day per league and
 * serves every user from Firestore.
 *
 * Schedule: every 24h. Team info (stadium, coach, founded year) changes on
 * a weekly-to-yearly timescale, so daily is generous.
 *
 * Cost: 51 leagues × 1 call/league (single page typically holds all teams
 * including pagination) ≈ 60-100 SM calls/day. ~0.1% of the Pro plan.
 */

import { admin, db } from './admin-init';
import * as logger from 'firebase-functions/logger';
import { LEAGUES } from './config';
import { fetchTeamsForSeason, type SMTeamFull } from './sportmonks';
import type { TeamFullDoc } from './types';

const SLEEP_BETWEEN_LEAGUES_MS = 500;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Pull the active coach (or fall back to the first listed) and derive their
 * display fields. Mirrors the client's existing useTeamDetail logic so a
 * page rendered from Firestore looks identical to one fetched from the
 * proxy.
 */
function pickCoach(team: SMTeamFull): { name: string; image: string; age: number } {
  const coaches = team.coaches ?? [];
  const active = coaches.find(c => c.active !== false) ?? coaches[0] ?? null;
  if (!active) return { name: '', image: '', age: 0 };
  const name = active.display_name || active.common_name || active.name || '';
  const image = active.image_path ?? '';
  let age = 0;
  if (active.date_of_birth) {
    const birth = new Date(active.date_of_birth);
    if (!isNaN(birth.getTime())) {
      const now = new Date();
      age = now.getFullYear() - birth.getFullYear();
      if (now.getMonth() < birth.getMonth() ||
          (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
        age--;
      }
    }
  }
  return { name, image, age };
}

function mapTeamToDoc(
  team: SMTeamFull,
  leagueId: number,
  leagueName: string,
  seasonId: number,
): TeamFullDoc {
  const coach = pickCoach(team);
  // For World Cup national teams SM often returns a club venue (e.g. the
  // Mexico fed page shows Soldier Field Chicago). Clear venue for league 732
  // so the client doesn't need its existing isWCNationalTeam hack later.
  const isWcNational = leagueId === 732;
  return {
    id:             String(team.id),
    name:           team.name,
    shortName:      team.short_code || team.name.slice(0, 3).toUpperCase(),
    logo:           team.image_path ?? '',
    country:        '', // SM doesn't include country name on the team payload — left blank
    founded:        team.founded ?? 0,
    venueName:      isWcNational ? '' : (team.venue?.name ?? ''),
    venueCity:      isWcNational ? '' : (team.venue?.city_name ?? ''),
    venueCapacity:  isWcNational ? 0  : (team.venue?.capacity ?? 0),
    venueImage:     isWcNational ? '' : (team.venue?.image_path ?? ''),
    coachName:      coach.name,
    coachImage:     coach.image,
    coachAge:       coach.age,
    leagueId,
    leagueName,
    currentSeasonId: seasonId,
    updatedAt:      admin.firestore.Timestamp.now(),
  };
}

export async function syncTeamsHandler(): Promise<void> {
  logger.info(`👥 syncTeams: starting for ${LEAGUES.length} leagues`);

  let totalTeams = 0;
  let leagueErrors = 0;

  for (const league of LEAGUES) {
    const seasonId = league.currentSeasonId;
    if (seasonId == null) {
      logger.debug(`👥 syncTeams: skipping ${league.name} — no currentSeasonId`);
      continue;
    }
    try {
      const teams = await fetchTeamsForSeason(seasonId);
      if (teams.length === 0) {
        logger.warn(`👥 syncTeams: 0 teams for ${league.name} (season ${seasonId})`);
        continue;
      }

      // Batch write. Firestore caps at 500 ops per batch — most leagues
      // (~20-50 teams) fit in one, but the safety check is here anyway.
      const batches: admin.firestore.WriteBatch[] = [];
      let current = db.batch();
      let opCount = 0;

      for (const team of teams) {
        const doc = mapTeamToDoc(team, league.id, league.name, seasonId);
        const ref = db.collection('teams').doc(doc.id);
        // `merge: true` is intentional — preserves overrides from other
        // sync paths (e.g. a future syncTeamSocial function adding twitter/
        // instagram handles without us re-fetching from SM).
        current.set(ref, doc, { merge: true });
        opCount++;
        if (opCount >= 499) {
          batches.push(current);
          current = db.batch();
          opCount = 0;
        }
      }
      if (opCount > 0) batches.push(current);

      await Promise.all(batches.map(b => b.commit()));

      totalTeams += teams.length;
      logger.info(`  ✓ ${league.name}: ${teams.length} teams`);

      await sleep(SLEEP_BETWEEN_LEAGUES_MS); // rate-limit courtesy
    } catch (err) {
      leagueErrors++;
      logger.error(`  ✗ ${league.name} (season ${league.currentSeasonId}):`, err);
    }
  }

  logger.info(`✅ syncTeams: wrote ${totalTeams} teams across ${LEAGUES.length - leagueErrors} leagues (${leagueErrors} errors)`);
}
