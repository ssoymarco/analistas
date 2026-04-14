/**
 * mappers.ts
 *
 * Transform SportMonks API responses into Firestore document shapes.
 * Mirrors the client-side sportsApi.ts mapping logic for server-side use.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { getLeagueConfig } from './config';
import {
  LIVE_STATE_IDS, FINISHED_STATE_IDS, SM_STATE_IDS, STANDING_DETAIL_TYPES,
} from './types';
import type {
  SMFixture, SMStandingGroup, SMTopScorer,
  MatchDoc, TeamDoc, StandingRowDoc, StandingsDoc, TopScorerDoc, TopScorersDoc,
} from './types';

// ── State Label Mapping ─────────────────────────────────────────────────────

function getStateLabel(stateId: number): string | null {
  switch (stateId) {
    case SM_STATE_IDS.FIRST_HALF: return '1T';
    case SM_STATE_IDS.HALF_TIME:  return 'HT';
    case SM_STATE_IDS.SECOND_HALF: return '2T';
    case SM_STATE_IDS.EXTRA_TIME: return 'ET';
    case SM_STATE_IDS.PENALTIES:  return 'PEN';
    case SM_STATE_IDS.BREAK:     return 'HT';
    default: return null;
  }
}

function getMatchStatus(stateId: number): 'live' | 'finished' | 'scheduled' {
  if ((LIVE_STATE_IDS as Set<number>).has(stateId)) return 'live';
  if ((FINISHED_STATE_IDS as Set<number>).has(stateId)) return 'finished';
  return 'scheduled';
}

// ── Live Minute Calculation ─────────────────────────────────────────────────

function calculateLiveMinute(fixture: SMFixture): number | null {
  const status = getMatchStatus(fixture.state_id);
  if (status !== 'live') return null;
  if (fixture.state_id === SM_STATE_IDS.HALF_TIME) return 45;

  const kickoffTs = fixture.starting_at_timestamp;
  if (!kickoffTs) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const elapsedMin = Math.floor((nowSec - kickoffTs) / 60);

  // If second half (or beyond), subtract 15 min half-time break
  if (fixture.state_id === SM_STATE_IDS.SECOND_HALF) {
    return Math.max(46, elapsedMin - 15);
  }

  return Math.max(1, Math.min(elapsedMin, 45));
}

// ── Time Display ────────────────────────────────────────────────────────────

function formatTimeDisplay(fixture: SMFixture, status: 'live' | 'finished' | 'scheduled', minute: number | null): string {
  if (status === 'finished') return 'FT';
  if (status === 'live' && fixture.state_id === SM_STATE_IDS.HALF_TIME) return 'HT';
  if (status === 'live' && minute) return `${minute}'`;

  // Scheduled: show local time
  try {
    const dt = new Date(fixture.starting_at);
    return dt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return fixture.starting_at?.slice(11, 16) ?? '--:--';
  }
}

// ── Score Extraction ────────────────────────────────────────────────────────

function extractScores(fixture: SMFixture): {
  homeScore: number; awayScore: number;
  homeScoreHT: number | null; awayScoreHT: number | null;
} {
  let homeScore = 0, awayScore = 0;
  let homeScoreHT: number | null = null, awayScoreHT: number | null = null;

  if (fixture.scores && Array.isArray(fixture.scores)) {
    for (const s of fixture.scores) {
      if (s.description === 'CURRENT') {
        if (s.score.participant === 'home') homeScore = s.score.goals;
        else awayScore = s.score.goals;
      }
      if (s.description === '1ST_HALF') {
        if (s.score.participant === 'home') homeScoreHT = s.score.goals;
        else awayScoreHT = s.score.goals;
      }
    }
  }

  return { homeScore, awayScore, homeScoreHT, awayScoreHT };
}

// ── Fixture → MatchDoc ──────────────────────────────────────────────────────

export function mapFixtureToMatchDoc(fixture: SMFixture): MatchDoc | null {
  const participants = fixture.participants ?? [];
  const home = participants.find(p => p.meta?.location === 'home');
  const away = participants.find(p => p.meta?.location === 'away');

  if (!home || !away) return null;

  const status = getMatchStatus(fixture.state_id);
  const minute = calculateLiveMinute(fixture);
  const { homeScore, awayScore, homeScoreHT, awayScoreHT } = extractScores(fixture);
  const time = formatTimeDisplay(fixture, status, minute);

  // League info from config or SM response
  const leagueCfg = getLeagueConfig(fixture.league_id);
  const league = fixture.league;

  const homeTeam: TeamDoc = {
    id: String(home.id),
    name: home.name,
    shortName: home.short_code || home.name.slice(0, 3).toUpperCase(),
    logo: home.image_path,
  };

  const awayTeam: TeamDoc = {
    id: String(away.id),
    name: away.name,
    shortName: away.short_code || away.name.slice(0, 3).toUpperCase(),
    logo: away.image_path,
  };

  return {
    id: String(fixture.id),
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    homeScoreHT,
    awayScoreHT,
    status,
    stateId: fixture.state_id,
    stateLabel: getStateLabel(fixture.state_id),
    minute,
    time,
    league: leagueCfg?.name ?? league?.name ?? 'Unknown',
    leagueId: String(fixture.league_id),
    leagueLogo: league?.image_path ?? '',
    date: fixture.starting_at?.slice(0, 10) ?? '',
    startingAtUtc: fixture.starting_at ?? '',
    seasonId: fixture.season_id ?? null,
    updatedAt: Timestamp.now(),
  };
}

// ── Standings → StandingsDoc ────────────────────────────────────────────────

function getDetailValue(details: Array<{ type_id: number; value: number }> | undefined, typeId: number): number {
  return details?.find(d => d.type_id === typeId)?.value ?? 0;
}

export function mapStandingsToDoc(
  seasonId: number,
  leagueId: number,
  groups: SMStandingGroup[],
): StandingsDoc {
  const rows: StandingRowDoc[] = [];

  for (const group of groups) {
    const entries = group.standings?.data ?? [];
    for (const entry of entries) {
      if (!entry.participant) continue;

      rows.push({
        position: entry.position,
        team: {
          id: String(entry.participant.id),
          name: entry.participant.name,
          shortName: entry.participant.short_code || entry.participant.name.slice(0, 3).toUpperCase(),
          logo: entry.participant.image_path,
        },
        played:         getDetailValue(entry.details, STANDING_DETAIL_TYPES.GP),
        won:            getDetailValue(entry.details, STANDING_DETAIL_TYPES.W),
        drawn:          getDetailValue(entry.details, STANDING_DETAIL_TYPES.D),
        lost:           getDetailValue(entry.details, STANDING_DETAIL_TYPES.L),
        goalsFor:       getDetailValue(entry.details, STANDING_DETAIL_TYPES.GF),
        goalsAgainst:   getDetailValue(entry.details, STANDING_DETAIL_TYPES.GA),
        goalDifference: getDetailValue(entry.details, STANDING_DETAIL_TYPES.GD),
        points: entry.points,
        groupId: entry.group_id ?? null,
      });
    }
  }

  // Sort by position
  rows.sort((a, b) => a.position - b.position);

  return {
    seasonId,
    leagueId,
    rows,
    updatedAt: Timestamp.now(),
  };
}

// ── Top Scorers → TopScorersDoc ─────────────────────────────────────────────

export function mapTopScorersToDoc(
  seasonId: number,
  leagueId: number,
  scorers: SMTopScorer[],
): TopScorersDoc {
  // SM returns one entry per stat type. type_id 208 = goals (most common).
  // Group by player, take the highest total as goals.
  const playerMap = new Map<number, TopScorerDoc>();

  for (const s of scorers) {
    const pid = s.player_id;
    const existing = playerMap.get(pid);
    if (!existing || s.total > existing.goals) {
      playerMap.set(pid, {
        playerId: String(pid),
        playerName: s.player?.display_name ?? s.player?.common_name ?? `Player ${pid}`,
        playerImage: s.player?.image_path ?? '',
        teamName: '',  // SM top scorers don't always include team info
        teamLogo: '',
        goals: s.total,
        assists: 0,
        position: s.position,
      });
    }
  }

  const result = Array.from(playerMap.values());
  result.sort((a, b) => a.position - b.position);

  return {
    seasonId,
    leagueId,
    scorers: result.slice(0, 30), // Top 30
    updatedAt: Timestamp.now(),
  };
}
