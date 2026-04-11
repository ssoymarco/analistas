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
} from '../data/types';

import {
  fetchFixturesByDate,
  fetchFixtureById,
  fetchLivescores,
  fetchStandings,
  fetchTopScorers,
  fetchH2H,
  fetchTeamById,
  fetchSquad,
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
} from './sportmonks';

import {
  matches as mockMatches,
  leagues as mockLeagues,
  news as mockNews,
  getLeaguesForDate as mockGetLeaguesForDate,
  getMatchesForDate as mockGetMatchesForDate,
} from '../data/mockData';
import type { League as MockLeagueWithMatches } from '../data/mockData';
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
  const leagueConfig = getLeagueConfig(fixture.league_id);
  const dateStr = fixture.starting_at.split(' ')[0]; // "YYYY-MM-DD"

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
    leagueId: String(fixture.league_id),
    date: dateStr,
    isFavorite: false,
    startingAtUtc: fixture.starting_at,
    seasonId: fixture.season_id,
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

  // Standing detail type IDs (common SM mappings)
  const findDetail = (typeId: number) => details.find(d => d.type_id === typeId)?.value ?? 0;
  // SM standing detail type_ids: 129=W, 130=D, 131=L, 179=GP, 187=GF, 188=GA, 189=GD
  const won   = findDetail(129);
  const drawn = findDetail(130);
  const lost  = findDetail(131);
  // Played: prefer explicit GP stat, fallback to W+D+L
  const played = findDetail(179) || (won + drawn + lost);
  const gf = findDetail(187);
  const ga = findDetail(188);
  const gd = findDetail(189) || (gf - ga);

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
 * Fetch all fixtures for a given date.
 * Merges real SportMonks data with mock data so the user always sees
 * both real leagues and the demo leagues side by side.
 */
export async function getFixturesByDate(date: string): Promise<Match[]> {
  // Always start with mock matches for this date
  const mockResults = mockGetMatchesForDate(date);

  try {
    const fixtures = await fetchFixturesByDate(date, LEAGUE_IDS);
    if (fixtures.length === 0) return mockResults;
    const realMatches = fixtures.map(mapFixtureToMatch);
    // Real leagues on top, then mock leagues
    return [...realMatches, ...mockResults];
  } catch (err) {
    console.warn('[sportsApi] getFixturesByDate failed, using mock only:', err);
    return mockResults;
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
  // Always include mock leagues
  const mockLeagueResults = mockGetLeaguesForDate(date);

  try {
    const fixtures = await fetchFixturesByDate(date, LEAGUE_IDS);
    if (fixtures.length === 0) return mockLeagueResults;

    const matches = fixtures.map(mapFixtureToMatch);
    // Group real fixtures by league
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

    // Real leagues first, then mock leagues
    return [...realLeagues, ...mockLeagueResults];
  } catch (err) {
    console.warn('[sportsApi] getLeaguesByDate failed, using mock only:', err);
    return mockLeagueResults;
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
    return mockMatches.filter(m => m.status === 'live');
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

/**
 * Fetch full fixture detail with SM data available on free plan:
 * events, stats, lineups, venue, referee, weather, TV, H2H, pressure.
 * Odds are not included in the main request to keep response size small (~43KB vs 1.8MB).
 */
export async function getFixtureDetail(id: number): Promise<{ match: Match; detail: Partial<MatchDetail> } | null> {
  try {
    const fixture = await fetchFixtureById(id);
    const match = mapFixtureToMatch(fixture);
    const homeTeam = getParticipant(fixture, 'home');
    const awayTeam = getParticipant(fixture, 'away');

    const refereeData = mapReferee(fixture.referees);

    // Fire secondary requests in parallel — only endpoints available on free plan
    const [h2hResults] = await Promise.all([
      // H2H (works on free plan)
      (homeTeam && awayTeam)
        ? fetchH2H(homeTeam.id, awayTeam.id).catch((e) => {
            console.warn('[sportsApi] H2H failed:', e.message);
            return [] as SMFixture[];
          })
        : Promise.resolve([] as SMFixture[]),
    ]);

    // Build detail from fixture data (no extra API calls for unavailable endpoints)
    const detail: Partial<MatchDetail> = {
      matchId: String(fixture.id),
      venue: mapVenue(fixture.venue),
      referee: refereeData.referee,
      assistantReferees: refereeData.assistants.length > 0 ? refereeData.assistants : undefined,
      fourthOfficial: refereeData.fourthOfficial,
      weather: mapWeather(fixture.weatherreport),
      events: mapEvents(fixture.events, fixture),
      statistics: mapStatistics(fixture.statistics, fixture),
      homeLineup: mapLineup(fixture.lineups, homeTeam?.id ?? 0, fixture.events),
      awayLineup: mapLineup(fixture.lineups, awayTeam?.id ?? 0, fixture.events),
      tvStations: mapTVStations(fixture.tvstations),
      resultInfo: fixture.result_info ?? undefined,
      odds: mapOdds(fixture.odds),
      pressureIndex: computePressureIndex(fixture.statistics, homeTeam?.id ?? 0),
      missingPlayers: { home: [], away: [] },
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
    const data = await fetchStandings(seasonId);
    return data.map(mapStandingToLeagueStanding).sort((a, b) => a.position - b.position);
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
 * Get news articles (still mock — SM doesn't provide news on free plan).
 */
export async function getNews(): Promise<NewsArticle[]> {
  return mockNews;
}

/**
 * Match count for date — used by CalendarPicker dots.
 */
export async function getMatchCountForDate(date: string): Promise<number> {
  try {
    const fixtures = await fetchFixturesByDate(date, LEAGUE_IDS);
    return fixtures.length || 0;
  } catch {
    return 0;
  }
}
