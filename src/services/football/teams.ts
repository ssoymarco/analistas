/**
 * football/teams.ts
 *
 * Team, player and coach pages. All of it is on-demand data: the first open
 * of a team/player makes the `fbOnDemand` function fetch and cache it in
 * Firestore; every later open (by anyone) is a single document read.
 */

import type {
  FbCoachDoc, FbPlayerDoc, FbTeamDoc, FbTeamFixturesDoc, FbTeamStatsDoc,
} from '../../../functions/src/shared/football/model';
import type { Match } from '../../data/types';
import { matchFromLite, overlayMatches } from './mappers';
import { getTeamsFixturesBetween } from './matches';
import { loadCached } from './onDemand';

interface StaleOption<T> { onStale?: (doc: T) => void }

/** Team profile: identity, stadium, coach, squad, competitions and its main league/season. */
export function getTeam(teamId: number | string, opts: StaleOption<FbTeamDoc> = {}): Promise<FbTeamDoc> {
  return loadCached<FbTeamDoc>(`fb_teams/${teamId}`, { kind: 'team', id: teamId }, opts);
}

const HOUR = 3600;

/**
 * Every fixture of a team in a season (all competitions), chronological, with
 * today's scores overlaid from the live collection.
 */
export async function getTeamFixtures(teamId: number | string, season: number): Promise<Match[]> {
  const docData = await loadCached<FbTeamFixturesDoc>(
    `fb_team_fixtures/${teamId}_${season}`,
    { kind: 'teamFixtures', id: teamId, season },
  );
  const base = (docData.fixtures ?? []).map(f => matchFromLite(f, {}));
  const nowSec = Math.floor(Date.now() / 1000);
  const fresh = await getTeamsFixturesBetween([String(teamId)], nowSec - 36 * HOUR, nowSec + 36 * HOUR).catch(() => []);
  return overlayMatches(base, fresh);
}

/** Season statistics of a team in one competition (null when the provider has none). */
export async function getTeamStats(teamId: number | string, leagueId: number | string, season: number): Promise<FbTeamStatsDoc | null> {
  try {
    return await loadCached<FbTeamStatsDoc>(
      `fb_team_stats/${teamId}_${leagueId}_${season}`,
      { kind: 'teamStats', id: teamId, leagueId, season },
    );
  } catch {
    return null;
  }
}

/** Player profile with per-competition statistics of the running and previous season. */
export function getPlayer(playerId: number | string, opts: StaleOption<FbPlayerDoc> = {}): Promise<FbPlayerDoc> {
  return loadCached<FbPlayerDoc>(`fb_players/${playerId}`, { kind: 'player', id: playerId }, opts);
}

/** Coach profile and career. */
export function getCoach(coachId: number | string): Promise<FbCoachDoc> {
  return loadCached<FbCoachDoc>(`fb_coaches/${coachId}`, { kind: 'coach', id: coachId });
}

// ── Coach profile (shape rendered by the lineup tab's coach sheet) ───────────

export interface CoachCareerTeam {
  id: number;
  name: string;
  logo: string;
  start?: string;   // ISO date "2021-07-01"
  end?: string;     // ISO date, undefined if currently active
  active?: boolean;
}

export interface CoachCareerStats {
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  teamGoals: number;
  /** Percentage (0–100), rounded to integer */
  winRate: number;
}

export interface CoachSeasonStats {
  seasonId: number;
  teamId: number;
  teamName: string;
  teamLogo: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  teamGoals: number;
  goalsPerMatch: number;
}

export interface CoachProfile {
  id: number;
  name: string;
  photo?: string;
  dateOfBirth?: string;
  nationality?: string;
  height?: number;
  weight?: number;
  /** Clubs / national teams managed, newest first. */
  teams: CoachCareerTeam[];
  /** Win/draw/loss record. The data source has no coach statistics: always zeros (the sheet hides the block). */
  stats: CoachCareerStats;
  seasonHistory: CoachSeasonStats[];
}

/** Coach profile for the coach sheet, or null when it can't be loaded. */
export async function getCoachProfile(coachId: number): Promise<CoachProfile | null> {
  let coach: FbCoachDoc;
  try {
    coach = await getCoach(coachId);
  } catch {
    return null;
  }
  // One entry per club: consecutive stints at the same club are merged into
  // the most recent one (the list is newest first).
  const teams: CoachCareerTeam[] = [];
  const seen = new Set<string>();
  for (const job of coach.career) {
    if (seen.has(job.team.id)) continue;
    seen.add(job.team.id);
    teams.push({
      id: Number(job.team.id) || 0,
      name: job.team.name,
      logo: job.team.logo,
      start: job.start ?? undefined,
      end: job.end ?? undefined,
      active: job.end === null && coach.team?.id === job.team.id,
    });
  }
  const first = coach.firstName.split(' ')[0];
  const last = coach.lastName.split(' ')[0];
  return {
    id: coachId,
    name: first && last ? `${first} ${last}` : coach.name,
    photo: coach.photo ?? undefined,
    dateOfBirth: coach.birthDate ?? undefined,
    nationality: coach.nationality ?? undefined,
    teams,
    stats: { matchesPlayed: 0, wins: 0, draws: 0, losses: 0, teamGoals: 0, winRate: 0 },
    seasonHistory: [],
  };
}
