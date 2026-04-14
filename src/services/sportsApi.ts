// ── SportMonks → App Type Adapter Layer ──────────────────────────────────────
//
// This file maps raw SportMonks responses to the app's own types.
// Components import ONLY from this file — never from sportmonks.ts directly.
// If the API is down or returns an error, we fall back to mock data.

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
} from './sportmonks';

import type { NewsArticle } from '../data/types';
import { AVAILABLE_LEAGUES, getLeagueConfig, LEAGUE_IDS } from '../config/leagues';

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

function mapStateToStatus(stateId: number): MatchStatus {
  if (LIVE_STATE_IDS.has(stateId)) return 'live';
  if (FINISHED_STATE_IDS.has(stateId)) return 'finished';
  return 'scheduled';
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

// ── Time Display ────────────────────────────────────────────────────────────

function getTimeDisplay(fixture: SMFixture): string {
  const status = mapStateToStatus(fixture.state_id);

  if (status === 'finished') return 'FT';

  if (status === 'live') {
    const state = fixture.state;
    if (state) {
      if (fixture.state_id === SM_STATE_IDS.HALF_TIME) return 'HT';
      // For live, calculate approximate minute from starting_at
      const kickoff = new Date(fixture.starting_at.replace(' ', 'T') + 'Z');
      const now = new Date();
      let elapsed = Math.floor((now.getTime() - kickoff.getTime()) / 60000);
      if (fixture.state_id === SM_STATE_IDS.SECOND_HALF) {
        // Account for 15-min half-time break
        elapsed = Math.max(46, elapsed - 15);
      }
      elapsed = Math.max(1, Math.min(elapsed, 120));
      return `${elapsed}'`;
    }
    return 'EN VIVO';
  }

  // Scheduled — show kick-off time in HH:MM
  try {
    const dt = new Date(fixture.starting_at.replace(' ', 'T') + 'Z');
    return dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return fixture.starting_at.slice(11, 16);
  }
}

function getLiveMinute(fixture: SMFixture): number | undefined {
  if (mapStateToStatus(fixture.state_id) !== 'live') return undefined;
  if (fixture.state_id === SM_STATE_IDS.HALF_TIME) return 45;
  const kickoff = new Date(fixture.starting_at.replace(' ', 'T') + 'Z');
  const now = new Date();
  let elapsed = Math.floor((now.getTime() - kickoff.getTime()) / 60000);
  if (fixture.state_id === SM_STATE_IDS.SECOND_HALF) {
    elapsed = Math.max(46, elapsed - 15);
  }
  return Math.max(1, Math.min(elapsed, 120));
}

// ── Participant Helpers ─────────────────────────────────────────────────────

function getParticipant(fixture: SMFixture, location: 'home' | 'away'): SMParticipant | undefined {
  return fixture.participants?.find(p => p.meta?.location === location);
}

function mapParticipantToTeam(p: SMParticipant | undefined): Team {
  if (!p) return { id: '0', name: 'TBD', shortName: 'TBD', logo: '⚽' };
  return {
    id: String(p.id),
    name: p.name,
    shortName: p.short_code || p.name.slice(0, 3).toUpperCase(),
    logo: p.image_path || '⚽',
  };
}

// ── Fixture → Match Mapper ──────────────────────────────────────────────────

function mapFixtureToMatch(fixture: SMFixture): Match {
  const home = getParticipant(fixture, 'home');
  const away = getParticipant(fixture, 'away');
  const status = mapStateToStatus(fixture.state_id);

  // league_id can be 0/null/missing on some fixtures — fall back to the included league object's id
  const rawLeagueId: number = fixture.league_id || (fixture.league as any)?.id || 0;
  const leagueConfig = getLeagueConfig(rawLeagueId);
  const dateStr = fixture.starting_at.split(' ')[0]; // "YYYY-MM-DD"

  // season_id can be missing — fall back to the league's current season from our config
  const rawSeasonId: number = fixture.season_id || leagueConfig?.currentSeasonId || 0;

  const homeScoreHT = getHalfTimeGoals(fixture.scores, 'home');
  const awayScoreHT = getHalfTimeGoals(fixture.scores, 'away');

  return {
    id: String(fixture.id),
    homeTeam: mapParticipantToTeam(home),
    awayTeam: mapParticipantToTeam(away),
    homeScore: getGoals(fixture.scores, 'home'),
    awayScore: getGoals(fixture.scores, 'away'),
    homeScoreHT,
    awayScoreHT,
    status,
    time: getTimeDisplay(fixture),
    minute: getLiveMinute(fixture),
    stateLabel: mapStateLabel(fixture.state_id),
    league: fixture.league?.name ?? leagueConfig?.name ?? 'Unknown',
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
    default: return 'goal'; // fallback
  }
}

function mapEventTeam(event: SMEvent, fixture: SMFixture): 'home' | 'away' {
  const home = getParticipant(fixture, 'home');
  return event.participant_id === home?.id ? 'home' : 'away';
}

function mapEvents(events: SMEvent[] | undefined, fixture: SMFixture): MatchEvent[] {
  if (!events) return [];
  return events.map(e => ({
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
  [SM_STAT_TYPES.GOAL_ATTEMPTS]:              'Tiros totales',
  [SM_STAT_TYPES.SHOTS_ON_TARGET]:            'Tiros a puerta',
  [SM_STAT_TYPES.SHOTS_BLOCKED]:              'Tiros bloqueados',
  [SM_STAT_TYPES.GOAL_KICKS]:                 'Saques de meta',
  // Creación / Pases
  [SM_STAT_TYPES.ASSISTS]:                    'Asistencias',
  [SM_STAT_TYPES.FREE_KICKS]:                 'Tiros libres',
  [SM_STAT_TYPES.THROWINS]:                   'Saques de banda',
  [SM_STAT_TYPES.SUCCESSFUL_DRIBBLES_PCT]:    'Regates exitosos',
  [SM_STAT_TYPES.BIG_CHANCES_CREATED]:        'Ocasiones claras creadas',
  [SM_STAT_TYPES.BIG_CHANCES_MISSED]:         'Ocasiones claras falladas',
  // xG family
  [SM_STAT_TYPES.EXPECTED_GOALS]:             'xG (Goles esperados)',
  [SM_STAT_TYPES.EXPECTED_GOALS_ON_TARGET]:   'xGoT',
  [SM_STAT_TYPES.NP_EXPECTED_GOALS]:          'npxG',
  // Defensa
  [SM_STAT_TYPES.CORNERS]:                    'Córners',
  [SM_STAT_TYPES.SAVES]:                      'Paradas',
  // Disciplina
  [SM_STAT_TYPES.FOULS]:                      'Faltas',
  [SM_STAT_TYPES.YELLOWCARDS]:                'Tarjetas amarillas',
};

// Which stat IDs are percentages (displayed with % suffix)
const PERCENTAGE_STAT_IDS = new Set<number>([
  SM_STAT_TYPES.BALL_POSSESSION,
  SM_STAT_TYPES.SUCCESSFUL_DRIBBLES_PCT,
]);

// Category groupings — order matters for display
const STAT_CATEGORIES: { name: string; typeIds: number[] }[] = [
  {
    name: 'Ataque',
    typeIds: [
      SM_STAT_TYPES.BALL_POSSESSION,
      SM_STAT_TYPES.GOALS,
      SM_STAT_TYPES.GOAL_ATTEMPTS,
      SM_STAT_TYPES.SHOTS_ON_TARGET,
      SM_STAT_TYPES.SHOTS_BLOCKED,
      SM_STAT_TYPES.GOAL_KICKS,
    ],
  },
  {
    name: 'Creación',
    typeIds: [
      SM_STAT_TYPES.ASSISTS,
      SM_STAT_TYPES.FREE_KICKS,
      SM_STAT_TYPES.THROWINS,
      SM_STAT_TYPES.SUCCESSFUL_DRIBBLES_PCT,
      SM_STAT_TYPES.BIG_CHANCES_CREATED,
      SM_STAT_TYPES.BIG_CHANCES_MISSED,
    ],
  },
  {
    name: 'Goles Esperados (xG)',
    typeIds: [
      SM_STAT_TYPES.EXPECTED_GOALS,
      SM_STAT_TYPES.EXPECTED_GOALS_ON_TARGET,
      SM_STAT_TYPES.NP_EXPECTED_GOALS,
    ],
  },
  {
    name: 'Defensa',
    typeIds: [
      SM_STAT_TYPES.CORNERS,
      SM_STAT_TYPES.SAVES,
    ],
  },
  {
    name: 'Disciplina',
    typeIds: [
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
        const isPct = PERCENTAGE_STAT_IDS.has(id);
        return {
          label: STAT_TYPE_NAMES[id],
          home: vals.home,
          away: vals.away,
          unit: isPct ? '%' : undefined,
          type: isPct ? 'percentage' as const : 'number' as const,
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

function mapVenue(v: SMVenue | undefined): MatchVenue {
  return {
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
 * Fetch all fixtures for a given date from SportMonks.
 */
export async function getFixturesByDate(date: string): Promise<Match[]> {
  try {
    // Don't filter by league IDs — fetch ALL fixtures and filter client-side.
    // With 50+ leagues the filter string is too long and causes API errors.
    const fixtures = await fetchFixturesByDate(date);
    return fixtures.map(mapFixtureToMatch);
  } catch (err) {
    console.warn('[sportsApi] getFixturesByDate failed:', err);
    return [];
  }
}

/**
 * Fetch fixtures grouped by league for a given date.
 * Merges real SportMonks leagues with mock leagues.
 */
export interface LeagueWithMatches extends League {
  matches: Match[];
}

export async function getLeaguesByDate(date: string): Promise<LeagueWithMatches[]> {
  try {
    const fixtures = await fetchFixturesByDate(date);
    if (fixtures.length === 0) return [];

    const matches = fixtures.map(mapFixtureToMatch);
    const realLeagues: LeagueWithMatches[] = [];
    const leagueMap = new Map<string, LeagueWithMatches>();
    for (const m of matches) {
      if (!leagueMap.has(m.leagueId)) {
        const config = getLeagueConfig(Number(m.leagueId));
        const lw: LeagueWithMatches = {
          id: m.leagueId,
          name: m.league,
          country: config?.country ?? '',
          logo: config?.flag ?? '⚽',
          matches: [],
        };
        leagueMap.set(m.leagueId, lw);
        realLeagues.push(lw);
      }
      leagueMap.get(m.leagueId)!.matches.push(m);
    }

    return realLeagues;
  } catch (err) {
    console.warn('[sportsApi] getLeaguesByDate failed:', err);
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
    return fixtures.map(mapFixtureToMatch);
  } catch (err) {
    console.warn('[sportsApi] getLiveFixtures failed:', err);
    return [];
  }
}

// ── Referee Mapper ──────────────────────────────────────────────────────────

function mapReferee(refs: SMFixtureReferee[] | undefined) {
  if (!refs || refs.length === 0) return { referee: { name: '', nationality: '', flag: '' }, assistants: [] as string[], fourthOfficial: undefined as string | undefined };

  const main = refs.find(r => r.type_id === 6);
  const assistants = refs.filter(r => r.type_id === 7 || r.type_id === 8);
  const fourth = refs.find(r => r.type_id === 9);

  return {
    referee: {
      name: main?.referee?.display_name ?? main?.referee?.common_name ?? '',
      nationality: '',
      flag: '👔',
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
 * Fetch full fixture detail with all available SM data:
 * events, stats, lineups, venue, referee, weather, TV, H2H, pressure,
 * injuries, form, predictions, referee stats.
 */
export async function getFixtureDetail(id: number): Promise<{ match: Match; detail: Partial<MatchDetail> } | null> {
  try {
    const fixture = await fetchFixtureById(id);
    const match = mapFixtureToMatch(fixture);
    const homeTeam = getParticipant(fixture, 'home');
    const awayTeam = getParticipant(fixture, 'away');

    const refereeData = mapReferee(fixture.referees);
    const mainRefereeId = fixture.referees?.find(r => r.type_id === 6)?.referee_id;

    // Fire ALL secondary requests in parallel
    const [h2hResults, homeSidelined, awaySidelined, homeFixtures, awayFixtures, refStats, predictions] = await Promise.all([
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
    ]);

    // Filter sidelined to only active (not completed) injuries/suspensions
    const activeHomeSidelined = homeSidelined.filter(s => !s.completed);
    const activeAwaySidelined = awaySidelined.filter(s => !s.completed);

    const detail: Partial<MatchDetail> = {
      matchId: String(fixture.id),
      venue: mapVenue(fixture.venue),
      referee: refereeData.referee,
      assistantReferees: refereeData.assistants.length > 0 ? refereeData.assistants : undefined,
      fourthOfficial: refereeData.fourthOfficial,
      refereeStats: mainRefereeId ? mapRefereeStats(refStats as { statistics?: SMRefereeStats[] }) : undefined,
      weather: mapWeather(fixture.weatherreport),
      events: mapEvents(fixture.events, fixture),
      statistics: mapStatistics(fixture.statistics, fixture),
      homeLineup: mapLineup(fixture.lineups, homeTeam?.id ?? 0, fixture.events),
      awayLineup: mapLineup(fixture.lineups, awayTeam?.id ?? 0, fixture.events),
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
    };

    console.log('[sportsApi] getFixtureDetail OK for', id);
    return { match, detail };
  } catch (err) {
    console.warn('[sportsApi] getFixtureDetail FAILED for id=' + id + ':', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Fetch standings for a season.
 */
export async function getStandings(seasonId: number): Promise<LeagueStanding[]> {
  try {
    console.log('[getStandings] seasonId:', seasonId);
    const rawData = await fetchStandings(seasonId);
    console.log('[getStandings] rawData entries:', rawData.length, 'first:', rawData[0]?.participant_id ?? 'none');

    // Guard: flatten nested arrays (some leagues return [[group1], [group2]])
    const data: SMStandingGroup[] = rawData.length > 0 && Array.isArray(rawData[0])
      ? (rawData as unknown as SMStandingGroup[][]).flat()
      : rawData;

    if (data.length === 0) return [];

    // ── Step 1: Deduplicate by team — keep the latest stage per team ─────────
    // Leagues like the Danish Superliga have multiple stages:
    //   Stage A (regular season, 22 games) → Stage B (playoffs, 26+ games)
    // Each team appears once per stage; we want the most recent one.
    const byTeam = new Map<number, SMStandingGroup>();
    for (const sg of data) {
      if (!sg.participant_id) continue;
      const existing = byTeam.get(sg.participant_id);
      if (!existing || sg.stage_id > existing.stage_id) {
        byTeam.set(sg.participant_id, sg);
      }
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
    return deduplicated.map((sg, idx) => ({
      ...mapStandingToLeagueStanding(sg),
      position: isMultiGroup ? idx + 1 : sg.position,
      groupId: isMultiGroup ? (sg.group_id ?? null) : null,
    }));
  } catch (err) {
    console.warn('[sportsApi] getStandings failed:', err);
    return [];
  }
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
  try {
    const data = await fetchTopScorers(seasonId);
    return data.map(ts => ({
      playerId: ts.player_id,
      playerName: ts.player?.display_name ?? ts.player?.name ?? `Player ${ts.player_id}`,
      playerImage: ts.player?.image_path ?? '',
      goals: ts.total,
      teamId: ts.participant_id,
      position: ts.position,
    }));
  } catch (err) {
    console.warn('[sportsApi] getTopScorers failed:', err);
    return [];
  }
}

/**
 * Fetch H2H between two teams.
 */
export async function getH2HFixtures(teamId1: number, teamId2: number): Promise<H2HResult[]> {
  try {
    const fixtures = await fetchH2H(teamId1, teamId2);
    return fixtures.map(f => ({
      date: f.starting_at.split(' ')[0],
      homeScore: getGoals(f.scores, 'home'),
      awayScore: getGoals(f.scores, 'away'),
      competition: f.league?.name ?? '',
      venue: '',
    }));
  } catch (err) {
    console.warn('[sportsApi] getH2HFixtures failed:', err);
    return [];
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
 */
export async function getMatchCountForDate(date: string): Promise<number> {
  try {
    const fixtures = await fetchFixturesByDate(date);
    return fixtures.length || 0;
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
  seasonId?: number;
}

/** Returns all leagues from config as searchable items */
export function getSearchableLeagues(): SearchableLeague[] {
  return AVAILABLE_LEAGUES.map(l => ({
    id: l.id,
    name: l.name,
    country: l.country,
    flag: l.flag,
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

/** Returns popular players instantly (hardcoded) */
export async function getSearchablePlayers(): Promise<SearchablePlayer[]> {
  return POPULAR_PLAYERS;
}
