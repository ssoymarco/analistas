// ── SportMonks → App Type Adapter Layer ──────────────────────────────────────
//
// This file maps raw SportMonks responses to the app's own types.
// Components import ONLY from this file — never from sportmonks.ts directly.
// If the API is down or returns an error, we fall back to mock data.

import { AppCache, CacheTTL } from './cache';
import { captureError } from './sentry';

import type {
  Match,
  MatchStatus,
  League,
  LeagueStanding,
  MatchEventType,
  MatchEvent,
  MatchStatCategory,
  MatchDetail,
  MatchVenue,
  LineupPlayer,
  MatchLineup,
  H2HResult,
  Team,
  OddsMarket,
  PressureIndex,
  TeamFormEntry,
  MissingPlayer,
  MatchPrediction,
  RefereeStats,
} from '../data/types';

import {
  fetchFixturesByDate,
  fetchFixtureById,
  fetchLivescores,
  fetchStandings,
  fetchTopScorers,
  fetchH2H,
  fetchTeamById,
  fetchTeamsBySeasonId,
  fetchSquad,
  fetchSidelinedByTeam,
  fetchRefereeStats,
  fetchTeamRecentFixtures,
  fetchPredictions,
  fetchPlayerById,
  SM_STATE_IDS,
  SM_EVENT_TYPES,
  SM_STAT_TYPES,
  type SMFixture,
  type SMParticipant,
  type SMScore,
  type SMEvent,
  type SMStatistic,
  type SMStandingGroup,
  type SMLineupEntry,
  type SMTopScorer,
  type SMVenue,
  type SMFixtureReferee,
  type SMFixtureTVStation,
  type SMWeatherReport,
  type SMOdd,
  type SMSidelined,
  type SMRefereeStats,
  type SMPrediction,
  type SMRound,
  type SMStage,
  fetchFixturesBySeasonId,
  fetchLivescoresLatest,
  fetchGroupsBySeason,
  fetchAggregateById,
  fetchFixturesByStage,
  type SMGroup,
  type SMAggregate,
} from './sportmonks';

import type { NewsArticle, CupGroup, CupGroupsResult } from '../data/types';
import { AVAILABLE_LEAGUES, getLeagueConfig, LEAGUE_IDS } from '../config/leagues';
import i18n from '../i18n';

// ── State Mapping ───────────────────────────────────────────────────────────

const LIVE_STATE_IDS = new Set<number>([
  SM_STATE_IDS.FIRST_HALF,
  SM_STATE_IDS.HALF_TIME,
  SM_STATE_IDS.SECOND_HALF,
  SM_STATE_IDS.EXTRA_TIME,
  SM_STATE_IDS.PENALTIES,
  SM_STATE_IDS.BREAK,
]);

const FINISHED_STATE_IDS = new Set<number>([
  SM_STATE_IDS.FULL_TIME,
  SM_STATE_IDS.FINISHED_AET,
  SM_STATE_IDS.FINISHED_PEN,
]);

// State IDs that definitively mean "not playing" (postponed, cancelled, etc.)
const DEAD_STATE_IDS = new Set<number>([
  SM_STATE_IDS.POSTPONED, SM_STATE_IDS.CANCELLED,
  SM_STATE_IDS.SUSPENDED,  SM_STATE_IDS.INTERRUPTED,
  SM_STATE_IDS.ABANDONED,  SM_STATE_IDS.DELETED, SM_STATE_IDS.TBD,
]);

/**
 * Map a SportMonks state_id to our MatchStatus.
 *
 * Time-based fallback: LATAM/Asian feeds (e.g. Liga MX) can lag and keep
 * state_id = NOT_STARTED (or even 0/undefined) well into the match. If the
 * kick-off is more than 2 minutes in the past but less than 135 min ago, and
 * the state is not definitively "dead", we infer "live".
 */
function mapStateToStatus(stateId: number, startingAt?: string): MatchStatus {
  if (LIVE_STATE_IDS.has(stateId)) return 'live';
  if (FINISHED_STATE_IDS.has(stateId)) return 'finished';
  if (DEAD_STATE_IDS.has(stateId)) return 'scheduled'; // postponed/cancelled → never infer live
  // Time-based live inference (applies to NOT_STARTED, 0, undefined, or any unexpected id)
  if (startingAt) {
    const kickoff = new Date(startingAt.replace(' ', 'T') + 'Z');
    const elapsed = (Date.now() - kickoff.getTime()) / 60000;
    if (elapsed > 2 && elapsed < 135) return 'live';
  }
  return 'scheduled';
}

/**
 * Re-evaluate live status of already-mapped Match objects.
 * Used for cache hits and after fast-poll merges: Match objects have status
 * baked in at fetch time, so a match that was "scheduled" when cached — or one
 * downgraded by a lagging /livescores/latest state_id=1 feed — may now be "live".
 * Exported so the list hook can apply it defensively after patch merges.
 */
export function reapplyLiveStatus(matches: Match[]): Match[] {
  return matches.map(m => {
    if (m.status !== 'scheduled' || !m.startingAtUtc) return m;
    const kickoff = new Date(m.startingAtUtc.replace(' ', 'T') + 'Z');
    const elapsed = (Date.now() - kickoff.getTime()) / 60000;
    if (elapsed <= 2 || elapsed >= 135) return m;
    // Infer live — calculate approximate minute
    let minute = Math.floor(elapsed);
    if (minute > 50) minute = Math.max(46, minute - 15); // account for HT break
    minute = Math.max(1, Math.min(minute, 120));
    return { ...m, status: 'live' as const, time: `${minute}'`, minute };
  });
}

/** Human-readable state label for the live indicator (e.g. "1T", "HT", "2T", "ET", "PEN") */
function mapStateLabel(stateId: number): string | undefined {
  switch (stateId) {
    case SM_STATE_IDS.FIRST_HALF:    return '1T';
    case SM_STATE_IDS.HALF_TIME:     return 'HT';
    case SM_STATE_IDS.SECOND_HALF:   return '2T';
    case SM_STATE_IDS.EXTRA_TIME:    return 'ET';
    case SM_STATE_IDS.PENALTIES:     return 'PEN';
    case SM_STATE_IDS.BREAK:         return 'HT';
    default: return undefined;
  }
}

// ── Score Helpers ───────────────────────────────────────────────────────────

function getGoals(scores: SMScore[] | undefined, location: 'home' | 'away'): number {
  if (!scores || scores.length === 0) return 0;
  // "CURRENT" works for live + finished
  const current = scores.find(
    s => s.description === 'CURRENT' && s.score.participant === location,
  );
  if (current) return current.score.goals;
  // Fallback: 2ND_HALF or FT
  const ft = scores.find(
    s => (s.description === '2ND_HALF' || s.description === 'FT') && s.score.participant === location,
  );
  return ft?.score.goals ?? 0;
}

function getHalfTimeGoals(scores: SMScore[] | undefined, location: 'home' | 'away'): number | undefined {
  if (!scores || scores.length === 0) return undefined;
  const ht = scores.find(
    s => s.description === '1ST_HALF' && s.score.participant === location,
  );
  return ht !== undefined ? ht.score.goals : undefined;
}

// ── Timezone utilities ───────────────────────────────────────────────────────
// SportMonks returns starting_at as UTC ("2026-04-15 00:00:00").
// These helpers convert UTC to the device's local timezone automatically —
// no hardcoding required. Works for any timezone worldwide.

/**
 * Convert a SportMonks UTC timestamp ("YYYY-MM-DD HH:MM:SS") to local date string.
 * e.g. "2026-04-15 00:00:00" UTC → "2026-04-14" in Mexico City (UTC-5)
 */
function utcStringToLocalDateStr(startingAt: string): string {
  const dt = new Date(startingAt.replace(' ', 'T') + 'Z');
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Given a local date string ("YYYY-MM-DD"), return the UTC date(s) that overlap
 * with that local calendar day. Returns 1 string when local day == UTC day, or
 * 2 strings when the evening crosses a UTC midnight boundary.
 *
 * e.g. for UTC-5 on "2026-04-14":
 *   local midnight  = 05:00 UTC → UTC date "2026-04-14"
 *   local 23:59     = 04:59 UTC next day → UTC date "2026-04-15"
 *   → returns ["2026-04-14", "2026-04-15"]
 */
function getUtcDatesForLocalDay(localDateStr: string): string[] {
  // Parsing without 'Z' uses local timezone ← this is intentional
  const startOfDay = new Date(`${localDateStr}T00:00:00`);
  const endOfDay   = new Date(`${localDateStr}T23:59:59`);
  const utcStart = startOfDay.toISOString().slice(0, 10);
  const utcEnd   = endOfDay.toISOString().slice(0, 10);
  return utcStart === utcEnd ? [utcStart] : [utcStart, utcEnd];
}

// ── Time Display ────────────────────────────────────────────────────────────

/**
 * Read the authoritative live minute from SportMonks' `periods` array.
 * The period with `ticking: true` is the current phase; its `minutes` field is
 * the real game clock (e.g. "90" during 90+5 stoppage time — broadcasters display
 * "90+5" which we approximate via its `minutes` + stoppage rendering separately
 * via stateLabel). This avoids the wall-time drift that compounds with stoppage.
 */
function getRealMinute(fixture: SMFixture): number | undefined {
  const periods = fixture.periods;
  if (!periods || periods.length === 0) return undefined;
  const ticking = periods.find(p => p.ticking);
  if (!ticking) return undefined;
  if (typeof ticking.minutes === 'number' && ticking.minutes >= 0) {
    return Math.max(1, Math.min(ticking.minutes, 120));
  }
  // Fallback: derive from started timestamp + counts_from
  if (ticking.started && typeof ticking.counts_from === 'number') {
    const secondsSinceStart = Math.max(0, Math.floor(Date.now() / 1000 - ticking.started));
    const minute = ticking.counts_from + Math.floor(secondsSinceStart / 60);
    return Math.max(1, Math.min(minute, 120));
  }
  return undefined;
}

/** Elapsed minutes since kick-off, accounting for half-time break when known. */
function calcElapsed(startingAt: string, stateId: number): number {
  const kickoff = new Date(startingAt.replace(' ', 'T') + 'Z');
  let elapsed = Math.floor((Date.now() - kickoff.getTime()) / 60000);
  if (stateId === SM_STATE_IDS.SECOND_HALF) {
    // Known 2nd half — subtract the ~15 min HT break
    elapsed = Math.max(46, elapsed - 15);
  } else if (stateId === SM_STATE_IDS.NOT_STARTED && elapsed > 50) {
    // Time-inferred live: if >50 min since kick-off, likely 2nd half
    elapsed = Math.max(46, elapsed - 15);
  }
  return Math.max(1, Math.min(elapsed, 120));
}

function getTimeDisplay(fixture: SMFixture): string {
  const status = mapStateToStatus(fixture.state_id, fixture.starting_at);

  if (status === 'finished') return 'FT';

  if (status === 'live') {
    if (fixture.state_id === SM_STATE_IDS.HALF_TIME) return 'HT';
    // Prefer SportMonks' authoritative in-game clock over wall-time math
    const real = getRealMinute(fixture);
    if (real !== undefined) return `${real}'`;
    return `${calcElapsed(fixture.starting_at, fixture.state_id)}'`;
  }

  // Scheduled — show kick-off time in HH:MM (local time)
  try {
    const dt = new Date(fixture.starting_at.replace(' ', 'T') + 'Z');
    return dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return fixture.starting_at.slice(11, 16);
  }
}

function getLiveMinute(fixture: SMFixture): number | undefined {
  if (mapStateToStatus(fixture.state_id, fixture.starting_at) !== 'live') return undefined;
  if (fixture.state_id === SM_STATE_IDS.HALF_TIME) return 45;
  // Prefer SportMonks' authoritative in-game clock over wall-time math
  const real = getRealMinute(fixture);
  if (real !== undefined) return real;
  return calcElapsed(fixture.starting_at, fixture.state_id);
}

/**
 * Extract a live-clock anchor that lets the client smoothly advance the
 * minute/seconds between server polls. Only populated when a period is
 * actively ticking and we have both the `started` unix timestamp and a valid
 * `counts_from` base minute. Returns undefined for HT/scheduled/finished.
 */
function getLiveClockAnchor(fixture: SMFixture):
  | { periodStartedAt: number; periodMinuteOffset: number }
  | undefined
{
  const periods = fixture.periods;
  if (!periods || periods.length === 0) return undefined;
  const ticking = periods.find(p => p.ticking);
  if (!ticking) return undefined;
  if (typeof ticking.started !== 'number' || ticking.started <= 0) return undefined;
  const offset = typeof ticking.counts_from === 'number' ? ticking.counts_from : 0;
  return {
    periodStartedAt: ticking.started,
    periodMinuteOffset: Math.max(0, offset),
  };
}

// ── Participant Helpers ─────────────────────────────────────────────────────

function getParticipant(fixture: SMFixture, location: 'home' | 'away'): SMParticipant | undefined {
  return fixture.participants?.find(p => p.meta?.location === location);
}

function mapParticipantToTeam(p: SMParticipant | undefined): Team {
  if (!p) return { id: '0', name: i18n.t('cup.toBeDefined'), shortName: 'TBD', logo: '⚽' };
  const name = translatePlaceholderName(p.name);
  return {
    id: String(p.id),
    name,
    shortName: p.short_code || name.slice(0, 3).toUpperCase(),
    logo: p.image_path || '⚽',
  };
}

// ── Fixture → Match Mapper ──────────────────────────────────────────────────

function mapFixtureToMatch(fixture: SMFixture): Match {
  const home = getParticipant(fixture, 'home');
  const away = getParticipant(fixture, 'away');
  const status = mapStateToStatus(fixture.state_id, fixture.starting_at);

  // league_id can be 0/null/missing on some fixtures — fall back to the included league object's id
  const rawLeagueId: number = fixture.league_id || (fixture.league as any)?.id || 0;
  const leagueConfig = getLeagueConfig(rawLeagueId);
  // Use LOCAL date (device timezone) — SportMonks timestamps are UTC
  const dateStr = utcStringToLocalDateStr(fixture.starting_at);

  // season_id can be missing — fall back to the league's current season from our config
  const rawSeasonId: number = fixture.season_id || leagueConfig?.currentSeasonId || 0;

  const homeScoreHT = getHalfTimeGoals(fixture.scores, 'home');
  const awayScoreHT = getHalfTimeGoals(fixture.scores, 'away');

  // Red cards from statistics (type_id=83) — match by participant_id like mapStatistics does
  const getStatVal = (participantId: number, typeId: number): number => {
    const stat = (fixture.statistics ?? []).find(
      s => s.type_id === typeId && s.participant_id === participantId,
    );
    const raw = stat?.data?.value;
    return typeof raw === 'number' ? raw : parseFloat(String(raw)) || 0;
  };
  const homeRedCards = getStatVal(home?.id ?? -1, SM_STAT_TYPES.REDCARDS) || undefined;
  const awayRedCards = getStatVal(away?.id ?? -1, SM_STAT_TYPES.REDCARDS) || undefined;

  return {
    id: String(fixture.id),
    homeTeam: mapParticipantToTeam(home),
    awayTeam: mapParticipantToTeam(away),
    homeScore: getGoals(fixture.scores, 'home'),
    awayScore: getGoals(fixture.scores, 'away'),
    homeScoreHT,
    awayScoreHT,
    homeRedCards,
    awayRedCards,
    status,
    time: getTimeDisplay(fixture),
    minute: getLiveMinute(fixture),
    stateLabel: mapStateLabel(fixture.state_id),
    liveClock: getLiveClockAnchor(fixture),
    league: fixture.league?.name ?? leagueConfig?.name ?? 'Unknown',
    leagueLogo: fixture.league?.image_path || undefined,
    leagueId: rawLeagueId > 0 ? String(rawLeagueId) : '',
    date: dateStr,
    isFavorite: false,
    startingAtUtc: fixture.starting_at,
    seasonId: rawSeasonId > 0 ? rawSeasonId : undefined,
  };
}

// ── Event Type Mapper ───────────────────────────────────────────────────────

function mapEventType(typeId: number): MatchEventType {
  switch (typeId) {
    case SM_EVENT_TYPES.GOAL: return 'goal';
    case SM_EVENT_TYPES.OWN_GOAL: return 'own-goal';
    case SM_EVENT_TYPES.PENALTY_GOAL: return 'penalty-goal';
    case SM_EVENT_TYPES.PENALTY_MISS: return 'penalty-miss';
    case SM_EVENT_TYPES.YELLOW_CARD: return 'yellow';
    case SM_EVENT_TYPES.SECOND_YELLOW: return 'second-yellow';
    case SM_EVENT_TYPES.RED_CARD: return 'red';
    case SM_EVENT_TYPES.SUBSTITUTION: return 'sub';
    case SM_EVENT_TYPES.VAR: return 'var';
    default: return 'goal'; // filtered out before this is reached
  }
}

function mapEventTeam(event: SMEvent, fixture: SMFixture): 'home' | 'away' {
  const home = getParticipant(fixture, 'home');
  return event.participant_id === home?.id ? 'home' : 'away';
}

/** Set of known SportMonks type_ids we want to display */
const KNOWN_EVENT_TYPE_IDS = new Set<number>(Object.values(SM_EVENT_TYPES));

function mapEvents(events: SMEvent[] | undefined, fixture: SMFixture): MatchEvent[] {
  if (!events) return [];

  // 1. Drop unknown type_ids — SportMonks sends internal aggregate / cup-tie
  //    events with undocumented IDs that would otherwise fall into the default
  //    branch and show up as phantom goals.
  // 2. Deduplicate: same player + same minute + same type → keep first.
  //    Two-legged ties sometimes duplicate the same goal with slightly different
  //    records (e.g. aggregate tracking entries at a nearby minute).
  const seen = new Set<string>();

  return events
    .filter(e => KNOWN_EVENT_TYPE_IDS.has(e.type_id))
    .filter(e => {
      const key = `${e.player_id}:${e.minute}:${e.type_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(e => ({
      id: String(e.id),
      minute: e.minute,
      addedTime: e.extra_minute ?? undefined,
      type: mapEventType(e.type_id),
      team: mapEventTeam(e, fixture),
      player: e.player_name,
      relatedPlayer: e.related_player_name ?? undefined,
    }));
}

// ── Statistics Mapper ───────────────────────────────────────────────────────

const STAT_TYPE_NAMES: Record<number, string> = {
  // General / Ataque
  [SM_STAT_TYPES.BALL_POSSESSION]:            'Posesión',
  [SM_STAT_TYPES.GOALS]:                      'Goles',
  [SM_STAT_TYPES.GOAL_ATTEMPTS]:              'Total remates',
  [SM_STAT_TYPES.SHOTS_ON_TARGET]:            'Remates al arco',
  [SM_STAT_TYPES.SHOTS_BLOCKED]:              'Remates bloqueados',
  [SM_STAT_TYPES.GOAL_KICKS]:                 'Saques de meta',
  [SM_STAT_TYPES.OFFSIDES]:                   'Fueras de juego',
  // Creación / Pases
  [SM_STAT_TYPES.ASSISTS]:                    'Asistencias',
  [SM_STAT_TYPES.FREE_KICKS]:                 'Tiros libres',
  [SM_STAT_TYPES.THROWINS]:                   'Saques de banda',
  [SM_STAT_TYPES.SUCCESSFUL_DRIBBLES_PCT]:    'Regates exitosos',
  [SM_STAT_TYPES.BIG_CHANCES_CREATED]:        'Grandes chances',
  [SM_STAT_TYPES.BIG_CHANCES_MISSED]:         'Chances falladas',
  // xG family
  [SM_STAT_TYPES.EXPECTED_GOALS]:             'Goles esperados (xG)',
  [SM_STAT_TYPES.EXPECTED_GOALS_ON_TARGET]:   'xG al arco (xGoT)',
  [SM_STAT_TYPES.NP_EXPECTED_GOALS]:          'xG sin penales (npxG)',
  // Defensa
  [SM_STAT_TYPES.CORNERS]:                    'Saques de esquina',
  [SM_STAT_TYPES.SAVES]:                      'Salvadas de portero',
  // Disciplina
  [SM_STAT_TYPES.FOULS]:                      'Faltas',
  [SM_STAT_TYPES.YELLOWCARDS]:                'Tarjetas amarillas',
  [SM_STAT_TYPES.REDCARDS]:                   'Tarjetas rojas',
};

// Which stat IDs are percentages (displayed with % suffix)
const PERCENTAGE_STAT_IDS = new Set<number>([
  SM_STAT_TYPES.BALL_POSSESSION,
  SM_STAT_TYPES.SUCCESSFUL_DRIBBLES_PCT,
]);

// Which stat IDs are decimal (xG family — show 2 decimal places)
const DECIMAL_STAT_IDS = new Set<number>([
  SM_STAT_TYPES.EXPECTED_GOALS,
  SM_STAT_TYPES.EXPECTED_GOALS_ON_TARGET,
  SM_STAT_TYPES.NP_EXPECTED_GOALS,
]);

// Category groupings — order matters for display
// First category = "Estadísticas importantes" always shown at top
const STAT_CATEGORIES: { name: string; typeIds: number[] }[] = [
  {
    name: 'Estadísticas importantes',
    typeIds: [
      SM_STAT_TYPES.BALL_POSSESSION,
      SM_STAT_TYPES.EXPECTED_GOALS,
      SM_STAT_TYPES.GOAL_ATTEMPTS,
      SM_STAT_TYPES.SHOTS_ON_TARGET,
      SM_STAT_TYPES.BIG_CHANCES_CREATED,
      SM_STAT_TYPES.CORNERS,
      SM_STAT_TYPES.OFFSIDES,
      SM_STAT_TYPES.REDCARDS,
    ],
  },
  {
    name: 'Remates',
    typeIds: [
      SM_STAT_TYPES.EXPECTED_GOALS,
      SM_STAT_TYPES.GOAL_ATTEMPTS,
      SM_STAT_TYPES.SHOTS_ON_TARGET,
      SM_STAT_TYPES.SHOTS_BLOCKED,
      SM_STAT_TYPES.BIG_CHANCES_CREATED,
      SM_STAT_TYPES.BIG_CHANCES_MISSED,
      SM_STAT_TYPES.EXPECTED_GOALS_ON_TARGET,
      SM_STAT_TYPES.NP_EXPECTED_GOALS,
    ],
  },
  {
    name: 'Creación',
    typeIds: [
      SM_STAT_TYPES.ASSISTS,
      SM_STAT_TYPES.FREE_KICKS,
      SM_STAT_TYPES.CORNERS,
      SM_STAT_TYPES.THROWINS,
      SM_STAT_TYPES.SUCCESSFUL_DRIBBLES_PCT,
    ],
  },
  {
    name: 'Defensa',
    typeIds: [
      SM_STAT_TYPES.SAVES,
      SM_STAT_TYPES.GOAL_KICKS,
    ],
  },
  {
    name: 'Disciplina',
    typeIds: [
      SM_STAT_TYPES.REDCARDS,
      SM_STAT_TYPES.FOULS,
      SM_STAT_TYPES.YELLOWCARDS,
    ],
  },
];

function mapStatistics(stats: SMStatistic[] | undefined, fixture: SMFixture): MatchStatCategory[] {
  if (!stats || stats.length === 0) return [];

  const home = getParticipant(fixture, 'home');

  // Collect all stats into a map keyed by type_id
  const grouped = new Map<number, { home: number; away: number }>();
  for (const s of stats) {
    const raw = s.data.value;
    const val = typeof raw === 'number' ? raw : parseFloat(String(raw)) || 0;
    const isHome = s.participant_id === home?.id;
    if (!grouped.has(s.type_id)) grouped.set(s.type_id, { home: 0, away: 0 });
    const entry = grouped.get(s.type_id)!;
    if (isHome) entry.home = val; else entry.away = val;
  }

  // Build categories — only include categories that have at least one stat
  const result: MatchStatCategory[] = [];
  for (const cat of STAT_CATEGORIES) {
    const items = cat.typeIds
      .filter(id => grouped.has(id))
      .map(id => {
        const vals = grouped.get(id)!;
        const isPct  = PERCENTAGE_STAT_IDS.has(id);
        const isDec  = DECIMAL_STAT_IDS.has(id);
        const statType = isPct ? 'percentage' as const : isDec ? 'decimal' as const : 'number' as const;
        return {
          label: STAT_TYPE_NAMES[id],
          home: vals.home,
          away: vals.away,
          unit: isPct ? '%' : undefined,
          type: statType,
        };
      });
    if (items.length > 0) result.push({ category: cat.name, stats: items });
  }

  return result;
}

// ── Lineup Mapper ───────────────────────────────────────────────────────────

function mapLineup(
  entries: SMLineupEntry[] | undefined,
  teamId: number,
  events?: SMEvent[],
): MatchLineup {
  const empty: MatchLineup = { formation: '?', starters: [], bench: [], coach: '', coachNationality: '' };
  if (!entries) return empty;

  const teamEntries = entries.filter(e => e.team_id === teamId);
  const starters = teamEntries.filter(e => e.type_id === 11);
  const bench    = teamEntries.filter(e => e.type_id === 12);

  // ── Parse formation rows from formation_field ("row:col") ──────────────
  const rowMap = new Map<number, SMLineupEntry[]>();
  for (const e of starters) {
    if (!e.formation_field) continue;
    const row = parseInt(e.formation_field.split(':')[0]);
    if (!isNaN(row)) {
      if (!rowMap.has(row)) rowMap.set(row, []);
      rowMap.get(row)!.push(e);
    }
  }
  const sortedRows = Array.from(rowMap.entries()).sort(([a], [b]) => a - b);

  // Formation string: skip row 1 (GK)
  const formation = sortedRows.length > 1
    ? sortedRows.slice(1).map(([, es]) => es.length).join('-')
    : '?';

  // ── Position map (player_id → {row, col, rowSize, x, y}) ───────────────
  const posMap = new Map<number, { row: number; col: number; rowSize: number; x: number; y: number }>();
  const maxRow = sortedRows.length > 0 ? sortedRows[sortedRows.length - 1][0] : 1;

  for (const [row, rowEntries] of sortedRows) {
    const sorted = [...rowEntries].sort((a, b) => {
      const ca = parseInt(a.formation_field?.split(':')[1] ?? '1');
      const cb = parseInt(b.formation_field?.split(':')[1] ?? '1');
      return ca - cb;
    });
    sorted.forEach((e, i) => {
      const colX = (i + 1) / (sorted.length + 1) * 100;
      const rowY = (row / maxRow) * 100;
      posMap.set(e.player_id, { row, col: i + 1, rowSize: sorted.length, x: colX, y: rowY });
    });
  }

  // ── Card & substitution cross-referencing from events ──────────────────
  // Build a map: player_id → card/sub flags
  const cardMap = new Map<number, {
    yellowCard: boolean;
    redCard: boolean;
    isSubstituted: boolean;
    substituteMinute?: number;
    goals: number;
  }>();

  if (events) {
    for (const ev of events) {
      // Goals (both scored by and assists — we track scorer here)
      if (ev.type_id === SM_EVENT_TYPES.GOAL ||
          ev.type_id === SM_EVENT_TYPES.PENALTY_GOAL ||
          ev.type_id === SM_EVENT_TYPES.OWN_GOAL) {
        const entry = cardMap.get(ev.player_id) ?? { yellowCard: false, redCard: false, isSubstituted: false, goals: 0 };
        entry.goals = (entry.goals ?? 0) + 1;
        cardMap.set(ev.player_id, entry);
      }
      // Yellow card
      if (ev.type_id === SM_EVENT_TYPES.YELLOW_CARD) {
        const entry = cardMap.get(ev.player_id) ?? { yellowCard: false, redCard: false, isSubstituted: false, goals: 0 };
        entry.yellowCard = true;
        cardMap.set(ev.player_id, entry);
      }
      // Second yellow or straight red
      if (ev.type_id === SM_EVENT_TYPES.SECOND_YELLOW || ev.type_id === SM_EVENT_TYPES.RED_CARD) {
        const entry = cardMap.get(ev.player_id) ?? { yellowCard: false, redCard: false, isSubstituted: false, goals: 0 };
        entry.redCard = true;
        cardMap.set(ev.player_id, entry);
      }
      // Substitution — related_player_id is the player going OFF
      if (ev.type_id === SM_EVENT_TYPES.SUBSTITUTION && ev.related_player_id) {
        const entry = cardMap.get(ev.related_player_id) ?? { yellowCard: false, redCard: false, isSubstituted: false, goals: 0 };
        entry.isSubstituted = true;
        entry.substituteMinute = ev.minute;
        cardMap.set(ev.related_player_id, entry);
      }
    }
  }

  const shortName = (name: string) => {
    const parts = name.trim().split(' ');
    return parts.length > 1 ? parts[parts.length - 1] : name;
  };

  const mapPlayer = (e: SMLineupEntry, idx: number): LineupPlayer => {
    const pos   = posMap.get(e.player_id);
    const cards = cardMap.get(e.player_id);
    return {
      id: String(e.player_id),
      name: e.player_name,
      shortName: shortName(e.player?.display_name || e.player_name),
      number: e.jersey_number,
      position: positionName(e.position_id),
      positionShort: positionShort(e.position_id),
      x: pos?.x ?? 50,
      y: pos?.y ?? (idx / Math.max(starters.length, 1)) * 100,
      formationRow: pos?.row,
      formationCol: pos?.col,
      formationRowSize: pos?.rowSize,
      imageUrl: e.player?.image_path ?? undefined,
      yellowCard: cards?.yellowCard,
      redCard: cards?.redCard,
      isSubstituted: cards?.isSubstituted,
      substituteMinute: cards?.substituteMinute,
      goals: cards?.goals ?? 0,
    };
  };

  return {
    formation,
    starters: starters.map(mapPlayer),
    bench: bench.map((e, i) => mapPlayer(e, i)),
    coach: '',
    coachNationality: '',
  };
}

function positionName(posId: number): string {
  switch (posId) {
    case 24: return 'Portero';
    case 25: return 'Defensa';
    case 26: return 'Centrocampista';
    case 27: return 'Delantero';
    default: return 'Jugador';
  }
}

function positionShort(posId: number): string {
  switch (posId) {
    case 24: return 'POR';
    case 25: return 'DEF';
    case 26: return 'MED';
    case 27: return 'DEL';
    default: return 'JUG';
  }
}

// ── Venue Mapper ────────────────────────────────────────────────────────────

function mapVenue(v: SMVenue | undefined, venueId?: number): MatchVenue {
  return {
    id: v?.id ?? venueId,
    name: v?.name ?? 'Estadio desconocido',
    city: v?.city_name ?? '',
    capacity: v?.capacity ?? 0,
    surface: v?.surface ?? 'grass',
    image: v?.image_path ?? undefined,
  };
}

// ── Standing Mapper ─────────────────────────────────────────────────────────

function mapStandingToLeagueStanding(sg: SMStandingGroup): LeagueStanding {
  const p = sg.participant;
  const details = sg.details ?? [];

  // Standing detail type IDs (verified against SM API, April 2026)
  // 129=GP, 130=W, 131=D, 132=L, 133=GF, 134=GA, 179=GD
  const findDetail = (typeId: number) => details.find(d => d.type_id === typeId)?.value ?? 0;
  const played = findDetail(129);
  const won    = findDetail(130);
  const drawn  = findDetail(131);
  const lost   = findDetail(132);
  const gf     = findDetail(133);
  const ga     = findDetail(134);
  const gd     = findDetail(179) || (gf - ga);

  return {
    position: sg.position,
    team: {
      id: String(sg.participant_id),
      name: p?.name ?? 'Unknown',
      shortName: p?.short_code ?? 'UNK',
      logo: p?.image_path ?? '⚽',
    },
    played,
    won,
    drawn,
    lost,
    goalsFor: gf,
    goalsAgainst: ga,
    goalDifference: gd,
    points: sg.points,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC API — these are the functions components use
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch all fixtures for a local date, merging live state from /livescores.
 *
 * Layer 1 — /fixtures/date/{date}: base list (may have cached/stale state_id).
 * Layer 2 — /livescores:           real-time state override for any match in progress.
 *
 * Returns deduplicated SMFixture[] with live state merged in.
 */
async function fetchFixturesWithLiveState(localDate: string): Promise<SMFixture[]> {
  const utcDates = getUtcDatesForLocalDay(localDate);

  // Fetch date-based fixtures + livescores in parallel
  const [dateResults, liveFixtures] = await Promise.all([
    Promise.all(utcDates.map(d => fetchFixturesByDate(d))),
    fetchLivescores().catch(() => [] as SMFixture[]),
  ]);

  // Flatten + deduplicate (a fixture can appear in both UTC date pages near midnight)
  const seen = new Set<number>();
  const unique = dateResults.flat().filter(f => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });

  // Override with /livescores data where available (authoritative real-time source).
  // NEVER downgrade: if /livescores reports state_id=1 (NOT_STARTED) — which LATAM
  // feeds do well into a match — keep the original state_id. Same for scores: if
  // /livescores returns an empty scores array, keep the fixture's own scores.
  if (liveFixtures.length > 0) {
    const liveById = new Map<number, SMFixture>();
    for (const lf of liveFixtures) liveById.set(lf.id, lf);

    return unique.map(f => {
      const live = liveById.get(f.id);
      if (!live) return f;
      const liveIsAuthoritative =
        LIVE_STATE_IDS.has(live.state_id) || FINISHED_STATE_IDS.has(live.state_id);
      const liveHasScores = Array.isArray(live.scores) && live.scores.length > 0;
      return {
        ...f,
        state_id: liveIsAuthoritative ? live.state_id : f.state_id,
        state: liveIsAuthoritative ? (live.state ?? f.state) : f.state,
        scores: liveHasScores ? live.scores : f.scores,
      };
    });
  }

  return unique;
}

/**
 * Fetch all fixtures for a given LOCAL date.
 * Queries the UTC date(s) that overlap with the local calendar day, then
 * filters to keep only fixtures whose local date matches. This ensures
 * evening matches (e.g. 19:00 Mexico City = next day UTC) appear on the
 * correct day regardless of the user's timezone.
 */
export async function getFixturesByDate(localDate: string): Promise<Match[]> {
  const cacheKey = `fixtures_${localDate}`;
  const today = new Date().toISOString().slice(0, 10);
  const ttl = localDate === today ? CacheTTL.fixturesLive : CacheTTL.fixturesStatic;

  // Serve from cache if fresh — avoids redundant API calls between polls
  const cached = await AppCache.get<Match[]>(cacheKey);
  if (cached) return reapplyLiveStatus(cached);

  try {
    const unique = await fetchFixturesWithLiveState(localDate);
    const matches = reapplyLiveStatus(
      unique.map(mapFixtureToMatch).filter(m => m.date === localDate)
    );
    AppCache.set(cacheKey, matches, ttl);
    return matches;
  } catch (err) {
    console.warn('[sportsApi] getFixturesByDate failed:', err);
    captureError(err, { fn: 'getFixturesByDate', localDate });
    return [];
  }
}

/**
 * Pure helper — groups a Match[] by league. No API calls.
 * Used by getLeaguesByDate and useFixtures to avoid a second fetch.
 */
export function groupMatchesByLeague(matches: Match[]): LeagueWithMatches[] {
  const leagues: LeagueWithMatches[] = [];
  const leagueMap = new Map<string, LeagueWithMatches>();
  for (const m of matches) {
    if (!leagueMap.has(m.leagueId)) {
      const config = getLeagueConfig(Number(m.leagueId));
      const lw: LeagueWithMatches = {
        id: m.leagueId,
        name: m.league,
        country: config?.country ?? '',
        logo: m.leagueLogo || config?.flag || '⚽',
        matches: [],
      };
      leagueMap.set(m.leagueId, lw);
      leagues.push(lw);
    }
    leagueMap.get(m.leagueId)!.matches.push(m);
  }
  return leagues;
}

/**
 * Fetch fixtures grouped by league for a given date.
 * Merges real SportMonks leagues with mock leagues.
 */
export interface LeagueWithMatches extends League {
  matches: Match[];
}

export async function getLeaguesByDate(localDate: string): Promise<LeagueWithMatches[]> {
  // Reuses getFixturesByDate — which reads/writes its own cache — so we never
  // call fetchFixturesWithLiveState twice for the same date in the same tick.
  try {
    const matches = await getFixturesByDate(localDate);
    return groupMatchesByLeague(matches);
  } catch (err) {
    console.warn('[sportsApi] getLeaguesByDate failed:', err);
    captureError(err, { fn: 'getLeaguesByDate', localDate });
    return [];
  }
}

/**
 * Fetch live scores. Falls back to empty array on error.
 */
export async function getLiveFixtures(): Promise<Match[]> {
  try {
    const fixtures = await fetchLivescores();
    if (!Array.isArray(fixtures)) return [];
    return reapplyLiveStatus(fixtures.map(mapFixtureToMatch));
  } catch (err) {
    console.warn('[sportsApi] getLiveFixtures failed:', err);
    captureError(err, { fn: 'getLiveFixtures' });
    return [];
  }
}

/**
 * Fetches only the fixtures that changed in the last 10 seconds and returns
 * a Map<fixtureId, Partial<Match>> for quick state merging.
 *
 * IMPORTANT: this function ONLY includes fields in the patch that are backed by
 * real data in the latest response:
 *  - scores: omitted if `f.scores` is empty/missing (otherwise getGoals would
 *    return 0 and clobber a real 1-0 score back to 0-0)
 *  - status: omitted if the inferred status is 'scheduled' — lagging feeds
 *    return state_id=1 (NOT_STARTED) for matches at minute 70+, and the time
 *    inference may not always rescue it. reapplyLiveStatus (applied by the
 *    caller after the merge) corrects this based on startingAtUtc.
 *
 * Returns an empty Map when nothing changed — callers can skip re-renders.
 * Cost: 1 API call per poll vs 4–6 calls for a full date fetch.
 */
export type LivescorePatch = Partial<Pick<Match,
  'homeScore' | 'awayScore' | 'status' | 'minute' | 'stateLabel' | 'time' | 'liveClock'
>>;

export async function fetchLatestLivescoreUpdates(): Promise<Map<number, LivescorePatch>> {
  const latest = await fetchLivescoresLatest();
  const map = new Map<number, LivescorePatch>();
  for (const f of latest) {
    const patch: LivescorePatch = {};

    const hasScores = Array.isArray(f.scores) && f.scores.length > 0;
    if (hasScores) {
      patch.homeScore = getGoals(f.scores, 'home');
      patch.awayScore = getGoals(f.scores, 'away');
    }

    // Only promote status on strong signals — never downgrade live→scheduled
    // from this lightweight endpoint. reapplyLiveStatus (defense-in-depth in
    // the caller) handles the scheduled→live time-inference case.
    const inferred = mapStateToStatus(f.state_id, f.starting_at);
    if (inferred !== 'scheduled') {
      patch.status = inferred;
    }

    // Live-clock fields: MUST be refreshed on every fast-poll so the list view
    // doesn't freeze at the minute it was loaded. Without this, the minute
    // stayed static until the 60-s full re-sync (or forever if cached).
    if (inferred === 'live') {
      patch.stateLabel = mapStateLabel(f.state_id);
      patch.time       = getTimeDisplay(f);
      patch.minute     = getLiveMinute(f);
      patch.liveClock  = getLiveClockAnchor(f);
    } else if (inferred === 'finished') {
      // Clear live-clock state on transition to finished so the card stops ticking.
      patch.stateLabel = undefined;
      patch.minute     = undefined;
      patch.liveClock  = undefined;
      patch.time       = getTimeDisplay(f);
    }

    if (Object.keys(patch).length > 0) {
      map.set(f.id, patch);
    }
  }
  return map;
}

// ── Referee Mapper ──────────────────────────────────────────────────────────

function mapReferee(refs: SMFixtureReferee[] | undefined) {
  if (!refs || refs.length === 0) return { referee: { name: '', nationality: '', flag: '' }, assistants: [] as string[], fourthOfficial: undefined as string | undefined };

  const main = refs.find(r => r.type_id === 6);
  const assistants = refs.filter(r => r.type_id === 7 || r.type_id === 8);
  const fourth = refs.find(r => r.type_id === 9);

  const refImg = main?.referee?.image_path;
  return {
    referee: {
      id: main?.referee_id,
      name: main?.referee?.display_name ?? main?.referee?.common_name ?? '',
      nationality: '',
      flag: '👔',
      imageUrl: refImg && !refImg.includes('placeholder') ? refImg : undefined,
    },
    assistants: assistants.map(a => a.referee?.display_name ?? a.referee?.common_name ?? ''),
    fourthOfficial: fourth?.referee?.display_name ?? fourth?.referee?.common_name ?? undefined,
  };
}

// ── Weather Mapper ──────────────────────────────────────────────────────────

function mapWeather(w: SMWeatherReport | undefined): MatchDetail['weather'] | undefined {
  if (!w) return undefined;

  const weatherIcons: Record<string, string> = {
    'clear-day': '☀️', 'clear-night': '🌙',
    'partly-cloudy-day': '⛅', 'partly-cloudy-night': '☁️',
    'cloudy': '☁️', 'rain': '🌧️', 'snow': '🌨️',
    'sleet': '🌨️', 'wind': '💨', 'fog': '🌫️',
    'overcast clouds': '☁️', 'broken clouds': '⛅',
    'scattered clouds': '⛅', 'few clouds': '🌤️',
    'light rain': '🌦️', 'moderate rain': '🌧️', 'heavy rain': '🌧️',
  };

  const desc = w.description || '';
  const icon = weatherIcons[desc.toLowerCase()] || weatherIcons[w.icon] || '🌡️';
  const temp = w.current?.temp ?? w.temperature?.day ?? 0;
  const wind = w.current?.wind ?? w.wind?.speed ?? 0;
  const humidity = parseInt(w.current?.humidity ?? w.humidity ?? '0') || 0;

  return { temp: Math.round(temp), description: desc, icon, wind: Math.round(wind), humidity };
}

// ── TV Station Mapper ───────────────────────────────────────────────────────

function mapTVStations(stations: SMFixtureTVStation[] | undefined): MatchDetail['tvStations'] {
  if (!stations || stations.length === 0) return undefined;
  return stations
    .filter(s => s.tvstation?.name)
    .map(s => ({
      name: s.tvstation!.name,
      logo: s.tvstation!.image_path ?? undefined,
    }));
}

// ── Commentary Mapper ───────────────────────────────────────────────────────

// ── Odds Mapper ─────────────────────────────────────────────────────────────

function mapOdds(odds: SMOdd[] | undefined): OddsMarket[] {
  if (!odds || odds.length === 0) return [];

  // Group by market name
  const marketMap = new Map<string, { name: string; options: { label: string; value: number }[] }>();
  for (const o of odds) {
    const marketName = (o as any).market?.name ?? o.market_description ?? `Market ${o.market_id}`;
    if (!marketMap.has(marketName)) {
      marketMap.set(marketName, { name: marketName, options: [] });
    }
    const val = parseFloat(o.value);
    if (!isNaN(val) && val > 0) {
      marketMap.get(marketName)!.options.push({
        label: o.label || o.original_label || '?',
        value: val,
      });
    }
  }

  // Prioritize key markets
  const PRIORITY_MARKETS = ['Fulltime Result', 'Match Winner', '1X2', 'Over/Under', 'Both Teams To Score', 'Double Chance'];
  const result: OddsMarket[] = [];
  const seen = new Set<string>();

  // Add priority markets first
  for (const pm of PRIORITY_MARKETS) {
    for (const [key, market] of marketMap) {
      if (key.toLowerCase().includes(pm.toLowerCase()) && !seen.has(key) && market.options.length > 0) {
        result.push(market);
        seen.add(key);
      }
    }
  }

  // Add remaining (up to 8 total)
  for (const [key, market] of marketMap) {
    if (result.length >= 8) break;
    if (!seen.has(key) && market.options.length > 0 && market.options.length <= 6) {
      result.push(market);
      seen.add(key);
    }
  }

  return result;
}

// ── Pressure Index (derived from stats) ─────────────────────────────────────

function computePressureIndex(stats: SMStatistic[] | undefined, homeId: number): PressureIndex | undefined {
  if (!stats || stats.length === 0) return undefined;

  // Try to find possession, goal attempts, corners
  let homePoss = 50, awayPoss = 50;
  let homeAttempts = 0, awayAttempts = 0;
  let homeCorners = 0, awayCorners = 0;

  for (const s of stats) {
    const val = typeof s.data.value === 'number' ? s.data.value : parseFloat(String(s.data.value)) || 0;
    const isHome = s.participant_id === homeId;

    if (s.type_id === SM_STAT_TYPES.BALL_POSSESSION) {
      if (isHome) homePoss = val; else awayPoss = val;
    }
    if (s.type_id === SM_STAT_TYPES.GOAL_ATTEMPTS) {
      if (isHome) homeAttempts = val; else awayAttempts = val;
    }
    if (s.type_id === SM_STAT_TYPES.CORNERS) {
      if (isHome) homeCorners = val; else awayCorners = val;
    }
  }

  // If no meaningful data, skip
  if (homeAttempts === 0 && awayAttempts === 0 && homePoss === 50 && awayPoss === 50) return undefined;

  // Weighted pressure = 40% possession + 40% shots + 20% corners
  const totalAttempts = homeAttempts + awayAttempts || 1;
  const totalCorners = homeCorners + awayCorners || 1;
  const homePressure = Math.round(
    0.4 * homePoss +
    0.4 * (homeAttempts / totalAttempts * 100) +
    0.2 * (homeCorners / totalCorners * 100)
  );

  return {
    home: Math.min(99, Math.max(1, homePressure)),
    away: Math.min(99, Math.max(1, 100 - homePressure)),
    homeAttacks: homeAttempts,
    awayAttacks: awayAttempts,
    homeDangerousAttacks: homeCorners,
    awayDangerousAttacks: awayCorners,
  };
}

// ── Sidelined → MissingPlayer mapping ───────────────────────────────────────

function mapSidelined(sidelined: SMSidelined[]): MissingPlayer[] {
  return sidelined.map(s => ({
    name: s.player?.display_name ?? s.player?.common_name ?? `Player ${s.player_id}`,
    reason: s.category === 'injury' ? 'injury' : s.category === 'suspension' ? 'suspension' : 'other',
    detail: s.end_date ? `Hasta ${s.end_date}` : (s.category === 'injury' ? 'Lesión' : s.category === 'suspension' ? 'Suspendido' : 'No disponible'),
  }));
}

// ── Referee Stats mapping ───────────────────────────────────────────────────

function mapRefereeStats(raw: { statistics?: SMRefereeStats[] }): RefereeStats | undefined {
  const stats = raw.statistics;
  if (!stats || stats.length === 0) return undefined;

  // SM referee stat type_ids: 83=yellowcards, 84=redcards, 56=fouls, 42=penalties
  // Values can be { total, average } or just a number
  const extract = (typeId: number): { total: number; avg: number } => {
    const found = stats.filter(s => s.type_id === typeId);
    let total = 0, avg = 0;
    for (const s of found) {
      if (typeof s.value === 'number') {
        total += s.value;
      } else if (s.value && typeof s.value === 'object') {
        total += s.value.total ?? 0;
        avg = parseFloat(s.value.average ?? '0') || avg;
      }
    }
    return { total, avg };
  };

  const yellows = extract(83);
  const reds = extract(84);
  const fouls = extract(56);
  const penalties = extract(42);
  const matches = stats.find(s => s.type_id === 155); // matches officiated
  const totalMatches = matches ? (typeof matches.value === 'number' ? matches.value : matches.value?.total ?? 0) : 0;

  if (totalMatches === 0 && yellows.total === 0) return undefined;

  return {
    yellowCardsPerMatch: yellows.avg || (totalMatches ? +(yellows.total / totalMatches).toFixed(2) : 0),
    redCardsPerMatch: reds.avg || (totalMatches ? +(reds.total / totalMatches).toFixed(2) : 0),
    foulsPerMatch: fouls.avg || (totalMatches ? +(fouls.total / totalMatches).toFixed(2) : 0),
    penaltiesPerMatch: penalties.avg || (totalMatches ? +(penalties.total / totalMatches).toFixed(2) : 0),
    totalMatches,
  };
}

// ── Team Form mapping ───────────────────────────────────────────────────────

function mapTeamForm(fixtures: SMFixture[], teamId: number): TeamFormEntry[] {
  // Sort by date descending, take last 5 finished
  const sorted = fixtures
    .filter(f => {
      const stateId = f.state?.id ?? f.state_id;
      return stateId === SM_STATE_IDS.FULL_TIME
        || stateId === SM_STATE_IDS.FINISHED_AET
        || stateId === SM_STATE_IDS.FINISHED_PEN;
    })
    .sort((a, b) => b.starting_at_timestamp - a.starting_at_timestamp)
    .slice(0, 5);

  return sorted.map(f => {
    const home = f.participants?.find(p => p.meta?.location === 'home');
    const away = f.participants?.find(p => p.meta?.location === 'away');
    const isHome = home?.id === teamId;
    const teamGoals = getGoals(f.scores, isHome ? 'home' : 'away');
    const oppGoals = getGoals(f.scores, isHome ? 'away' : 'home');
    const opponent = isHome ? away : home;
    const result: 'W' | 'D' | 'L' = teamGoals > oppGoals ? 'W' : teamGoals < oppGoals ? 'L' : 'D';

    return {
      matchId: String(f.id),
      opponent: opponent?.name ?? 'Unknown',
      opponentLogo: opponent?.image_path ?? '⚽',
      isHome,
      goalsFor: teamGoals,
      goalsAgainst: oppGoals,
      result,
      date: f.starting_at.split(' ')[0],
      league: f.league?.name ?? '',
    };
  });
}

// ── Predictions mapping ─────────────────────────────────────────────────────

function mapPredictions(raw: SMPrediction[]): MatchPrediction[] {
  const results: MatchPrediction[] = [];

  for (const p of raw) {
    if (!p.predictions) continue;

    // Map by type_id (reliable) OR type.name (fallback)
    const typeId = p.type_id;
    const typeName = (p.type?.name ?? p.type?.developer_name ?? '').toLowerCase();
    const preds = p.predictions as Record<string, number>;

    // 233: Fulltime Result (1X2) — keys: home, draw, away
    if (typeId === 233 || typeName.includes('result') || typeName.includes('winner')) {
      if (preds.home != null && preds.draw != null && preds.away != null) {
        results.push({
          type: 'Resultado Final',
          homeWin: Math.round(preds.home * 10) / 10,
          draw: Math.round(preds.draw * 10) / 10,
          awayWin: Math.round(preds.away * 10) / 10,
        });
      }
    }
    // 331: Both Teams To Score — keys: yes, no
    else if (typeId === 331 || typeName.includes('btts') || typeName.includes('both')) {
      results.push({
        type: 'Ambos Anotan',
        yes: Math.round((preds.yes ?? 0) * 10) / 10,
        no: Math.round((preds.no ?? 0) * 10) / 10,
      });
    }
    // 234: Over/Under 2.5 Goals — keys: yes, no
    else if (typeId === 234 || typeName.includes('over') || typeName.includes('under')) {
      results.push({
        type: 'Más/Menos 2.5',
        yes: Math.round((preds.yes ?? 0) * 10) / 10,
        no: Math.round((preds.no ?? 0) * 10) / 10,
      });
    }
    // 239: Double Chance — keys: draw_home, draw_away, home_away
    else if (typeId === 239) {
      results.push({
        type: 'Doble Oportunidad',
        homeWin: Math.round((preds.home_away ?? 0) * 10) / 10,
        draw: Math.round((preds.draw_home ?? 0) * 10) / 10,
        awayWin: Math.round((preds.draw_away ?? 0) * 10) / 10,
      });
    }
  }
  return results;
}

/**
 * H2H-based fallback: compute aggregate score by finding the other leg of a
 * two-legged knockout tie in the team's H2H results. Used when SportMonks
 * doesn't populate `aggregate_id` or AGGREGATE score entries for a competition
 * (observed for Coppa Italia, Copa del Rey, DFB-Pokal semifinals, etc.).
 *
 * Matching criteria — two fixtures are considered legs of the same tie when:
 *   - They're in the same `league_id` + `season_id` (different comps never paired)
 *   - Both are finished
 *   - They're within 35 days of each other. Generous window is needed because
 *     Coppa Italia semifinals are often ~3 weeks apart. Safe because:
 *       • League matches between the same teams are >3 months apart
 *       • UCL league-phase (new format): no double matchups exist
 *       • UCL/EL/ECL knockouts: always within 2 weeks
 *       • Copa Libertadores group stage: rematches >2 months apart
 *   - The teams match (in either home/away orientation)
 *
 * Returns `undefined` when no matching other leg is found, when the current
 * fixture is the first leg (no prior leg to sum with), or when team IDs are missing.
 */
function computeAggregateFromH2H(
  fixture: SMFixture,
  h2hResults: SMFixture[],
): { home: number; away: number } | undefined {
  const homeId = getParticipant(fixture, 'home')?.id;
  const awayId = getParticipant(fixture, 'away')?.id;
  if (!homeId || !awayId) return undefined;

  const fixtureDateMs = new Date(fixture.starting_at.replace(' ', 'T') + 'Z').getTime();
  const WINDOW_MS = 70 * 24 * 60 * 60 * 1000; // 70 days — covers long cup gaps (Coppa Italia SF: ~48d)

  const rejections: string[] = [];

  // Find the other leg among candidates.
  // We intentionally skip the season_id check: SportMonks sometimes assigns
  // different season_ids to different rounds of the same cup (e.g. Coppa Italia
  // preliminary rounds vs knockout rounds). league_id + teams + date window is
  // a sufficient and safe signal — the 35-day window rules out cross-season collisions.
  const otherLeg = h2hResults.find(h => {
    if (h.id === fixture.id)                        { rejections.push(`${h.id}:self`);        return false; }
    if (h.league_id !== fixture.league_id)          { rejections.push(`${h.id}:league(${h.league_id}≠${fixture.league_id})`); return false; }

    const hStatus = mapStateToStatus(h.state_id, h.starting_at);
    if (hStatus !== 'finished')                     { rejections.push(`${h.id}:notFinished(${hStatus})`); return false; }

    const hDateMs = new Date(h.starting_at.replace(' ', 'T') + 'Z').getTime();
    const daysApart = Math.round(Math.abs(fixtureDateMs - hDateMs) / (24 * 60 * 60 * 1000));
    if (Math.abs(fixtureDateMs - hDateMs) > WINDOW_MS) { rejections.push(`${h.id}:tooFar(${daysApart}d)`); return false; }

    const hHomeId = getParticipant(h, 'home')?.id;
    const hAwayId = getParticipant(h, 'away')?.id;
    const sameTeams = (hHomeId === homeId && hAwayId === awayId) ||
                      (hHomeId === awayId && hAwayId === homeId);
    if (!sameTeams)                                 { rejections.push(`${h.id}:teams(${hHomeId}v${hAwayId})`); return false; }
    return true;
  });

  if (__DEV__ && !otherLeg) {
    console.warn(`[aggregate H2H/stage] fixture=${fixture.id} no match among ${h2hResults.length} candidates — rejections:`, rejections);
  }

  if (!otherLeg) return undefined;

  // Only show aggregate on the *later* leg (first leg has nothing to sum with)
  const otherDateMs = new Date(otherLeg.starting_at.replace(' ', 'T') + 'Z').getTime();
  if (otherDateMs > fixtureDateMs) return undefined;

  // Sum current leg + prior leg, handling team orientation (prior may be at opp. ground)
  let aggHome = getGoals(fixture.scores, 'home');
  let aggAway = getGoals(fixture.scores, 'away');
  const otherHomeId = getParticipant(otherLeg, 'home')?.id;
  const otherHome = getGoals(otherLeg.scores, 'home');
  const otherAway = getGoals(otherLeg.scores, 'away');

  if (otherHomeId === homeId) {
    aggHome += otherHome;
    aggAway += otherAway;
  } else {
    aggHome += otherAway;
    aggAway += otherHome;
  }

  return { home: aggHome, away: aggAway };
}

/**
 * Compute aggregate score for a knockout tie. Uses two strategies in order:
 *
 * Strategy A — Direct score entry (most reliable):
 *   SportMonks sometimes includes an AGGREGATE score entry in the fixture's
 *   own `scores` array (description === 'AGGREGATE'). This is instant and
 *   requires no nested includes.
 *
 * Strategy B — Cross-leg sum (fallback):
 *   If the aggregate isn't directly in scores, sum goals across all legs
 *   fetched via `aggregate.fixtures.scores;aggregate.fixtures.participants`.
 *   Requires the two-legged tie to have at least 2 fixtures in the nested
 *   include, and only shows on the second leg or later.
 *
 * Returns `undefined` when: no aggregate data is available, this is a
 * single-leg cup match, or this is the first leg of a multi-leg tie.
 */
function computeAggregateScore(fixture: SMFixture): { home: number; away: number } | undefined {
  // ── Strategy A: AGGREGATE score entry directly on the fixture ──────────────
  if (fixture.scores && fixture.scores.length > 0) {
    const aggHome = fixture.scores.find(
      s => s.description === 'AGGREGATE' && s.score.participant === 'home',
    );
    const aggAway = fixture.scores.find(
      s => s.description === 'AGGREGATE' && s.score.participant === 'away',
    );
    if (aggHome !== undefined && aggAway !== undefined) {
      // Only show when the aggregate actually differs from the match score
      // (avoids showing "(3-2 glo.)" on a single-leg match that SportMonks
      //  erroneously tags with an AGGREGATE entry equal to the FT score).
      const ftHome = getGoals(fixture.scores, 'home');
      const ftAway = getGoals(fixture.scores, 'away');
      const isOnlyOneLeg = aggHome.score.goals === ftHome && aggAway.score.goals === ftAway
        && (!fixture.aggregate?.fixtures || fixture.aggregate.fixtures.length < 2);
      if (!isOnlyOneLeg) {
        return { home: aggHome.score.goals, away: aggAway.score.goals };
      }
    }
  }

  // ── Strategy B: sum goals across nested leg fixtures ───────────────────────
  const legs = fixture.aggregate?.fixtures;
  if (!legs || legs.length < 2) return undefined;

  // Sort legs chronologically
  const sorted = [...legs].sort((a, b) => a.starting_at.localeCompare(b.starting_at));

  // Don't show aggregate on the first leg — there's nothing to sum yet
  const currentIdx = sorted.findIndex(f => f.id === fixture.id);
  if (currentIdx <= 0) return undefined;

  // Canonical teams = current fixture's home/away (matches what the UI shows above)
  const currentHomeId = getParticipant(fixture, 'home')?.id;
  const currentAwayId = getParticipant(fixture, 'away')?.id;
  if (!currentHomeId || !currentAwayId) return undefined;

  let aggHome = 0;
  let aggAway = 0;
  let hasAny = false;

  for (const leg of sorted) {
    const status = mapStateToStatus(leg.state_id, leg.starting_at);
    if (status === 'scheduled') continue; // skip legs that haven't started
    const legHomeId = getParticipant(leg, 'home')?.id;
    const legAwayId = getParticipant(leg, 'away')?.id;
    const homeGoals = getGoals(leg.scores, 'home');
    const awayGoals = getGoals(leg.scores, 'away');
    hasAny = true;

    if (legHomeId === currentHomeId && legAwayId === currentAwayId) {
      aggHome += homeGoals;
      aggAway += awayGoals;
    } else if (legHomeId === currentAwayId && legAwayId === currentHomeId) {
      // Swap — leg was at opponent's ground
      aggHome += awayGoals;
      aggAway += homeGoals;
    }
  }

  return hasAny ? { home: aggHome, away: aggAway } : undefined;
}

/**
 * Fetch full fixture detail with all available SM data:
 * events, stats, lineups, venue, referee, weather, TV, H2H, pressure,
 * injuries, form, predictions, referee stats.
 */
export async function getFixtureDetail(id: number): Promise<{ match: Match; detail: Partial<MatchDetail> } | null> {
  try {
    const fixture = await fetchFixtureById(id);
    // reapplyLiveStatus is defense-in-depth: mapStateToStatus already handles
    // time-based inference when state_id lags, but if the API returns an
    // unexpected state_id combo, reapplyLiveStatus ensures the match gets
    // flagged live whenever starting_at is within the expected window.
    const match = reapplyLiveStatus([mapFixtureToMatch(fixture)])[0];
    const homeTeam = getParticipant(fixture, 'home');
    const awayTeam = getParticipant(fixture, 'away');

    const refereeData = mapReferee(fixture.referees);
    const mainRefereeId = fixture.referees?.find(r => r.type_id === 6)?.referee_id;

    const isCupLeague = getLeagueConfig(fixture.league_id)?.isCup === true;

    // Fire ALL secondary requests in parallel
    const [h2hResults, homeSidelined, awaySidelined, homeFixtures, awayFixtures, refStats, predictions, aggregateData, stageFixtures] = await Promise.all([
      // H2H
      (homeTeam && awayTeam)
        ? fetchH2H(homeTeam.id, awayTeam.id).catch(() => [] as SMFixture[])
        : Promise.resolve([] as SMFixture[]),
      // Sidelined/Injuries — home
      (homeTeam && fixture.season_id)
        ? fetchSidelinedByTeam(fixture.season_id, homeTeam.id).catch(() => [] as SMSidelined[])
        : Promise.resolve([] as SMSidelined[]),
      // Sidelined/Injuries — away
      (awayTeam && fixture.season_id)
        ? fetchSidelinedByTeam(fixture.season_id, awayTeam.id).catch(() => [] as SMSidelined[])
        : Promise.resolve([] as SMSidelined[]),
      // Team form — home
      homeTeam
        ? fetchTeamRecentFixtures(homeTeam.id).catch(() => [] as SMFixture[])
        : Promise.resolve([] as SMFixture[]),
      // Team form — away
      awayTeam
        ? fetchTeamRecentFixtures(awayTeam.id).catch(() => [] as SMFixture[])
        : Promise.resolve([] as SMFixture[]),
      // Referee stats
      mainRefereeId
        ? fetchRefereeStats(mainRefereeId).catch(() => ({ id: 0 }))
        : Promise.resolve({ id: 0 }),
      // Predictions
      fetchPredictions(id).catch(() => [] as SMPrediction[]),
      // Aggregate — only fetch separately for cup ties where the nested include
      // didn't return both legs (e.g. Coppa Italia). Zero cost for non-cup matches.
      (fixture.aggregate_id && (!fixture.aggregate?.fixtures || fixture.aggregate.fixtures.length < 2))
        ? fetchAggregateById(fixture.aggregate_id).catch(() => null as SMAggregate | null)
        : Promise.resolve(null as SMAggregate | null),
      // Stage fixtures — fallback for cup ties where SM omits aggregate_id entirely
      // (e.g. Coppa Italia). Fetches all fixtures in the same stage so we can pair legs.
      (isCupLeague && !fixture.aggregate_id && fixture.stage_id)
        ? fetchFixturesByStage(fixture.stage_id).catch(() => [] as SMFixture[])
        : Promise.resolve([] as SMFixture[]),
    ]);

    // Filter sidelined to players who were unavailable at match time.
    // We use the fixture date rather than the `completed` flag because SportMonks
    // sometimes sets completed=true before the player has actually returned.
    const matchDateTime = fixture.starting_at ? new Date(fixture.starting_at) : new Date();
    const isActiveForMatch = (s: SMSidelined) => {
      const start = s.start_date ? new Date(s.start_date) : null;
      if (start && start > matchDateTime) return false; // injury begins after this match
      if (!s.end_date) return true;                      // open-ended → still out
      return new Date(s.end_date) >= matchDateTime;      // return date is on/after match day
    };
    const activeHomeSidelined = homeSidelined.filter(isActiveForMatch);
    const activeAwaySidelined = awaySidelined.filter(isActiveForMatch);

    // Patch fixture with separately-fetched aggregate data when the nested include
    // didn't return both legs (common in domestic cups like Coppa Italia where
    // SportMonks doesn't embed AGGREGATE score entries in the fixture's scores array).
    const effectiveFixture: SMFixture = aggregateData
      ? { ...fixture, aggregate: aggregateData }
      : fixture;

    const detail: Partial<MatchDetail> = {
      matchId: String(fixture.id),
      venue: mapVenue(fixture.venue, fixture.venue_id),
      referee: refereeData.referee,
      assistantReferees: refereeData.assistants.length > 0 ? refereeData.assistants : undefined,
      fourthOfficial: refereeData.fourthOfficial,
      refereeStats: mainRefereeId ? mapRefereeStats(refStats as { statistics?: SMRefereeStats[] }) : undefined,
      weather: mapWeather(fixture.weatherreport),
      events: mapEvents(fixture.events, fixture),
      statistics: mapStatistics(fixture.statistics, fixture),
      homeLineup: (() => {
        const confirmed = fixture.lineups ?? [];
        const homeHas = confirmed.some(e => e.team_id === (homeTeam?.id ?? 0) && e.type_id === 11);
        const awayHas = confirmed.some(e => e.team_id === (awayTeam?.id ?? 0) && e.type_id === 11);
        const useExpected = !homeHas && !awayHas && (fixture.expectedlineups?.length ?? 0) > 0;
        // formation_field present → starter (11); absent → bench (12)
        const entries: SMLineupEntry[] = useExpected
          ? (fixture.expectedlineups ?? []).map(e => ({ ...e, type_id: e.formation_field != null ? 11 : 12 }))
          : confirmed;
        // Find coach via fixture.coaches (meta.participant_id links to team)
        const homeCoach = fixture.coaches?.find(c => c.meta?.participant_id === homeTeam?.id);
        const homeCoachImg = homeCoach?.image_path?.includes('placeholder') ? undefined : homeCoach?.image_path;
        return {
          ...mapLineup(entries, homeTeam?.id ?? 0, fixture.events),
          isExpected: useExpected,
          coachImageUrl: homeCoachImg,
          coachId: homeCoach?.meta?.coach_id ?? homeCoach?.id,
        };
      })(),
      awayLineup: (() => {
        const confirmed = fixture.lineups ?? [];
        const homeHas = confirmed.some(e => e.team_id === (homeTeam?.id ?? 0) && e.type_id === 11);
        const awayHas = confirmed.some(e => e.team_id === (awayTeam?.id ?? 0) && e.type_id === 11);
        const useExpected = !homeHas && !awayHas && (fixture.expectedlineups?.length ?? 0) > 0;
        // formation_field present → starter (11); absent → bench (12)
        const entries: SMLineupEntry[] = useExpected
          ? (fixture.expectedlineups ?? []).map(e => ({ ...e, type_id: e.formation_field != null ? 11 : 12 }))
          : confirmed;
        // Find coach via fixture.coaches (meta.participant_id links to team)
        const awayCoach = fixture.coaches?.find(c => c.meta?.participant_id === awayTeam?.id);
        const awayCoachImg = awayCoach?.image_path?.includes('placeholder') ? undefined : awayCoach?.image_path;
        return {
          ...mapLineup(entries, awayTeam?.id ?? 0, fixture.events),
          isExpected: useExpected,
          coachImageUrl: awayCoachImg,
          coachId: awayCoach?.meta?.coach_id ?? awayCoach?.id,
        };
      })(),
      tvStations: mapTVStations(fixture.tvstations),
      resultInfo: fixture.result_info ?? undefined,
      odds: mapOdds(fixture.odds),
      pressureIndex: computePressureIndex(fixture.statistics, homeTeam?.id ?? 0),
      missingPlayers: {
        home: mapSidelined(activeHomeSidelined),
        away: mapSidelined(activeAwaySidelined),
      },
      predictions: predictions.length > 0 ? mapPredictions(predictions) : undefined,
      homeForm: homeTeam ? mapTeamForm(homeFixtures, homeTeam.id) : undefined,
      awayForm: awayTeam ? mapTeamForm(awayFixtures, awayTeam.id) : undefined,
      h2h: {
        homeTeam: homeTeam?.name ?? '',
        awayTeam: awayTeam?.name ?? '',
        results: h2hResults.map(f => ({
          date: f.starting_at.split(' ')[0],
          homeScore: getGoals(f.scores, 'home'),
          awayScore: getGoals(f.scores, 'away'),
          competition: f.league?.name ?? '',
          venue: '',
        })),
      },
      aggregateScore: (() => {
        // Strategy A (AGGREGATE score entry) + Strategy B (nested legs / fetched aggregate)
        let agg = computeAggregateScore(effectiveFixture);

        // Strategy C+D: pair with the other leg from H2H results and/or stage fixtures.
        // Stage fixtures (Strategy D) directly fetches all fixtures in the same cup stage
        // — this catches Coppa Italia and similar competitions where SportMonks leaves
        // aggregate_id null, omits AGGREGATE score entries, and H2H coverage is sparse.
        if (!agg && match.status === 'finished') {
          // Deduplicate by id before searching (H2H and stage may overlap)
          const seen = new Set<number>();
          const allCandidates: SMFixture[] = [];
          for (const f of [...h2hResults, ...stageFixtures]) {
            if (!seen.has(f.id)) { seen.add(f.id); allCandidates.push(f); }
          }
          if (allCandidates.length > 0) {
            agg = computeAggregateFromH2H(fixture, allCandidates);
          }
        }

        if (__DEV__ && (fixture.aggregate_id || match.status === 'finished')) {
          console.warn(
            `[aggregate] fixture=${fixture.id} league=${fixture.league_id} stage=${fixture.stage_id} agg_id=${fixture.aggregate_id}`,
            `\n  scores:`, fixture.scores?.map(s => `${s.description}:${s.score.participant}=${s.score.goals}`),
            `\n  nested fixtures:`, fixture.aggregate?.fixtures?.length ?? 'none',
            `\n  separate agg fetched:`, aggregateData ? `yes (${aggregateData.fixtures?.length ?? 0} legs)` : 'no',
            `\n  h2h candidates:`, h2hResults.length,
            `\n  stage fixtures:`, stageFixtures.length,
            `\n  computed:`, agg,
          );
        }
        return agg;
      })(),
    };

    // Pick TTL based on match status
    const detailTtl =
      match.status === 'finished' ? CacheTTL.detailFinished :
      match.status === 'live'     ? CacheTTL.detailLive :
                                    CacheTTL.detailScheduled;
    AppCache.set(`fixture_detail_${id}`, { match, detail }, detailTtl);

    console.log('[sportsApi] getFixtureDetail OK for', id);
    return { match, detail };
  } catch (err) {
    console.warn('[sportsApi] getFixtureDetail FAILED for id=' + id + ':', err instanceof Error ? err.message : err);
    captureError(err, { fn: 'getFixtureDetail', fixtureId: id });
    const cached = await AppCache.get<{ match: Match; detail: Partial<MatchDetail> }>(`fixture_detail_${id}`);
    return cached ?? null;
  }
}

/**
 * Fetch standings for a season.
 */
export async function getStandings(seasonId: number): Promise<LeagueStanding[]> {
  try {
    const rawData = await fetchStandings(seasonId);

    // Guard: flatten nested arrays (some leagues return [[group1], [group2]])
    const data: SMStandingGroup[] = rawData.length > 0 && Array.isArray(rawData[0])
      ? (rawData as unknown as SMStandingGroup[][]).flat()
      : rawData;

    if (data.length === 0) return [];

    // ── Step 1: Deduplicate by team — keep the stage with actual data ──────────
    // Some leagues (e.g. Argentine Liga Profesional) return multiple stages where
    // the newer stage has all zeros (0 GP, 0 pts) — a future/placeholder stage.
    // Prefer the stage where the team has actually played (GP > 0).
    // Among stages with real data, prefer the one with the higher stage_id.
    const getPlayed = (sg: SMStandingGroup) =>
      (sg.details ?? []).find(d => d.type_id === 129)?.value ?? 0;

    const byTeam = new Map<number, SMStandingGroup>();
    for (const sg of data) {
      if (!sg.participant_id) continue;
      const existing = byTeam.get(sg.participant_id);
      if (!existing) {
        byTeam.set(sg.participant_id, sg);
        continue;
      }
      const existingPlayed = getPlayed(existing);
      const newPlayed      = getPlayed(sg);
      // Prefer entry with real data; if both have data, take the newer stage
      if (existingPlayed === 0 && newPlayed > 0) {
        byTeam.set(sg.participant_id, sg);
      } else if (existingPlayed > 0 && newPlayed > 0 && sg.stage_id > existing.stage_id) {
        byTeam.set(sg.participant_id, sg);
      }
      // If existing has data and new doesn't → keep existing (no-op)
    }

    const deduplicated = Array.from(byTeam.values());

    // ── Step 2: Detect multi-group leagues ───────────────────────────────────
    // After dedup, teams may be in different groups within the same stage
    // (e.g. championship group vs relegation group). The `position` field
    // is local to each group (1-6 in both), so we need global ordering.
    const groupIds = new Set(deduplicated.map(sg => sg.group_id ?? 0));
    const isMultiGroup = groupIds.size > 1;

    // Sort: by group_id first (championship groups get lower IDs), then by position
    deduplicated.sort((a, b) => {
      const gA = a.group_id ?? 0;
      const gB = b.group_id ?? 0;
      if (gA !== gB) return gA - gB;
      return a.position - b.position;
    });

    // ── Step 3: Map to LeagueStanding with sequential global positions ───────
    const result = deduplicated.map((sg, idx) => ({
      ...mapStandingToLeagueStanding(sg),
      position: isMultiGroup ? idx + 1 : sg.position,
      groupId: isMultiGroup ? (sg.group_id ?? null) : null,
    }));
    AppCache.set(`standings_${seasonId}`, result, CacheTTL.standings);
    return result;
  } catch (err) {
    console.warn('[sportsApi] getStandings failed:', err);
    captureError(err, { fn: 'getStandings', seasonId });
    const cached = await AppCache.get<LeagueStanding[]>(`standings_${seasonId}`);
    return cached ?? [];
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CUP GROUP STAGE — group-phase standings for cup competitions
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fetches group-stage standings for a cup competition.
 *
 * Approach:
 *  1. Fetch all standings for the season — entries with `group_id != null` are
 *     the group-stage rows (entries without group_id belong to the knockout
 *     phase or are aggregate league tables).
 *  2. In parallel, fetch `/groups/seasons/{id}` to get real group names
 *     ("Group A", "Grupo B", etc.). Falls back to auto-generated letters if
 *     the endpoint returns nothing (knockout-only competitions).
 *  3. Sort each group by position, map to `LeagueStanding`, and return.
 *
 * Result is cached for 30 min (same TTL as regular standings).
 */
export async function getCupGroupStandings(seasonId: number): Promise<CupGroupsResult> {
  const cacheKey = `cup_groups_${seasonId}`;
  const cached = await AppCache.get<CupGroupsResult>(cacheKey);
  if (cached) return cached;

  try {
    const [rawData, smGroups] = await Promise.all([
      fetchStandings(seasonId),
      fetchGroupsBySeason(seasonId).catch(() => [] as SMGroup[]),
    ]);

    // Flatten nested arrays (same guard as getStandings)
    const data: SMStandingGroup[] = rawData.length > 0 && Array.isArray(rawData[0])
      ? (rawData as unknown as SMStandingGroup[][]).flat()
      : rawData;

    // Only rows with a group_id belong to the group stage
    const groupRows = data.filter(sg => sg.group_id != null);
    if (groupRows.length === 0) {
      const empty: CupGroupsResult = { hasGroups: false, groups: [] };
      AppCache.set(cacheKey, empty, CacheTTL.standings);
      return empty;
    }

    // Build group_id → display name map (from API or auto-generated letters)
    const apiNameMap = new Map<number, string>(smGroups.map(g => [g.id, g.name]));
    const sortedGroupIds = Array.from(new Set(groupRows.map(sg => sg.group_id!)))
      .sort((a, b) => a - b);
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    // Bucket rows by group_id
    const buckets = new Map<number, SMStandingGroup[]>();
    for (const sg of groupRows) {
      const gid = sg.group_id!;
      if (!buckets.has(gid)) buckets.set(gid, []);
      buckets.get(gid)!.push(sg);
    }

    const groups: CupGroup[] = sortedGroupIds.map((gid, idx) => {
      const rows = (buckets.get(gid) ?? []).slice().sort((a, b) => a.position - b.position);
      const apiName = apiNameMap.get(gid);
      const name    = apiName ?? `Grupo ${LETTERS[idx] ?? String(idx + 1)}`;
      return {
        id: gid,
        name,
        standings: rows.map(sg => mapStandingToLeagueStanding(sg)),
      };
    });

    const result: CupGroupsResult = { hasGroups: true, groups };
    AppCache.set(cacheKey, result, CacheTTL.standings);
    return result;
  } catch {
    const cached2 = await AppCache.get<CupGroupsResult>(cacheKey);
    return cached2 ?? { hasGroups: false, groups: [] };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CUP BRACKET — for knockout / elimination competitions
// ══════════════════════════════════════════════════════════════════════════════

/** One leg (match) of a knockout tie */
export interface CupLeg {
  fixtureId: string;
  date: string;              // "YYYY-MM-DD"
  status: MatchStatus;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number | null;  // null if not yet played
  awayScore: number | null;
  legLabel: string;          // "IDA" | "VUELTA" | ""
}

/** One matchup between two teams (may have 1 or 2 legs) */
export interface CupTie {
  id: string;
  homeTeam: Team;            // canonical first-leg home team
  awayTeam: Team;
  legs: CupLeg[];
  aggregate: { home: number; away: number } | null;
  winner: Team | null;
  isCurrentMatch: boolean;   // one of the fixtures is the match being viewed
  isFinished: boolean;       // ALL legs have been played — safe to show winner
}

/** A round of the knockout phase (Round of 16, Quarter-finals, etc.) */
export interface CupRound {
  id: number;
  name: string;              // translated to Spanish
  sortOrder: number;
  isCurrent: boolean;
  isFinished: boolean;
  ties: CupTie[];
}

// ── Round name translations (EN → ES) ────────────────────────────────────────

const ROUND_TRANSLATIONS: Record<string, string> = {
  // Generic knockout names
  'round of 128': 'Ronda de 128',
  'round of 64': 'Ronda de 64',
  'round of 32': 'Dieciseisavos',
  'round of 16': 'Octavos de Final',
  '16th finals': 'Octavos de Final',
  'quarter-finals': 'Cuartos de Final',
  'quarter finals': 'Cuartos de Final',
  'quarterfinals': 'Cuartos de Final',
  '8th finals': 'Octavos de Final',
  'semi-finals': 'Semifinales',
  'semi finals': 'Semifinales',
  'semifinals': 'Semifinales',
  '4th finals': 'Cuartos de Final',
  'final': 'Final',
  '1st final': 'Final',
  '2nd finals': 'Semifinales',
  // Qualifying / early rounds
  'qualifying': 'Clasificatoria',
  'qualifying round': 'Ronda Clasificatoria',
  'play-offs': 'Play-Off',
  'playoff': 'Play-Off',
  'playoff round': 'Play-Off',
  '1st round': 'Primera Ronda',
  '2nd round': 'Segunda Ronda',
  '3rd round': 'Tercera Ronda',
  '4th round': 'Cuarta Ronda',
  'round 1': 'Primera Ronda',
  'round 2': 'Segunda Ronda',
  'round 3': 'Tercera Ronda',
  'round 4': 'Cuarta Ronda',
  // Group stage (hybrids)
  'group stage': 'Fase de Grupos',
  'group phase': 'Fase de Grupos',
  'league phase': 'Fase de Liga',
};

function translateRoundName(name: string): string {
  // Strip tournament prefix like "Clausura - " (SPACE + hyphen + SPACE pattern).
  // This preserves hyphenated round names like "Quarter-finals", "Semi-finals".
  const withoutPrefix = name.replace(/^.+\s+-\s+/i, '').trim();
  const lower = withoutPrefix.toLowerCase().trim();
  return ROUND_TRANSLATIONS[lower] ?? withoutPrefix;
}

// Ordinal rank map: "1st ranked" / "2nd ranked" / etc. → i18n key
const RANKED_KEYS: Record<number, string> = {
  1: 'cup.ranked1', 2: 'cup.ranked2', 3: 'cup.ranked3', 4: 'cup.ranked4',
  5: 'cup.ranked5', 6: 'cup.ranked6', 7: 'cup.ranked7', 8: 'cup.ranked8',
  9: 'cup.ranked9', 10: 'cup.ranked10',
};

/** Translate placeholder team names from SportMonks (TBC, "6th ranked", etc.) */
function translatePlaceholderName(name: string): string {
  if (!name) return name;
  const lower = name.toLowerCase().trim();
  // TBC / TBD variants
  if (lower === 'tbc' || lower === 'tbd') {
    return i18n.t('cup.toBeDefined');
  }
  // "Nth ranked" or "Nth place" → ordinal
  const rankedMatch = lower.match(/^(\d+)(?:st|nd|rd|th)?\s+(?:ranked|place)$/);
  if (rankedMatch) {
    const n = parseInt(rankedMatch[1], 10);
    const key = RANKED_KEYS[n];
    if (key) return i18n.t(key as any);
  }
  return name;
}

// ── Leg label from fixture.leg field ─────────────────────────────────────────

function getLegLabel(legStr: string | undefined, totalLegs: number): string {
  if (totalLegs <= 1) return '';
  const n = parseInt(legStr ?? '0', 10);
  if (n === 1) return 'IDA';
  if (n === 2) return 'VUELTA';
  return '';
}

// ── Pair fixtures into ties by team combination ───────────────────────────────

function pairFixturesToTies(fixtures: SMFixture[]): SMFixture[][] {
  const tieMap = new Map<string, SMFixture[]>();

  for (const fixture of fixtures) {
    const home = getParticipant(fixture, 'home');
    const away = getParticipant(fixture, 'away');
    if (!home || !away) continue;

    // Use aggregate_id if present (SM groups legs explicitly); else pair by teams
    const key = fixture.aggregate_id
      ? `agg_${fixture.aggregate_id}`
      : `teams_${[home.id, away.id].sort().join('-')}`;

    if (!tieMap.has(key)) tieMap.set(key, []);
    tieMap.get(key)!.push(fixture);
  }

  // Sort legs by date (ascending: leg 1 before leg 2)
  return Array.from(tieMap.values()).map(legs =>
    [...legs].sort((a, b) => a.starting_at.localeCompare(b.starting_at))
  );
}

// ── Map a set of fixtures (1 or 2 legs) → CupTie ─────────────────────────────

function mapTie(fixtures: SMFixture[], currentFixtureId?: string): CupTie {
  // Canonical teams: home/away of the FIRST leg
  const firstLeg = fixtures[0];
  const homeTeam = mapParticipantToTeam(getParticipant(firstLeg, 'home'));
  const awayTeam = mapParticipantToTeam(getParticipant(firstLeg, 'away'));
  const totalLegs = fixtures.length;

  const legs: CupLeg[] = fixtures.map(fixture => {
    const fHome = getParticipant(fixture, 'home');
    const fAway = getParticipant(fixture, 'away');
    const status = mapStateToStatus(fixture.state_id, fixture.starting_at);
    const played = status !== 'scheduled';
    return {
      fixtureId: String(fixture.id),
      date: fixture.starting_at.split(' ')[0],
      status,
      homeTeam: mapParticipantToTeam(fHome),
      awayTeam: mapParticipantToTeam(fAway),
      homeScore: played ? getGoals(fixture.scores, 'home') : null,
      awayScore: played ? getGoals(fixture.scores, 'away') : null,
      legLabel: getLegLabel(fixture.leg, totalLegs),
    };
  });

  // Compute aggregate (track from canonical home team's perspective)
  let aggHome = 0;
  let aggAway = 0;
  let hasAnyScore = false;

  for (const leg of legs) {
    if (leg.homeScore === null || leg.awayScore === null) continue;
    hasAnyScore = true;
    // If this leg's home matches the canonical home team → add directly
    if (leg.homeTeam.id === homeTeam.id) {
      aggHome += leg.homeScore;
      aggAway += leg.awayScore;
    } else {
      // Reversed leg (vuelta at canonical away team's ground)
      aggHome += leg.awayScore;
      aggAway += leg.homeScore;
    }
  }

  const aggregate = hasAnyScore ? { home: aggHome, away: aggAway } : null;

  // Determine winner — ONLY when every leg has been played
  let winner: Team | null = null;
  const allLegsFinished = legs.length > 0 && legs.every(l => l.status === 'finished');

  if (allLegsFinished && aggregate) {
    if (aggregate.home > aggregate.away) winner = homeTeam;
    else if (aggregate.away > aggregate.home) winner = awayTeam;
    // Equal aggregate → could be pens/ET; also check meta.winner on last fixture
    if (!winner) {
      for (const fixture of [...fixtures].reverse()) {
        const homeP = getParticipant(fixture, 'home');
        const awayP = getParticipant(fixture, 'away');
        if (homeP?.meta?.winner) { winner = mapParticipantToTeam(homeP); break; }
        if (awayP?.meta?.winner) { winner = mapParticipantToTeam(awayP); break; }
      }
    }
  }
  // ⚠️  Never set winner if any leg is still pending — even if SM shows meta.winner
  // on the first leg (e.g. 3-0 advantage). The tie isn't official until all legs finish.

  return {
    id: fixtures.map(f => f.id).join('-'),
    homeTeam,
    awayTeam,
    legs,
    aggregate,
    winner,
    isCurrentMatch: !!currentFixtureId && fixtures.some(f => String(f.id) === currentFixtureId),
    isFinished: allLegsFinished,
  };
}

/**
 * Fetch the full cup bracket for a season.
 * Returns rounds sorted from earliest (R32) to latest (Final),
 * each containing ties with scores and winners.
 */
export async function getCupBracket(
  seasonId: number,
  currentFixtureId?: string,
  isPlayoffsOnly?: boolean,
): Promise<CupRound[]> {
  try {
    const fixtures = await fetchFixturesBySeasonId(seasonId);
    if (fixtures.length === 0) return [];

    // ── Group by STAGE (not round) ────────────────────────────────────────────
    // SportMonks structure: Stage = bracket phase (R16, QF, SF, Final)
    //                       Round = matchday within a stage (leg 1, leg 2)
    // Grouping by round gives us matchdays. Grouping by stage gives bracket phases.
    const stageMap = new Map<number, {
      name: string;
      sortOrder: number;
      isCurrent: boolean;
      isFinished: boolean;
      fixtures: typeof fixtures;
    }>();

    for (const fixture of fixtures) {
      const stageId = fixture.stage_id ?? fixture.round?.stage_id ?? 0;
      if (!stageMap.has(stageId)) {
        const stage = (fixture as any).stage;
        stageMap.set(stageId, {
          name: stage?.name ?? fixture.round?.name ?? 'Ronda',
          sortOrder: stage?.sort_order ?? fixture.round?.sort_order ?? 999,
          isCurrent: stage?.is_current ?? false,
          isFinished: stage?.finished ?? false,
          fixtures: [],
        });
      }
      stageMap.get(stageId)!.fixtures.push(fixture);
    }

    // ── Playoffs-only filter (Liga MX, MLS, etc.) ─────────────────────────────
    // Goal: show only the CURRENT tournament's knockout stages.
    // Strategy:
    //   1. Discard stages with too many fixtures (regular season has 100+ per stage).
    //   2. Discard stages that are fully finished — past tournaments (e.g. Apertura).
    //      If ALL playoff-sized stages are finished → return [] so the caller can
    //      show a projected bracket from current standings instead.
    //   3. Among remaining (active/upcoming) stages, isolate one tournament by prefix
    //      (e.g. "Clausura") using isCurrent flag or currentFixtureId.
    let activeMap = stageMap;
    if (isPlayoffsOnly) {
      // Step 1 — remove regular-season stages (Liga MX Clausura has ~153 fixtures)
      const MAX_PLAYOFF_FIXTURES = 24;
      const playoffSized = Array.from(stageMap.entries())
        .filter(([, s]) => s.fixtures.length <= MAX_PLAYOFF_FIXTURES);

      // Step 2 — keep only stages that are NOT fully finished
      // This drops Apertura (past) and leaves Clausura (active/upcoming) stages.
      const notFinished = playoffSized.filter(([, s]) => !s.isFinished);

      // If every playoff stage is done (Apertura over, Clausura not yet created),
      // return an empty map → TablaTab.tsx will show a projected bracket instead.
      if (notFinished.length === 0) {
        activeMap = new Map();
      } else {
        // Step 3 — detect tournament prefix to avoid mixing two active tournaments
        let tournamentPrefix: string | null = null;

        // Option A: stage flagged isCurrent by SportMonks
        for (const [, s] of notFinished) {
          if (s.isCurrent) {
            const m = s.name.match(/^(.+?)\s+-\s+/i);
            if (m) { tournamentPrefix = m[1].trim().toLowerCase(); break; }
          }
        }
        // Option B: stage containing the current fixture
        if (!tournamentPrefix && currentFixtureId) {
          for (const [, s] of notFinished) {
            if (s.fixtures.some(f => String(f.id) === currentFixtureId)) {
              const m = s.name.match(/^(.+?)\s+-\s+/i);
              if (m) { tournamentPrefix = m[1].trim().toLowerCase(); break; }
            }
          }
        }

        // Step 4 — filter by prefix (if found) to keep one tournament only
        const filtered = tournamentPrefix
          ? notFinished.filter(([, s]) => {
              const nl = s.name.toLowerCase();
              return nl.startsWith(tournamentPrefix!) || !nl.includes(' - ');
            })
          : notFinished;

        activeMap = new Map(filtered);
      }
    }

    // ── Convert to CupRound[] ─────────────────────────────────────────────────
    const rounds: CupRound[] = [];

    for (const [stageId, { name, sortOrder, isCurrent, isFinished, fixtures: stageFixtures }] of activeMap) {
      const ties = pairFixturesToTies(stageFixtures)
        .map(f => mapTie(f, currentFixtureId));

      rounds.push({
        id: stageId,
        name: translateRoundName(name),
        sortOrder,
        isCurrent,
        isFinished,
        ties,
      });
    }

    // Sort: earliest stage first (Prelim → R16 → QF → SF → Final)
    rounds.sort((a, b) => a.sortOrder - b.sortOrder);

    // ── Backfill TBD slots in already-created future rounds ──────────────────
    // SportMonks sometimes creates future stages (e.g. Final) before the matchups
    // are determined, using placeholder participants (id=0 / name="TBC"). We fill
    // those slots with confirmed winners from the previous round, or with a
    // "Ganador X vs Y" label when the previous-round tie is still in progress.
    for (let ri = 1; ri < rounds.length; ri++) {
      const prevRound = rounds[ri - 1];
      const currRound = rounds[ri];

      // Build the ordered list of teams advancing from the previous round
      const advancing: Team[] = prevRound.ties.map((tie, ti) => {
        if (tie.isFinished && tie.winner) return { ...tie.winner };
        return {
          id: `tbd-${prevRound.id}-${ti}`,
          name: `Ganador ${abbreviate(tie.homeTeam.name)} vs ${abbreviate(tie.awayTeam.name)}`,
          shortName: 'TBD',
          logo: '⚽',
        };
      });

      // Detect TBD: either no participant was returned (id='0') OR SM sent a
      // placeholder with a real ID but name "TBC" / "TBD" (translated to "Por definir").
      const TBD_NAME = i18n.t('cup.toBeDefined' as any) as string;
      const isTBDTeam = (team: Team) => team.id === '0' || team.name === TBD_NAME;

      let advIdx = 0;
      const updatedTies = currRound.ties.map(tie => {
        const needsHome = isTBDTeam(tie.homeTeam);
        const needsAway = isTBDTeam(tie.awayTeam);
        if (!needsHome && !needsAway) return tie;
        const newHome = needsHome && advIdx < advancing.length ? advancing[advIdx++] : tie.homeTeam;
        const newAway = needsAway && advIdx < advancing.length ? advancing[advIdx++] : tie.awayTeam;
        return { ...tie, homeTeam: newHome, awayTeam: newAway };
      });
      rounds[ri] = { ...currRound, ties: updatedTies };
    }

    // ── Infer missing future stages ──────────────────────────────────────────
    // SportMonks doesn't create stages/fixtures until matchups are known.
    // For knockout cups: if last stage is QF (4 ties) → add SF (2) + Final (1).
    // Each inferred tie shows the bracket path ("Ganador X vs Y").
    const lastRound = rounds[rounds.length - 1];
    if (lastRound && lastRound.ties.length >= 2) {
      let feeders = lastRound.ties;
      let order = lastRound.sortOrder;

      while (feeders.length >= 2) {
        const nextTies: CupTie[] = [];
        for (let i = 0; i < feeders.length; i += 2) {
          const t1 = feeders[i];
          const t2 = i + 1 < feeders.length ? feeders[i + 1] : null;

          // Build team labels — only use confirmed winner if the tie is 100% finished
          const confirmedHome = (t1.isFinished && t1.winner) ? t1.winner : null;
          const homeTeam = confirmedHome
            ? { ...confirmedHome }
            : { id: `tbd-${order}-${i}`, name: `Ganador ${abbreviate(t1.homeTeam.name)} vs ${abbreviate(t1.awayTeam.name)}`, shortName: 'TBD', logo: '⚽' };

          const confirmedAway = t2 && t2.isFinished && t2.winner ? t2.winner : null;
          const awayTeam = t2
            ? (confirmedAway
              ? { ...confirmedAway }
              : { id: `tbd-${order}-${i + 1}`, name: `Ganador ${abbreviate(t2.homeTeam.name)} vs ${abbreviate(t2.awayTeam.name)}`, shortName: 'TBD', logo: '⚽' })
            : { id: `tbd-${order}-bye`, name: 'TBD', shortName: 'TBD', logo: '⚽' };

          nextTies.push({
            id: `inferred-${order}-${i}`,
            homeTeam,
            awayTeam,
            legs: [],
            aggregate: null,
            winner: null,
            isCurrentMatch: false,
            isFinished: false,
          });
        }

        order++;
        const n = nextTies.length;
        const name = n === 1 ? 'Final' : n === 2 ? 'Semifinales' : `1/${n * 2} de Final`;

        rounds.push({
          id: -order,
          name,
          sortOrder: order,
          isCurrent: false,
          isFinished: false,
          ties: nextTies,
        });

        // Stop after the final (1 tie)
        if (nextTies.length <= 1) break;
        feeders = nextTies;
      }
    }

    return rounds;

  } catch (err) {
    console.warn('[sportsApi] getCupBracket failed:', err);
    captureError(err, { fn: 'getCupBracket' });
    return [];
  }
}

/** Abbreviate long team names for bracket path labels */
function abbreviate(name: string): string {
  if (name.length <= 12) return name;
  // Try first word
  const first = name.split(' ')[0];
  if (first.length >= 3) return first;
  return name.slice(0, 12) + '…';
}

/**
 * Fetch top scorers for a season.
 */
export interface TopScorer {
  playerId: number;
  playerName: string;
  playerImage: string;
  goals: number;
  teamId: number;
  position: number;
}

export async function getTopScorers(seasonId: number): Promise<TopScorer[]> {
  const cacheKey = `scorers_${seasonId}`;
  try {
    const data = await fetchTopScorers(seasonId);
    const result = data.map(ts => ({
      playerId: ts.player_id,
      playerName: ts.player?.display_name ?? ts.player?.name ?? `Player ${ts.player_id}`,
      playerImage: ts.player?.image_path ?? '',
      goals: ts.total,
      teamId: ts.participant_id,
      position: ts.position,
    }));
    AppCache.set(cacheKey, result, CacheTTL.standings);
    return result;
  } catch (err) {
    console.warn('[sportsApi] getTopScorers failed:', err);
    captureError(err, { fn: 'getTopScorers' });
    const cached = await AppCache.get<TopScorer[]>(cacheKey);
    return cached ?? [];
  }
}

/**
 * Fetch H2H between two teams.
 */
export async function getH2HFixtures(teamId1: number, teamId2: number): Promise<H2HResult[]> {
  const cacheKey = `h2h_${teamId1}_${teamId2}`;
  try {
    const fixtures = await fetchH2H(teamId1, teamId2);
    const result = fixtures.map(f => ({
      date: f.starting_at.split(' ')[0],
      homeScore: getGoals(f.scores, 'home'),
      awayScore: getGoals(f.scores, 'away'),
      competition: f.league?.name ?? '',
      venue: '',
    }));
    AppCache.set(cacheKey, result, CacheTTL.h2h);
    return result;
  } catch (err) {
    console.warn('[sportsApi] getH2HFixtures failed:', err);
    const cached = await AppCache.get<H2HResult[]>(cacheKey);
    return cached ?? [];
  }
}

/**
 * Get leagues list.
 */
export async function getLeagues(): Promise<League[]> {
  return AVAILABLE_LEAGUES.map(l => ({
    id: String(l.id),
    name: l.name,
    country: l.country,
    logo: l.flag,
  }));
}

/**
 * Get news articles — SM doesn't provide news on free plan.
 * Returns mock data for now.
 */
export async function getNews(): Promise<NewsArticle[]> {
  const { news } = await import('../data/mockData');
  return news;
}

/**
 * Match count for date — used by CalendarPicker dots.
 * Uses local date so counts reflect the user's actual timezone.
 */
export async function getMatchCountForDate(localDate: string): Promise<number> {
  try {
    const utcDates = getUtcDatesForLocalDay(localDate);
    const results = await Promise.all(utcDates.map(d => fetchFixturesByDate(d)));
    const seen = new Set<number>();
    const unique = results.flat().filter(f => {
      if (seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
    return unique.filter(f => utcStringToLocalDateStr(f.starting_at) === localDate).length;
  } catch {
    return 0;
  }
}

// ── Search Data ─────────────────────────────────────────────────────────────

export interface SearchableTeam {
  id: number;
  name: string;
  shortName: string;
  logo: string;
  leagueName: string;
  leagueId: number;
  seasonId?: number;
  /** Extra search terms (English names, alternate spellings) for cross-language matching */
  searchTerms?: string[];
}

export interface SearchablePlayer {
  id: number;
  name: string;
  image?: string;
  teamName?: string;
  teamLogo?: string;
  teamId?: number;
  position?: string;
  jerseyNumber?: number;
}

export interface SearchableLeague {
  id: number;
  name: string;
  country: string;
  flag: string;
  image: string;       // SportMonks CDN logo URL
  seasonId?: number;
}

/** Returns all leagues from config as searchable items */
export function getSearchableLeagues(): SearchableLeague[] {
  return AVAILABLE_LEAGUES.map(l => ({
    id: l.id,
    name: l.name,
    country: l.country,
    flag: l.flag,
    image: `https://cdn.sportmonks.com/images/soccer/leagues/${l.id}.png`,
    seasonId: l.currentSeasonId ?? undefined,
  }));
}

/** Fetches all teams from available leagues for local search */
// ── Popular Teams (hardcoded for instant onboarding, sorted by global popularity) ──

// All IDs verified against SportMonks API (April 2026)
const POPULAR_TEAMS: SearchableTeam[] = [
  // Liga MX — México (first for Mexican market)
  { id: 2687,   name: 'América',              shortName: 'AME', logo: 'https://cdn.sportmonks.com/images/soccer/teams/31/2687.png', leagueName: 'Liga MX', leagueId: 743, seasonId: 25539 },
  { id: 427,    name: 'Guadalajara',          shortName: 'GUA', logo: 'https://cdn.sportmonks.com/images/soccer/teams/11/427.png', leagueName: 'Liga MX', leagueId: 743, seasonId: 25539 },
  { id: 2626,   name: 'Cruz Azul',            shortName: 'CAZ', logo: 'https://cdn.sportmonks.com/images/soccer/teams/2/2626.png', leagueName: 'Liga MX', leagueId: 743, seasonId: 25539 },
  { id: 609,    name: 'Tigres UANL',          shortName: 'TUA', logo: 'https://cdn.sportmonks.com/images/soccer/teams/1/609.png', leagueName: 'Liga MX', leagueId: 743, seasonId: 25539 },
  { id: 2662,   name: 'Monterrey',            shortName: 'MNT', logo: 'https://cdn.sportmonks.com/images/soccer/teams/6/2662.png', leagueName: 'Liga MX', leagueId: 743, seasonId: 25539 },
  { id: 2989,   name: 'Pumas UNAM',           shortName: 'PUM', logo: 'https://cdn.sportmonks.com/images/soccer/teams/13/2989.png', leagueName: 'Liga MX', leagueId: 743, seasonId: 25539 },
  { id: 2844,   name: 'Santos Laguna',        shortName: 'SLA', logo: 'https://cdn.sportmonks.com/images/soccer/teams/28/2844.png', leagueName: 'Liga MX', leagueId: 743, seasonId: 25539 },
  { id: 967,    name: 'Toluca',               shortName: 'TOL', logo: 'https://cdn.sportmonks.com/images/soccer/teams/7/967.png', leagueName: 'Liga MX', leagueId: 743, seasonId: 25539 },
  { id: 10036,  name: 'Pachuca',              shortName: 'PCH', logo: 'https://cdn.sportmonks.com/images/soccer/teams/20/10036.png', leagueName: 'Liga MX', leagueId: 743, seasonId: 25539 },
  { id: 680,    name: 'Atlas',                shortName: 'ATS', logo: 'https://cdn.sportmonks.com/images/soccer/teams/8/680.png', leagueName: 'Liga MX', leagueId: 743, seasonId: 25539 },
  // Europe — Top clubs
  { id: 3468,   name: 'Real Madrid',          shortName: 'RMA', logo: 'https://cdn.sportmonks.com/images/soccer/teams/12/3468.png', leagueName: 'La Liga', leagueId: 564, seasonId: 25659 },
  { id: 83,     name: 'FC Barcelona',         shortName: 'BAR', logo: 'https://cdn.sportmonks.com/images/soccer/teams/19/83.png', leagueName: 'La Liga', leagueId: 564, seasonId: 25659 },
  { id: 9,      name: 'Manchester City',      shortName: 'MCI', logo: 'https://cdn.sportmonks.com/images/soccer/teams/9/9.png', leagueName: 'Premier League', leagueId: 8, seasonId: 25583 },
  { id: 14,     name: 'Manchester United',    shortName: 'MUN', logo: 'https://cdn.sportmonks.com/images/soccer/teams/14/14.png', leagueName: 'Premier League', leagueId: 8, seasonId: 25583 },
  { id: 8,      name: 'Liverpool',            shortName: 'LIV', logo: 'https://cdn.sportmonks.com/images/soccer/teams/8/8.png', leagueName: 'Premier League', leagueId: 8, seasonId: 25583 },
  { id: 19,     name: 'Arsenal',              shortName: 'ARS', logo: 'https://cdn.sportmonks.com/images/soccer/teams/19/19.png', leagueName: 'Premier League', leagueId: 8, seasonId: 25583 },
  { id: 18,     name: 'Chelsea',              shortName: 'CHE', logo: 'https://cdn.sportmonks.com/images/soccer/teams/18/18.png', leagueName: 'Premier League', leagueId: 8, seasonId: 25583 },
  { id: 503,    name: 'Bayern München',       shortName: 'BAY', logo: 'https://cdn.sportmonks.com/images/soccer/teams/23/503.png', leagueName: 'Bundesliga', leagueId: 82, seasonId: 25646 },
  { id: 625,    name: 'Juventus',             shortName: 'JUV', logo: 'https://cdn.sportmonks.com/images/soccer/teams/17/625.png', leagueName: 'Serie A', leagueId: 384, seasonId: 25533 },
  { id: 113,    name: 'AC Milan',             shortName: 'MIL', logo: 'https://cdn.sportmonks.com/images/soccer/teams/17/113.png', leagueName: 'Serie A', leagueId: 384, seasonId: 25533 },
  { id: 2930,   name: 'Inter',                shortName: 'INT', logo: 'https://cdn.sportmonks.com/images/soccer/teams/18/2930.png', leagueName: 'Serie A', leagueId: 384, seasonId: 25533 },
  { id: 591,    name: 'Paris Saint-Germain',  shortName: 'PSG', logo: 'https://cdn.sportmonks.com/images/soccer/teams/15/591.png', leagueName: 'Ligue 1', leagueId: 301, seasonId: 25651 },
  // Americas — Other
  { id: 239235, name: 'Inter Miami',          shortName: 'MIA', logo: 'https://cdn.sportmonks.com/images/soccer/teams/3/239235.png', leagueName: 'MLS', leagueId: 779, seasonId: 26720 },
  { id: 587,    name: 'Boca Juniors',         shortName: 'BOC', logo: 'https://cdn.sportmonks.com/images/soccer/teams/11/587.png', leagueName: 'Liga Profesional', leagueId: 636, seasonId: 26808 },
  { id: 10002,  name: 'River Plate',          shortName: 'RIV', logo: 'https://cdn.sportmonks.com/images/soccer/teams/18/10002.png', leagueName: 'Liga Profesional', leagueId: 636, seasonId: 26808 },
  { id: 1024,   name: 'Flamengo',             shortName: 'FLA', logo: 'https://cdn.sportmonks.com/images/soccer/teams/0/1024.png', leagueName: 'Brasileirão', leagueId: 648, seasonId: 26763 },
  // Saudi Arabia
  { id: 2506,   name: 'Al Nassr',             shortName: 'ANA', logo: 'https://cdn.sportmonks.com/images/soccer/teams/10/2506.png', leagueName: 'Saudi Pro League', leagueId: 944, seasonId: 26276 },
  { id: 7011,   name: 'Al Hilal',             shortName: 'ALH', logo: 'https://cdn.sportmonks.com/images/soccer/teams/3/7011.png', leagueName: 'Saudi Pro League', leagueId: 944, seasonId: 26276 },

];

// ── Popular Players (hardcoded for instant onboarding) ──

const POPULAR_PLAYERS: SearchablePlayer[] = [
  // Global stars
  { id: 93392, name: 'Lionel Messi', image: 'https://cdn.sportmonks.com/images/soccer/players/24/93392.png' },
  { id: 85668, name: 'Cristiano Ronaldo', image: 'https://cdn.sportmonks.com/images/soccer/players/20/85668.png' },
  { id: 159583, name: 'Erling Haaland', image: 'https://cdn.sportmonks.com/images/soccer/players/15/159583.png' },
  { id: 163637, name: 'Kylian Mbappé', image: 'https://cdn.sportmonks.com/images/soccer/players/21/163637.png' },
  { id: 316264, name: 'Jude Bellingham', image: 'https://cdn.sportmonks.com/images/soccer/players/24/316264.png' },
  { id: 284909, name: 'Vinícius Júnior', image: 'https://cdn.sportmonks.com/images/soccer/players/13/284909.png' },
  { id: 370498, name: 'Lamine Yamal', image: 'https://cdn.sportmonks.com/images/soccer/players/18/370498.png' },
  { id: 159584, name: 'Florian Wirtz', image: 'https://cdn.sportmonks.com/images/soccer/players/16/159584.png' },
  { id: 153357, name: 'Pedri', image: 'https://cdn.sportmonks.com/images/soccer/players/13/153357.png' },
  { id: 37572, name: 'Mohamed Salah', image: 'https://cdn.sportmonks.com/images/soccer/players/20/37572.png' },
  // Mexico stars
  { id: 162396, name: 'Santiago Giménez', image: 'https://cdn.sportmonks.com/images/soccer/players/12/162396.png' },
  { id: 110137, name: 'Raúl Jiménez', image: 'https://cdn.sportmonks.com/images/soccer/players/25/110137.png' },
  { id: 163535, name: 'Julián Quiñones', image: 'https://cdn.sportmonks.com/images/soccer/players/19/163535.png' },
  { id: 85966, name: 'Guillermo Ochoa', image: 'https://cdn.sportmonks.com/images/soccer/players/14/85966.png' },
  { id: 37557, name: 'Hirving Lozano', image: 'https://cdn.sportmonks.com/images/soccer/players/5/37557.png' },
];

/**
 * Returns popular teams instantly (hardcoded), then optionally loads more from API.
 * First batch = instant. Subsequent batches loaded on demand via loadMoreTeams().
 */
export async function getSearchableTeams(): Promise<SearchableTeam[]> {
  // Return popular teams instantly — no API call needed
  return POPULAR_TEAMS;
}

/**
 * Returns the **complete** searchable team index: all ~30 hardcoded "popular"
 * teams + every team from every configured league (via /teams/seasons/{id}) +
 * all national teams. Used by the onboarding/global search so niche clubs
 * like Dorados (Liga Expansión MX) are findable.
 *
 * Result is cached for 7 days under `searchable_teams_all_v1`, so the
 * multi-request fan-out runs at most once a week. On failure falls back to
 * whatever partial list was assembled.
 */
export async function getAllSearchableTeams(): Promise<SearchableTeam[]> {
  const cacheKey = 'searchable_teams_all_v1';
  const cached = await AppCache.get<SearchableTeam[]>(cacheKey);
  if (cached && cached.length > POPULAR_TEAMS.length) {
    return cached;
  }

  const seen = new Set<number>();
  const merged: SearchableTeam[] = [];
  const push = (t: SearchableTeam) => {
    if (!seen.has(t.id)) { seen.add(t.id); merged.push(t); }
  };

  // Seed with popular so they still come first
  POPULAR_TEAMS.forEach(push);

  try {
    const [nationals, leagueTeams] = await Promise.all([
      getSearchableNationalTeams().catch(() => [] as SearchableTeam[]),
      loadMoreTeams(AVAILABLE_LEAGUES).catch(() => [] as SearchableTeam[]),
    ]);
    leagueTeams.forEach(push);
    nationals.forEach(push);

    AppCache.set(cacheKey, merged, CacheTTL.players);
    return merged;
  } catch {
    return merged;
  }
}

/**
 * Load more teams from a specific set of leagues (called when user taps "Ver más").
 * Uses parallel requests for speed.
 */
export async function loadMoreTeams(leagueConfigs: typeof AVAILABLE_LEAGUES): Promise<SearchableTeam[]> {
  const teams: SearchableTeam[] = [];
  const batches = [];

  // Parallel: fetch up to 5 leagues simultaneously
  for (let i = 0; i < leagueConfigs.length; i += 5) {
    const batch = leagueConfigs.slice(i, i + 5);
    batches.push(
      Promise.all(
        batch.filter(l => l.currentSeasonId).map(async (league) => {
          try {
            const smTeams = await fetchTeamsBySeasonId(league.currentSeasonId!);
            return smTeams.map(t => ({
              id: t.id,
              name: t.name,
              shortName: t.short_code || t.name.slice(0, 3).toUpperCase(),
              logo: t.image_path || '⚽',
              leagueName: league.name,
              leagueId: league.id,
              seasonId: league.currentSeasonId!,
            }));
          } catch {
            return [] as SearchableTeam[];
          }
        })
      )
    );
  }

  for (const batch of batches) {
    const results = await batch;
    for (const leagueTeams of results) {
      teams.push(...leagueTeams);
    }
  }

  return teams;
}

/**
 * Returns the popular-players list for onboarding, enriched with the real
 * `image_path` and display name from SportMonks. Hardcoded image URLs often
 * rot when SportMonks reorganizes its CDN folders, so we fetch fresh metadata
 * on first launch and cache it for 7 days.
 *
 * The fetch is resilient: if any individual /players/{id} call fails, we fall
 * back to the hardcoded entry for that player. If the whole attempt fails
 * (offline on first launch), we return the hardcoded list untouched.
 */
export async function getSearchablePlayers(): Promise<SearchablePlayer[]> {
  const cacheKey = 'searchable_players_v2';
  const cached = await AppCache.get<SearchablePlayer[]>(cacheKey);
  if (cached && cached.length === POPULAR_PLAYERS.length) {
    return cached;
  }

  try {
    const results = await Promise.allSettled(
      POPULAR_PLAYERS.map(p => fetchPlayerById(p.id)),
    );

    const enriched: SearchablePlayer[] = POPULAR_PLAYERS.map((fallback, i) => {
      const r = results[i];
      if (r.status === 'fulfilled' && r.value) {
        const api = r.value;
        return {
          ...fallback,
          name: api.display_name || api.common_name || fallback.name,
          image: api.image_path || fallback.image,
        };
      }
      return fallback;
    });

    AppCache.set(cacheKey, enriched, CacheTTL.players);
    return enriched;
  } catch {
    return POPULAR_PLAYERS;
  }
}

/**
 * Returns the **complete** searchable player index: all enriched "popular"
 * players + every player in the squad of every team in `POPULAR_TEAMS`. We
 * intentionally don't expand to every team in every league — that would be
 * ~1000 squad requests on first launch. Popular-team squads alone adds ~750
 * players on top of the 15 hardcoded, which covers the realistic search
 * space for onboarding while keeping the fan-out bounded.
 *
 * Cached for 7 days under `searchable_players_all_v1`.
 */
export async function getAllSearchablePlayers(): Promise<SearchablePlayer[]> {
  const cacheKey = 'searchable_players_all_v1';
  const cached = await AppCache.get<SearchablePlayer[]>(cacheKey);
  if (cached && cached.length > POPULAR_PLAYERS.length) {
    return cached;
  }

  // Seed with the enriched popular list so marquee names still rank first
  const popular = await getSearchablePlayers();
  const seen = new Set<number>(popular.map(p => p.id));
  const merged: SearchablePlayer[] = [...popular];

  try {
    // Fetch squads for POPULAR_TEAMS in batches of 8 to avoid hammering the API
    const teamsWithSeason = POPULAR_TEAMS.filter(t => !!t.seasonId);
    for (let i = 0; i < teamsWithSeason.length; i += 8) {
      const batch = teamsWithSeason.slice(i, i + 8);
      const results = await Promise.allSettled(
        batch.map(t => fetchSquad(t.seasonId!, t.id)),
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status !== 'fulfilled') continue;
        const team = batch[j];
        for (const sp of r.value) {
          const p = sp.player;
          if (!p || seen.has(p.id)) continue;
          seen.add(p.id);
          merged.push({
            id: p.id,
            name: p.display_name || p.common_name || 'Unknown',
            image: p.image_path || '',
            teamName: team.name,
            teamLogo: team.logo,
            teamId: team.id,
            jerseyNumber: sp.jersey_number,
          });
        }
      }
    }

    AppCache.set(cacheKey, merged, CacheTTL.players);
    return merged;
  } catch {
    return merged;
  }
}

// ── National Teams ────────────────────────────────────────────────────────────

/**
 * Maps FIFA 3-letter codes to Spanish display names and search aliases.
 * Covers the most important nations for World Cup 2026 and our app's audience.
 * New national teams added automatically as competitions are added to SportMonks.
 */
const NATIONAL_TEAM_DISPLAY: Record<string, { name: string; searchTerms: string[] }> = {
  // CONCACAF — Sede del Mundial 2026
  MEX: { name: 'México',          searchTerms: ['mexico', 'seleccion mexicana', 'tri', 'el tri'] },
  USA: { name: 'Estados Unidos',  searchTerms: ['united states', 'usa', 'usmnt', 'estados unidos'] },
  CAN: { name: 'Canadá',          searchTerms: ['canada'] },
  CRC: { name: 'Costa Rica',      searchTerms: ['costa rica', 'ticos'] },
  PAN: { name: 'Panamá',          searchTerms: ['panama'] },
  HON: { name: 'Honduras',        searchTerms: ['honduras', 'catrachos', 'bicolor'] },
  JAM: { name: 'Jamaica',         searchTerms: ['jamaica', 'reggae boyz'] },
  SLV: { name: 'El Salvador',     searchTerms: ['el salvador', 'cuscatlecos'] },
  GUA: { name: 'Guatemala',       searchTerms: ['guatemala'] },
  HAI: { name: 'Haití',           searchTerms: ['haiti', 'grenadiers'] },
  CUB: { name: 'Cuba',            searchTerms: ['cuba'] },
  TRI: { name: 'Trinidad y Tobago', searchTerms: ['trinidad', 'tobago', 'soca warriors'] },
  // América del Sur
  ARG: { name: 'Argentina',       searchTerms: ['argentina', 'albiceleste'] },
  BRA: { name: 'Brasil',          searchTerms: ['brazil', 'brasil', 'canarinha', 'verde amarela'] },
  COL: { name: 'Colombia',        searchTerms: ['colombia', 'cafeteros'] },
  URU: { name: 'Uruguay',         searchTerms: ['uruguay', 'charruas', 'celeste'] },
  CHI: { name: 'Chile',           searchTerms: ['chile', 'roja'] },
  PER: { name: 'Perú',            searchTerms: ['peru'] },
  ECU: { name: 'Ecuador',         searchTerms: ['ecuador'] },
  PAR: { name: 'Paraguay',        searchTerms: ['paraguay', 'albirroja'] },
  BOL: { name: 'Bolivia',         searchTerms: ['bolivia', 'verde'] },
  VEN: { name: 'Venezuela',       searchTerms: ['venezuela', 'vinotinto'] },
  // Europa
  ESP: { name: 'España',          searchTerms: ['spain', 'espana', 'furia roja', 'la roja'] },
  FRA: { name: 'Francia',         searchTerms: ['france', 'les bleus'] },
  GER: { name: 'Alemania',        searchTerms: ['germany', 'alemania', 'deutschland', 'mannschaft'] },
  ENG: { name: 'Inglaterra',      searchTerms: ['england', 'three lions'] },
  POR: { name: 'Portugal',        searchTerms: ['portugal', 'selecao'] },
  NED: { name: 'Países Bajos',    searchTerms: ['netherlands', 'holland', 'holanda', 'oranje'] },
  BEL: { name: 'Bélgica',         searchTerms: ['belgium', 'belgica', 'red devils'] },
  ITA: { name: 'Italia',          searchTerms: ['italy', 'italia', 'azzurri'] },
  SUI: { name: 'Suiza',           searchTerms: ['switzerland', 'suiza', 'suisse'] },
  CRO: { name: 'Croacia',         searchTerms: ['croatia', 'croacia', 'vatreni'] },
  SRB: { name: 'Serbia',          searchTerms: ['serbia'] },
  DEN: { name: 'Dinamarca',       searchTerms: ['denmark', 'dinamarca'] },
  AUT: { name: 'Austria',         searchTerms: ['austria'] },
  SCO: { name: 'Escocia',         searchTerms: ['scotland', 'escocia'] },
  POL: { name: 'Polonia',         searchTerms: ['poland', 'polonia'] },
  UKR: { name: 'Ucrania',         searchTerms: ['ukraine', 'ucrania'] },
  TUR: { name: 'Turquía',         searchTerms: ['turkey', 'turquia'] },
  SWE: { name: 'Suecia',          searchTerms: ['sweden', 'suecia'] },
  NOR: { name: 'Noruega',         searchTerms: ['norway', 'noruega'] },
  GRE: { name: 'Grecia',          searchTerms: ['greece', 'grecia'] },
  // África
  MAR: { name: 'Marruecos',       searchTerms: ['morocco', 'marruecos', 'atlas lions'] },
  SEN: { name: 'Senegal',         searchTerms: ['senegal', 'lions of teranga'] },
  NGA: { name: 'Nigeria',         searchTerms: ['nigeria', 'super eagles'] },
  GHA: { name: 'Ghana',           searchTerms: ['ghana', 'black stars'] },
  CMR: { name: 'Camerún',         searchTerms: ['cameroon', 'camerun', 'lions indomables'] },
  CIV: { name: 'Costa de Marfil', searchTerms: ['ivory coast', 'cote divoire', 'costa marfil'] },
  EGY: { name: 'Egipto',          searchTerms: ['egypt', 'egipto', 'pharaohs'] },
  // Asia
  JPN: { name: 'Japón',           searchTerms: ['japan', 'japon', 'samurai blue'] },
  KOR: { name: 'Corea del Sur',   searchTerms: ['south korea', 'corea', 'taeguk warriors'] },
  SAU: { name: 'Arabia Saudita',  searchTerms: ['saudi arabia', 'arabia saudita', 'saudi', 'arabia'] },
  IRN: { name: 'Irán',            searchTerms: ['iran', 'team melli'] },
  AUS: { name: 'Australia',       searchTerms: ['australia', 'socceroos'] },
  QAT: { name: 'Catar',           searchTerms: ['qatar', 'catar'] },
};

/** In-memory cache so the API is only called once per session */
let _nationalTeamsCache: SearchableTeam[] | null = null;

/**
 * Loads national teams from competitions we already have in SportMonks.
 * Uses CONCACAF Nations League + Amistosos Internacionales as data sources.
 * Results are cached in memory for the app session.
 * When new competitions (e.g., FIFA World Cup) are added to the app config,
 * their teams appear automatically — no code changes needed.
 */
export async function getSearchableNationalTeams(): Promise<SearchableTeam[]> {
  if (_nationalTeamsCache) return _nationalTeamsCache;

  // Competitions where national teams participate (use seasonId from our config)
  const NATIONAL_SOURCES: { seasonId: number; leagueName: string }[] = [
    { seasonId: 27491, leagueName: 'CONCACAF Nations League' },  // leagueId: 1741
    { seasonId: 26758, leagueName: 'Amistosos Internacionales' }, // leagueId: 1082
  ];

  const seen = new Set<number>();
  const teams: SearchableTeam[] = [];

  await Promise.allSettled(
    NATIONAL_SOURCES.map(async ({ seasonId }) => {
      try {
        const smTeams = await fetchTeamsBySeasonId(seasonId);
        for (const t of smTeams) {
          if (seen.has(t.id) || !t.short_code) continue;
          seen.add(t.id);
          const code = t.short_code.toUpperCase();
          const display = NATIONAL_TEAM_DISPLAY[code];
          teams.push({
            id: t.id,
            name: display?.name ?? t.name,
            shortName: code,
            logo: t.image_path || '',
            leagueName: 'Selección Nacional',
            leagueId: 0,
            searchTerms: display?.searchTerms,
          });
        }
      } catch {
        // Silently skip unavailable sources
      }
    })
  );

  _nationalTeamsCache = teams;
  return teams;
}
