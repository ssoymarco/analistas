/**
 * football/mapping.ts
 *
 * API-Sports → Firestore document mappers (see shared/football/model.ts).
 * Pure functions: no I/O, no clock reads except through the `nowSec` argument,
 * so they are unit-testable against recorded API responses.
 *
 * App conventions this file preserves (the UI depends on them):
 *   - own goals: `event.team` is the side of the player who put it into his own
 *     net (the CONCEDING side) — the UI flips it to award the goal. API-Sports
 *     reports the credited team instead, so we flip on the way in.
 *   - substitutions: `player` = player coming ON, `relatedPlayer` = going OFF.
 *     API-Sports reports `player` = going off, `assist` = coming on.
 *   - positions: Spanish labels + POR/DEF/MED/DEL short codes.
 *   - statistics: same Spanish categories/labels the app showed before.
 */

import type {
  FbEvent, FbEventType, FbLineup, FbLineupPlayer, FbLiveClock, FbMatchDetailDoc,
  FbMatchDoc, FbMatchStatus, FbPlayerRating, FbPressure, FbStatCategory, FbStatRow,
  FbStandingsDoc, FbTeamRef, FbTopPlayer,
} from '../shared/football/model';
import {
  COPYRIGHT_SENSITIVE_LEAGUE_IDS, getFootballLeague, getLeaguePopularity,
} from '../shared/football/leagues';
import type {
  AfEvent, AfFixtureCore, AfFixtureFull, AfLineup, AfPlayerMatchStats,
  AfStandingsResponse, AfTeamStatistics, AfTopPlayerEntry,
} from './apisports-types';
import { teamLabel } from './names';

// ── Status ───────────────────────────────────────────────────────────────────

const LIVE_SHORT = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE']);
const FINISHED_SHORT = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
const HALTED_SHORT = new Set(['SUSP', 'INT', 'ABD']);

export function mapStatus(short: string): FbMatchStatus {
  if (LIVE_SHORT.has(short)) return 'live';
  if (FINISHED_SHORT.has(short)) return 'finished';
  if (HALTED_SHORT.has(short)) return 'interrupted';
  return 'scheduled'; // TBD, NS, PST, CANC
}

export function isLiveShort(short: string): boolean {
  return LIVE_SHORT.has(short);
}

export function isFinishedShort(short: string): boolean {
  return FINISHED_SHORT.has(short);
}

/** Ball-in-play statuses (used to tell a genuine halt from a paused break). */
export function isPlayingShort(short: string): boolean {
  return short === '1H' || short === '2H' || short === 'ET' || short === 'P' || short === 'LIVE';
}

function stateLabelFor(short: string): string | null {
  switch (short) {
    case '1H': return '1T';
    case 'HT': return 'HT';
    case '2H': return '2T';
    case 'ET': return 'ET';
    case 'BT': return 'ET';
    case 'P':  return 'PEN';
    default:   return null;
  }
}

// ── Small helpers ────────────────────────────────────────────────────────────

function stripAccents(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

const SHORT_SKIP = new Set(['FC', 'CF', 'AFC', 'SC', 'CD', 'CA', 'AC', 'AS', 'SS', 'US', 'FK', 'SK', 'CLUB', 'DE', 'THE']);

/** 3-letter code from a team name ("Club America" → "AME", "Real Madrid" → "RMA"). */
export function deriveShortName(name: string): string {
  const words = stripAccents(name).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const meaningful = words.filter(w => !SHORT_SKIP.has(w));
  const w = meaningful.length ? meaningful : words;
  if (w.length === 0) return '???';
  if (w.length === 1) return w[0].slice(0, 3);
  // "Real Madrid" → R + MA, "Manchester United" → M + UN, "Inter Miami" → I + MI
  return (w[0][0] + w[1].slice(0, 2)).slice(0, 3);
}

function teamRef(t: { id: number | null; name: string; logo: string | null }, code?: string | null): FbTeamRef {
  // The provider occasionally omits a team's id and crest (standings rows):
  // an empty id means "unknown team", never the string "null".
  return { id: t.id ? String(t.id) : '', name: t.name, shortName: code || deriveShortName(t.name), logo: t.logo ?? '' };
}

function isoUtc(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace('%', ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// ── Cards (count-based diffing uses these) ───────────────────────────────────

export function isShootoutEvent(e: AfEvent): boolean {
  return /shootout/i.test(e.comments ?? '');
}

export function isRedCardEvent(e: AfEvent): boolean {
  return e.type === 'Card' && /red|second yellow/i.test(e.detail);
}

export function isYellowCardEvent(e: AfEvent): boolean {
  return e.type === 'Card' && /yellow/i.test(e.detail) && !/second/i.test(e.detail);
}

export function isMissedPenaltyEvent(e: AfEvent): boolean {
  return e.type === 'Goal' && /missed penalty/i.test(e.detail) && !isShootoutEvent(e);
}

export function isScoredGoalEvent(e: AfEvent): boolean {
  return e.type === 'Goal' && !/missed/i.test(e.detail) && !isShootoutEvent(e);
}

/** VAR took a goal off the board. */
export function isGoalRuledOutEvent(e: AfEvent): boolean {
  return e.type === 'Var' && /goal (cancelled|disallowed)/i.test(e.detail);
}

const eventOrder = (e: AfEvent) => (e.time.elapsed ?? 0) * 100 + (e.time.extra ?? 0);
const eventMinute = (e: AfEvent) =>
  (e.time.elapsed != null ? `${e.time.elapsed}${e.time.extra ? `+${e.time.extra}` : ''}' ` : '');

/** Longest line the Live Activity shows whole (one line of small type). */
const EVENT_LINE_MAX = 46;

/**
 * The latest event that changes how the match reads — goal, red card, missed
 * penalty, goal ruled out — as one short line in Spanish. When a team is a
 * player down and the line is about something else, it says so at the end
 * ("· 🟥 Monterrey"). Null when nothing of the kind has happened.
 */
export function lastEventLine(f: { teams: AfFixtureCore['teams']; events?: AfEvent[] }): string | null {
  const events = (f.events ?? []).filter(e => !isShootoutEvent(e));
  const key = events
    .filter(e => isScoredGoalEvent(e) || isMissedPenaltyEvent(e) || isRedCardEvent(e) || isGoalRuledOutEvent(e))
    .map((e, i) => ({ e, i }))
    .sort((a, b) => eventOrder(a.e) - eventOrder(b.e) || a.i - b.i)
    .map(x => x.e);
  const last = key[key.length - 1];
  if (!last) return null;

  const home = teamLabel(f.teams.home);
  const away = teamLabel(f.teams.away);
  const team = last.team?.id === f.teams.home.id ? home : away;
  const who = (last.player?.name ?? '').trim();
  const at = eventMinute(last);

  let line: string;
  if (isRedCardEvent(last)) {
    line = `🟥 ${at}${who ? `${who} (${team})` : team}`;
  } else if (isGoalRuledOutEvent(last)) {
    line = `🚫 ${at}Gol anulado (${team})`;
  } else if (isMissedPenaltyEvent(last)) {
    line = `❌ ${at}Penal fallado${who ? ` · ${who}` : ''} (${team})`;
  } else if (/own goal/i.test(last.detail)) {
    // The provider is not consistent about which side an own goal is filed
    // under, so the line names the player only.
    line = `⚽ ${at}Autogol${who ? ` de ${who}` : ''}`;
  } else {
    const pen = /penalty/i.test(last.detail) ? ', de penal' : '';
    line = `⚽ ${at}${who ? `${who}${pen} (${team})` : `Gol de ${team}`}`;
  }

  // Who is a player down, unless the line is that red card itself.
  if (!isRedCardEvent(last)) {
    const down = [
      countBy(events, f.teams.home.id, isRedCardEvent) > 0 ? home : '',
      countBy(events, f.teams.away.id, isRedCardEvent) > 0 ? away : '',
    ].filter(Boolean);
    const suffix = down.length ? ` · 🟥 ${down.join(', ')}` : '';
    if (suffix && line.length + suffix.length <= EVENT_LINE_MAX) line += suffix;
  }
  return line;
}

/** "Henry Martín" → "H. Martín"; one-word and already-short names stay. */
function shortPlayer(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2 || /^.\.$/.test(parts[0])) return parts.join(' ');
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

/** Longest per-side line the Live Activity fits in two short rows. */
const SIDE_LINE_MAX = 44;

/**
 * Each side's key events in one line for the Live Activity: scorers with their
 * minutes ("⚽ H. Martín 52', 78'"), then players sent off ("🟥 R. Chávez 11'").
 * Own goals go to the side they count for — the provider is not consistent
 * about which team it files them under, so the reading that adds up to the
 * real score is the one used.
 */
export function sideEventLines(
  f: { teams: AfFixtureCore['teams']; goals?: AfFixtureCore['goals']; events?: AfEvent[] },
): { homeEvents: string | null; awayEvents: string | null } {
  const events = (f.events ?? [])
    .filter(e => !isShootoutEvent(e))
    .map((e, i) => ({ e, i }))
    .sort((a, b) => eventOrder(a.e) - eventOrder(b.e) || a.i - b.i)
    .map(x => x.e);
  const homeId = f.teams.home.id;
  const isOwn = (e: AfEvent) => /own goal/i.test(e.detail);
  const goals = events.filter(isScoredGoalEvent);
  // Own goals filed under the team that benefits (true) or under the player's team (false)?
  const homeIfBenefits = goals.filter(e => e.team?.id === homeId).length;
  const homeIfPlayers = goals.filter(e => (e.team?.id === homeId) !== isOwn(e)).length;
  const ownFiledUnderBenefit = f.goals?.home == null || homeIfBenefits === f.goals.home || homeIfPlayers !== f.goals.home;
  const goalIsHome = (e: AfEvent) => (isOwn(e) && !ownFiledUnderBenefit ? e.team?.id !== homeId : e.team?.id === homeId);

  const lineFor = (home: boolean): string | null => {
    const scorers = new Map<string, string[]>();
    for (const e of goals) {
      if (goalIsHome(e) !== home) continue;
      const tag = isOwn(e) ? ' (ag)' : /penalty/i.test(e.detail) ? ' (p)' : '';
      const who = `${shortPlayer(e.player?.name) || 'Gol'}${isOwn(e) ? ' (ag)' : ''}`;
      const at = `${eventMinute(e).trim()}${tag === ' (p)' ? ' (p)' : ''}`;
      scorers.set(who, [...(scorers.get(who) ?? []), at]);
    }
    const parts: string[] = [];
    if (scorers.size) parts.push(`⚽ ${[...scorers].map(([who, at]) => `${who} ${at.join(', ')}`).join(' · ')}`);
    const reds = events.filter(e => isRedCardEvent(e) && (e.team?.id === homeId) === home);
    if (reds.length) parts.push(`🟥 ${reds.map(e => `${shortPlayer(e.player?.name)} ${eventMinute(e).trim()}`.trim()).join(' · ')}`);
    if (!parts.length) return null;
    const line = parts.join('\n');
    return line.length > SIDE_LINE_MAX * 2 ? `${line.slice(0, SIDE_LINE_MAX * 2 - 1)}…` : line;
  };
  return { homeEvents: lineFor(true), awayEvents: lineFor(false) };
}

/** [home possession %, shots on goal home, away, corners home, away] from a fixture with statistics; null without them. */
export function compactLiveStats(f: AfFixtureFull): number[] | null {
  const stats = f.statistics ?? [];
  const of = (teamId: number, type: string): number | null => {
    const row = stats.find(s => s.team?.id === teamId)?.statistics.find(x => x.type === type);
    if (!row || row.value == null) return null;
    const n = typeof row.value === 'number' ? row.value : parseFloat(String(row.value).replace('%', ''));
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  const h = f.teams.home.id;
  const a = f.teams.away.id;
  const poss = of(h, 'Ball Possession');
  const vals = [poss, of(h, 'Shots on Goal'), of(a, 'Shots on Goal'), of(h, 'Corner Kicks'), of(a, 'Corner Kicks')];
  if (poss == null || poss <= 0 || poss >= 100) return null;   // no real possession yet → nothing worth showing
  return vals.map(v => v ?? 0);
}

export function countBy(events: AfEvent[] | undefined, teamId: number, pred: (e: AfEvent) => boolean): number {
  if (!events) return 0;
  let n = 0;
  for (const e of events) if (e.team?.id === teamId && pred(e)) n++;
  return n;
}

// ── Live clock ───────────────────────────────────────────────────────────────

/**
 * Anchor for client-side minute extrapolation. Uses the API's period start
 * timestamps when present; for extra time (no timestamps) derives the anchor
 * from `elapsed` but keeps the previous anchor while still in the same period
 * so the client clock doesn't jitter between polls.
 */
export function liveClockFor(
  f: AfFixtureCore,
  nowSec: number,
  prev?: FbLiveClock | null,
): FbLiveClock | null {
  const short = f.fixture.status.short;
  const elapsed = f.fixture.status.elapsed ?? 0;
  const extra = f.fixture.status.extra ?? 0;
  // The live feed usually leaves `periods` null while the match is running,
  // so most anchors are derived from the elapsed minute.
  const p = f.fixture.periods ?? { first: null, second: null };
  let offset: number;
  let periodEnd: number;
  let started: number | null = null;
  if (short === '1H') { offset = 0; periodEnd = 45; started = p.first; }
  else if (short === '2H') { offset = 45; periodEnd = 90; started = p.second; }
  else if (short === 'ET') {
    offset = elapsed >= 106 ? 105 : 90;
    periodEnd = offset + 15;
  } else return null;

  if (started) return { periodStartedAt: started, periodMinuteOffset: offset };

  const estimate = nowSec - Math.max(0, elapsed + extra - offset) * 60;
  if (prev && prev.periodMinuteOffset === offset) {
    // Keep the existing anchor (stable client clock) unless it drifted by more
    // than ~1.5 min. Never re-anchor during stoppage time without `extra`:
    // elapsed freezes at the period end there and would drag the clock back.
    const inStoppageWithoutExtra = elapsed >= periodEnd && !extra;
    if (inStoppageWithoutExtra || Math.abs(prev.periodStartedAt - estimate) <= 90) return prev;
  }
  return { periodStartedAt: estimate, periodMinuteOffset: offset };
}

// ── Match row ────────────────────────────────────────────────────────────────

export interface MapMatchOptions {
  nowSec: number;
  prevClock?: FbLiveClock | null;
}

/**
 * Map a fixture to its `fb_matches` row. When the fixture carries `events`
 * (live feed, detail feed) red cards are counted from them; otherwise
 * `homeRedCards`/`awayRedCards` are 0 and the writer must NOT overwrite the
 * stored counts (see `omitRedCardsWhenUnknown`).
 */
export function mapFixtureToMatch(f: AfFixtureCore & { events?: AfEvent[] }, opts: MapMatchOptions): FbMatchDoc {
  const { fixture, league, teams, goals, score } = f;
  const short = fixture.status.short;
  const status = mapStatus(short);
  const curated = getFootballLeague(league.id);
  const sensitive = COPYRIGHT_SENSITIVE_LEAGUE_IDS.has(league.id);
  const homeId = teams.home.id;
  const awayId = teams.away.id;

  const winner =
    teams.home.winner === true ? 'home' :
    teams.away.winner === true ? 'away' : null;

  const elapsed = fixture.status.elapsed;
  const extra = fixture.status.extra ?? null;

  return {
    id: String(fixture.id),
    sport: 'football',
    leagueId: String(league.id),
    league: curated?.name ?? league.name,
    leagueCountry: league.country,
    leagueLogo: sensitive ? '' : league.logo,
    leagueFlag: league.flag ?? null,
    popularity: getLeaguePopularity(league.id, undefined, { name: league.name, country: league.country }),
    season: league.season,
    round: league.round ?? null,

    homeTeam: teamRef(teams.home),
    awayTeam: teamRef(teams.away),
    homeScore: goals.home ?? 0,
    awayScore: goals.away ?? 0,
    homeScoreHT: score.halftime.home,
    awayScoreHT: score.halftime.away,
    homePenScore: score.penalty.home,
    awayPenScore: score.penalty.away,
    homeRedCards: countBy(f.events, homeId, isRedCardEvent),
    awayRedCards: countBy(f.events, awayId, isRedCardEvent),
    lastEvent: lastEventLine(f),
    ...sideEventLines(f),
    homeYellowCards: countBy(f.events, homeId, isYellowCardEvent),
    awayYellowCards: countBy(f.events, awayId, isYellowCardEvent),

    status,
    statusShort: short,
    stateLabel: stateLabelFor(short),
    minute: status === 'live' || status === 'interrupted' ? (elapsed ?? null) : null,
    extraMinute: status === 'live' ? extra : null,
    liveClock: status === 'live' ? liveClockFor(f, opts.nowSec, opts.prevClock) : null,

    timestamp: fixture.timestamp,
    startingAtUtc: isoUtc(fixture.timestamp),
    date: isoUtc(fixture.timestamp).slice(0, 10),

    venueId: fixture.venue?.id ?? null,
    venueName: fixture.venue?.name ?? null,
    venueCity: fixture.venue?.city ?? null,
    referee: fixture.referee ?? null,
    winner,
  };
}

/** Strip red-card counts from a write when the source had no events. */
export function omitRedCardsWhenUnknown(doc: FbMatchDoc, hadEvents: boolean): Partial<FbMatchDoc> {
  if (hadEvents) return doc;
  const {
    homeRedCards: _h, awayRedCards: _a, lastEvent: _e, homeEvents: _he, awayEvents: _ae,
    homeYellowCards: _hy, awayYellowCards: _ay, ...rest
  } = doc;
  return rest;
}

/**
 * Fields that change what a user sees in a list row. Used to skip Firestore
 * writes when nothing visible changed (writes are the dominant Firestore cost).
 */
export function matchFingerprint(d: Partial<FbMatchDoc>): string {
  return [
    d.statusShort, d.homeScore, d.awayScore, d.homeScoreHT, d.awayScoreHT,
    d.homePenScore, d.awayPenScore, d.minute, d.extraMinute, d.timestamp,
    d.homeTeam?.id, d.awayTeam?.id, d.homeTeam?.name, d.awayTeam?.name,
    d.homeRedCards, d.awayRedCards, d.lastEvent, d.homeEvents, d.awayEvents,
    d.homeYellowCards, d.awayYellowCards, d.liveStats?.join(','),
    d.venueName, d.referee, d.round, d.league,
    d.liveClock?.periodStartedAt, d.liveClock?.periodMinuteOffset,
  ].map(v => (v === undefined ? '~' : String(v))).join('|');
}

// ── Events ───────────────────────────────────────────────────────────────────

function slug(s: string | null | undefined): string {
  return stripAccents(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'x';
}

function eventType(e: AfEvent, shootout: boolean): FbEventType | null {
  const d = e.detail ?? '';
  switch (e.type) {
    case 'Goal':
      if (/own goal/i.test(d)) return 'own-goal';
      if (/missed penalty/i.test(d)) return shootout ? 'shootout-miss' : 'penalty-miss';
      if (/penalty/i.test(d)) return shootout ? 'shootout-goal' : 'penalty-goal';
      return shootout ? 'shootout-goal' : 'goal';
    case 'Card':
      if (/second yellow/i.test(d)) return 'second-yellow';
      if (/red/i.test(d)) return 'red';
      if (/yellow/i.test(d)) return 'yellow';
      return null;
    case 'subst':
      return 'sub';
    case 'Var':
      return 'var';
    default:
      return null;
  }
}

/**
 * Map API-Sports events to the app's timeline events.
 * @param starterIds player ids in each starting XI (when lineups are known),
 *   used to fix substitution direction if API-Sports ever reports it reversed.
 */
export function mapEvents(f: AfFixtureFull, starterIds?: Set<number>): FbEvent[] {
  const homeId = f.teams.home.id;
  const out: FbEvent[] = [];
  const seen = new Map<string, number>();
  let shootoutOrder = 0;
  let penHome = 0;
  let penAway = 0;

  for (const e of f.events ?? []) {
    const shootout = isShootoutEvent(e);
    const type = eventType(e, shootout);
    if (!type) continue;
    let side: 'home' | 'away' = e.team?.id === homeId ? 'home' : 'away';
    if (type === 'own-goal') side = side === 'home' ? 'away' : 'home';

    let player = e.player?.name ?? '';
    let playerId = e.player?.id ?? undefined;
    let related = e.assist?.name ?? undefined;
    let relatedId = e.assist?.id ?? undefined;

    if (type === 'sub') {
      // API-Sports: player = OFF, assist = ON. App: player = ON, related = OFF.
      let on = { name: e.assist?.name ?? '', id: e.assist?.id ?? undefined };
      let off = { name: e.player?.name ?? '', id: e.player?.id ?? undefined };
      if (starterIds && on.id && off.id && starterIds.has(on.id) && !starterIds.has(off.id)) {
        [on, off] = [off, on]; // reported reversed — trust the lineup
      }
      player = on.name; playerId = on.id;
      related = off.name || undefined; relatedId = off.id;
    }

    const minute = e.time?.elapsed ?? 0;
    const added = e.time?.extra ?? undefined;
    const base = `${type}-${side}-${minute}-${added ?? 0}-${playerId ?? slug(player)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);

    const ev: FbEvent = {
      id: n === 1 ? base : `${base}-${n}`,
      minute,
      type,
      team: side,
      player,
    };
    if (added) ev.addedTime = added;
    if (playerId) ev.playerId = playerId;
    if (related) ev.relatedPlayer = related;
    if (relatedId) ev.relatedPlayerId = relatedId;
    const desc = type === 'var' ? e.detail : (e.comments ?? undefined);
    if (desc) ev.description = desc;

    if (type === 'shootout-goal' || type === 'shootout-miss') {
      shootoutOrder++;
      if (type === 'shootout-goal') { if (side === 'home') penHome++; else penAway++; }
      ev.shootoutOrder = shootoutOrder;
      ev.shootoutResult = `${penHome}-${penAway}`;
    }
    out.push(ev);
  }
  return out;
}

// ── Statistics ───────────────────────────────────────────────────────────────

/** API-Sports stat type → [Spanish label, kind]. */
const STAT_LABELS: Record<string, [string, FbStatRow['type']]> = {
  'Ball Possession':  ['Posesión', 'percentage'],
  'expected_goals':   ['Goles esperados (xG)', 'decimal'],
  'Total Shots':      ['Total remates', 'number'],
  'Shots on Goal':    ['Remates al arco', 'number'],
  'Shots off Goal':   ['Remates fuera', 'number'],
  'Blocked Shots':    ['Remates bloqueados', 'number'],
  'Shots insidebox':  ['Remates dentro del área', 'number'],
  'Shots outsidebox': ['Remates fuera del área', 'number'],
  'Corner Kicks':     ['Saques de esquina', 'number'],
  'Offsides':         ['Fueras de juego', 'number'],
  'Fouls':            ['Faltas', 'number'],
  'Yellow Cards':     ['Tarjetas amarillas', 'number'],
  'Red Cards':        ['Tarjetas rojas', 'number'],
  'Goalkeeper Saves': ['Salvadas de portero', 'number'],
  'Total passes':     ['Pases totales', 'number'],
  'Passes accurate':  ['Pases precisos', 'number'],
  'Passes %':         ['Precisión de pases', 'percentage'],
  'Free Kicks':       ['Tiros libres', 'number'],
  'goals_prevented':  ['Goles evitados', 'decimal'],
};

const STAT_CATEGORIES: Array<{ name: string; types: string[] }> = [
  { name: 'Estadísticas importantes', types: ['Ball Possession', 'expected_goals', 'Total Shots', 'Shots on Goal', 'Corner Kicks', 'Offsides', 'Red Cards'] },
  { name: 'Remates', types: ['expected_goals', 'Total Shots', 'Shots on Goal', 'Shots off Goal', 'Blocked Shots', 'Shots insidebox', 'Shots outsidebox'] },
  { name: 'Pases', types: ['Total passes', 'Passes accurate', 'Passes %'] },
  { name: 'Creación', types: ['Free Kicks', 'Corner Kicks'] },
  { name: 'Defensa', types: ['Goalkeeper Saves', 'goals_prevented'] },
  { name: 'Disciplina', types: ['Red Cards', 'Fouls', 'Yellow Cards'] },
];

/** Raw per-side stat values keyed by API-Sports type (null when absent). */
export function statValues(stats: AfTeamStatistics[] | undefined, homeId: number): Map<string, { home: number; away: number }> {
  const m = new Map<string, { home: number; away: number }>();
  for (const block of stats ?? []) {
    const isHome = block.team?.id === homeId;
    for (const s of block.statistics ?? []) {
      if (s.value === null || s.value === undefined) continue;
      const cur = m.get(s.type) ?? { home: 0, away: 0 };
      if (isHome) cur.home = num(s.value); else cur.away = num(s.value);
      m.set(s.type, cur);
    }
  }
  return m;
}

export function mapStatistics(f: AfFixtureFull): FbStatCategory[] {
  const vals = statValues(f.statistics, f.teams.home.id);
  if (vals.size === 0) return [];
  const out: FbStatCategory[] = [];
  for (const cat of STAT_CATEGORIES) {
    const stats: FbStatRow[] = [];
    for (const t of cat.types) {
      const v = vals.get(t);
      const meta = STAT_LABELS[t];
      if (!v || !meta) continue;
      stats.push({ label: meta[0], home: v.home, away: v.away, type: meta[1] });
    }
    if (stats.length) out.push({ category: cat.name, stats });
  }
  return out;
}

// ── Lineups & ratings ────────────────────────────────────────────────────────

const POSITION_NAME: Record<string, string> = { G: 'Portero', D: 'Defensa', M: 'Centrocampista', F: 'Delantero' };
const POSITION_SHORT: Record<string, string> = { G: 'POR', D: 'DEF', M: 'MED', F: 'DEL' };

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

function playerStatsIndex(players: AfPlayerMatchStats[] | undefined): Map<number, AfPlayerMatchStats['statistics'][number]> {
  const m = new Map<number, AfPlayerMatchStats['statistics'][number]>();
  for (const p of players ?? []) {
    const s = p.statistics?.[0];
    if (s) m.set(p.player.id, s);
  }
  return m;
}

function mapLineup(
  l: AfLineup,
  events: FbEvent[],
  side: 'home' | 'away',
  stats: Map<number, AfPlayerMatchStats['statistics'][number]>,
  photos: Map<number, string>,
): FbLineup {
  // Formation rows from grid "row:col" (row 1 = GK).
  const rows = new Map<number, Array<{ id: number; col: number }>>();
  for (const s of l.startXI ?? []) {
    const [r, c] = (s.player.grid ?? '').split(':').map(x => parseInt(x, 10));
    if (!Number.isFinite(r)) continue;
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r)!.push({ id: s.player.id, col: Number.isFinite(c) ? c : 1 });
  }
  const sortedRows = [...rows.entries()].sort(([a], [b]) => a - b);
  const maxRow = sortedRows.length ? sortedRows[sortedRows.length - 1][0] : 1;
  const pos = new Map<number, { row: number; col: number; size: number; x: number; y: number }>();
  for (const [row, list] of sortedRows) {
    list.sort((a, b) => a.col - b.col);
    list.forEach((p, i) => pos.set(p.id, {
      row, col: i + 1, size: list.length,
      x: ((i + 1) / (list.length + 1)) * 100,
      y: (row / maxRow) * 100,
    }));
  }

  // Cross-reference timeline events.
  const flags = new Map<number, { y?: boolean; r?: boolean; off?: number; goals?: number; assists?: number }>();
  const flag = (id: number | undefined) => {
    if (!id) return null;
    const f = flags.get(id) ?? {};
    flags.set(id, f);
    return f;
  };
  for (const e of events) {
    if (e.team !== side && e.type !== 'own-goal') continue;
    if (e.type === 'yellow') { const f = flag(e.playerId); if (f) f.y = true; }
    if (e.type === 'red' || e.type === 'second-yellow') { const f = flag(e.playerId); if (f) f.r = true; }
    if (e.type === 'sub') { const f = flag(e.relatedPlayerId); if (f) f.off = e.minute; }
    if ((e.type === 'goal' || e.type === 'penalty-goal') && e.team === side) {
      const f = flag(e.playerId); if (f) f.goals = (f.goals ?? 0) + 1;
      const a = flag(e.relatedPlayerId); if (a) a.assists = (a.assists ?? 0) + 1;
    }
  }

  const toPlayer = (s: AfLineup['startXI'][number], idx: number, isStarter: boolean): FbLineupPlayer => {
    const p = s.player;
    const code = (p.pos ?? '').toUpperCase();
    const pp = pos.get(p.id);
    const st = stats.get(p.id);
    const fl = flags.get(p.id);
    const out: FbLineupPlayer = {
      id: String(p.id),
      name: p.name,
      shortName: lastName(p.name),
      number: p.number ?? 0,
      position: POSITION_NAME[code] ?? 'Jugador',
      positionShort: POSITION_SHORT[code] ?? 'JUG',
      x: pp?.x ?? 50,
      y: pp?.y ?? (isStarter ? (idx / 11) * 100 : 0),
    };
    if (pp) { out.formationRow = pp.row; out.formationCol = pp.col; out.formationRowSize = pp.size; }
    const rating = st?.games?.rating ? parseFloat(st.games.rating) : NaN;
    if (Number.isFinite(rating) && rating > 0) out.rating = rating;
    if (st?.games?.captain) out.isCaptain = true;
    if (fl?.y) out.yellowCard = true;
    if (fl?.r) out.redCard = true;
    if (fl?.off != null) { out.isSubstituted = true; out.substituteMinute = fl.off; }
    if (fl?.goals) out.goals = fl.goals;
    if (fl?.assists) out.assists = fl.assists;
    const photo = photos.get(p.id);
    if (photo) out.imageUrl = photo;
    return out;
  };

  const lineup: FbLineup = {
    teamId: String(l.team.id),
    formation: l.formation ?? (sortedRows.length > 1 ? sortedRows.slice(1).map(([, r]) => r.length).join('-') : '?'),
    starters: (l.startXI ?? []).map((s, i) => toPlayer(s, i, true)),
    bench: (l.substitutes ?? []).map((s, i) => toPlayer(s, i, false)),
    coach: l.coach?.name ?? '',
  };
  if (l.coach?.id) lineup.coachId = l.coach.id;
  if (l.coach?.photo) lineup.coachImageUrl = l.coach.photo;
  return lineup;
}

function mapRatings(block: { players: AfPlayerMatchStats[] } | undefined): FbPlayerRating[] {
  if (!block) return [];
  const rows: FbPlayerRating[] = [];
  for (const p of block.players ?? []) {
    const s = p.statistics?.[0];
    if (!s) continue;
    const rating = s.games?.rating ? parseFloat(s.games.rating) : NaN;
    const minutes = s.games?.minutes ?? 0;
    if (!Number.isFinite(rating) || rating <= 0 || minutes <= 0) continue;
    const r: FbPlayerRating = {
      playerId: String(p.player.id),
      name: p.player.name,
      number: s.games?.number ?? 0,
      position: POSITION_SHORT[(s.games?.position ?? '').toUpperCase()] ?? 'JUG',
      rating,
      minutes,
      passAccuracy: num(s.passes?.accuracy),
    };
    if (s.goals?.total) r.goals = s.goals.total;
    if (s.goals?.assists) r.assists = s.goals.assists;
    if (s.shots?.total) r.shots = s.shots.total;
    if (s.passes?.key) r.keyPasses = s.passes.key;
    if (s.tackles?.total) r.tackles = s.tackles.total;
    if (s.goals?.saves) r.saves = s.goals.saves;
    if (s.duels?.won) r.duelsWon = s.duels.won;
    rows.push(r);
  }
  rows.sort((a, b) => b.rating - a.rating);
  return rows;
}

// ── Pressure index (ours — API-Sports has none) ──────────────────────────────

/**
 * Dominance share 0-100 per side from live stats. Weights reflect how much
 * each signal indicates territorial/attacking control: shots on target and
 * box shots weigh most, possession and corners less. Returns null when the
 * match has no stats yet.
 */
export function computePressureShare(f: AfFixtureFull): { home: number; away: number } | null {
  const v = statValues(f.statistics, f.teams.home.id);
  if (v.size === 0) return null;
  const W: Array<[string, number]> = [
    ['Shots on Goal', 3.0], ['Shots insidebox', 2.0], ['Total Shots', 1.0],
    ['Corner Kicks', 1.0], ['expected_goals', 6.0], ['Ball Possession', 0.08],
    ['Passes accurate', 0.01],
  ];
  let h = 0, a = 0;
  for (const [k, w] of W) {
    const x = v.get(k);
    if (!x) continue;
    h += x.home * w; a += x.away * w;
  }
  const total = h + a;
  if (total <= 0) return { home: 50, away: 50 };
  const home = Math.round((h / total) * 100);
  return { home, away: 100 - home };
}

export function nextPressure(
  prev: FbPressure | null | undefined,
  f: AfFixtureFull,
): FbPressure | null {
  const share = computePressureShare(f);
  if (!share) return prev ?? null;
  const minute = f.fixture.status.elapsed ?? 0;
  const series = [...(prev?.series ?? [])];
  const last = series[series.length - 1];
  if (!last || last.minute !== minute) series.push({ minute, ...share });
  else series[series.length - 1] = { minute, ...share };
  // Keep it bounded (one point per minute max, ~130 points for 120' + stoppage).
  while (series.length > 140) series.shift();
  return { home: share.home, away: share.away, series };
}

// ── Detail doc ───────────────────────────────────────────────────────────────

export function mapFixtureToDetail(f: AfFixtureFull, prevPressure?: FbPressure | null): FbMatchDetailDoc {
  const homeId = f.teams.home.id;
  const starterIds = new Set<number>();
  for (const l of f.lineups ?? []) for (const s of l.startXI ?? []) starterIds.add(s.player.id);
  const events = mapEvents(f, starterIds.size ? starterIds : undefined);

  const homePlayers = f.players?.find(p => p.team.id === homeId);
  const awayPlayers = f.players?.find(p => p.team.id !== homeId);
  const statsIdx = playerStatsIndex([...(homePlayers?.players ?? []), ...(awayPlayers?.players ?? [])]);
  const photos = new Map<number, string>();
  for (const p of [...(homePlayers?.players ?? []), ...(awayPlayers?.players ?? [])]) {
    if (p.player.photo) photos.set(p.player.id, p.player.photo);
  }

  const homeL = f.lineups?.find(l => l.team.id === homeId);
  const awayL = f.lineups?.find(l => l.team.id !== homeId);

  const live = isLiveShort(f.fixture.status.short);
  return {
    matchId: String(f.fixture.id),
    statusShort: f.fixture.status.short,
    events,
    statistics: mapStatistics(f),
    lineups: {
      home: homeL ? mapLineup(homeL, events, 'home', statsIdx, photos) : null,
      away: awayL ? mapLineup(awayL, events, 'away', statsIdx, photos) : null,
    },
    playerRatings: { home: mapRatings(homePlayers), away: mapRatings(awayPlayers) },
    pressure: live ? nextPressure(prevPressure, f) : (prevPressure ?? (computePressureShare(f) ? nextPressure(null, f) : null)),
  };
}

// ── Standings & top players ──────────────────────────────────────────────────

export function mapStandings(r: AfStandingsResponse): FbStandingsDoc {
  const groups = (r.league.standings ?? []).map(table => ({
    name: table[0]?.group ?? r.league.name,
    rows: table.map(e => ({
      position: e.rank,
      team: teamRef(e.team),
      played: e.all.played,
      won: e.all.win,
      drawn: e.all.draw,
      lost: e.all.lose,
      goalsFor: e.all.goals.for,
      goalsAgainst: e.all.goals.against,
      goalDifference: e.goalsDiff,
      points: e.points,
      form: e.form ?? null,
      description: e.description ?? null,
    })),
  }));
  return { leagueId: String(r.league.id), season: r.league.season, groups };
}

export function mapTopPlayers(list: AfTopPlayerEntry[], metric: 'goals' | 'assists' | 'yellow'): FbTopPlayer[] {
  return list.map((p, i) => {
    const s = p.statistics?.[0];
    const value =
      metric === 'goals' ? (s?.goals?.total ?? 0) :
      metric === 'assists' ? (s?.goals?.assists ?? 0) :
      (s?.cards?.yellow ?? 0);
    return {
      playerId: String(p.player.id),
      name: p.player.name,
      photo: p.player.photo,
      teamId: String(s?.team?.id ?? ''),
      teamName: s?.team?.name ?? '',
      teamLogo: s?.team?.logo ?? '',
      value,
      position: i + 1,
    };
  });
}
