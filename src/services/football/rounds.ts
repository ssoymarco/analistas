/**
 * football/rounds.ts
 *
 * Everything derived from the provider's round labels ("Regular Season - 17",
 * "Apertura - Quarter-finals", "Group Stage - 2", "Round of 16"…):
 *   - parsing a label into phase / stage / matchday;
 *   - Spanish names for knockout rounds;
 *   - building the knockout bracket of a cup or of a league's playoffs
 *     (Liguilla, MLS Playoffs) from a season's fixtures.
 *
 * Pure — no React Native, Firebase or i18n imports.
 */

import { fbTeamLogo, type FbFixtureLite } from '../../../functions/src/shared/football/model';
import type { MatchStatus, Team } from '../../data/types';
import { deriveShortName, localDateOf, statusFromShort } from './base';

// ── Bracket types (rendered by CupBracketView) ───────────────────────────────

/** One leg (match) of a knockout tie. */
export interface CupLeg {
  fixtureId: string;
  date: string;              // local "YYYY-MM-DD"
  status: MatchStatus;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number | null;  // null if not yet played
  awayScore: number | null;
  /** Shootout score, only when this leg was decided on penalties. */
  homePenScore?: number;
  awayPenScore?: number;
  legLabel: string;          // "IDA" | "VUELTA" | ""
  venueId?: number;
  venueName?: string;
  venueCity?: string;
  leagueId?: number;
}

/** One matchup between two teams (1 or 2 legs). */
export interface CupTie {
  id: string;
  homeTeam: Team;            // home team of the first leg
  awayTeam: Team;
  legs: CupLeg[];
  aggregate: { home: number; away: number } | null;
  winner: Team | null;
  isCurrentMatch: boolean;   // one of the legs is the match being viewed
  isFinished: boolean;       // every leg has been played
}

/** A knockout round (Round of 16, Quarter-finals…). */
export interface CupRound {
  id: number;
  name: string;              // Spanish display name
  sortOrder: number;
  isCurrent: boolean;
  isFinished: boolean;
  ties: CupTie[];
}

// ── Round labels ─────────────────────────────────────────────────────────────

export type RoundKind = 'league' | 'group' | 'knockout' | 'qualifying';

export interface RoundInfo {
  /** Tournament half the round belongs to ("Apertura", "Clausura"), or ''. */
  phase: string;
  /** Stage without phase or matchday: "Regular Season", "Group Stage", "Quarter-finals". */
  base: string;
  /** Matchday for league-format rounds, else null. */
  number: number | null;
  kind: RoundKind;
}

const QUALIFYING_RE = /qualif|preliminary/i;
const LEAGUE_FORMAT_RE = /regular season|league stage|league phase|group|quadrangular|cuadrangular|championship round|relegation round|round robin/i;

export function parseRound(label: string | null | undefined): RoundInfo {
  const parts = (label ?? '').split(' - ').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return { phase: '', base: '', number: null, kind: 'league' };

  let number: number | null = null;
  if (/^\d+$/.test(parts[parts.length - 1])) number = Number(parts.pop());

  const phase = parts.length >= 2 ? parts[0] : '';
  const base = parts.length >= 2 ? parts.slice(1).join(' - ') : (parts[0] ?? '');

  let kind: RoundKind;
  if (QUALIFYING_RE.test(base)) kind = 'qualifying';
  else if (/group|quadrangular|cuadrangular/i.test(base)) kind = 'group';
  else if (number !== null || LEAGUE_FORMAT_RE.test(base)) kind = 'league';
  else kind = 'knockout';
  return { phase, base, number, kind };
}

/** Stage a fixture is listed under in a season calendar ("Apertura", "Apertura - Quarter-finals"). */
export function stageNameOf(label: string | null | undefined): string {
  const r = parseRound(label);
  if (!r.base) return '';
  return r.phase ? `${r.phase} - ${r.base}` : r.base;
}

const ROUND_ES: Record<string, string> = {
  'round of 128': 'Ronda de 128',
  '1/128-finals': 'Ronda de 256',
  'round of 64': 'Ronda de 64',
  '1/64-finals': 'Ronda de 64',
  'round of 32': 'Dieciseisavos',
  '1/16-finals': 'Dieciseisavos',
  'round of 16': 'Octavos de Final',
  '1/8-finals': 'Octavos de Final',
  '8th finals': 'Octavos de Final',
  'quarter-finals': 'Cuartos de Final',
  'quarter finals': 'Cuartos de Final',
  'quarterfinals': 'Cuartos de Final',
  'semi-finals': 'Semifinales',
  'semi finals': 'Semifinales',
  'semifinals': 'Semifinales',
  'final': 'Final',
  'finals': 'Final',
  'play-offs': 'Play-Off',
  'playoffs': 'Play-Off',
  'play-off': 'Play-Off',
  'knockout round play-offs': 'Play-Off de Eliminatorias',
  'play-in': 'Play-In',
  'play-in semi-finals': 'Play-In · Semifinales',
  'play-in final': 'Play-In · Final',
  '1st round': 'Primera Ronda',
  '2nd round': 'Segunda Ronda',
  '3rd round': 'Tercera Ronda',
  '4th round': 'Cuarta Ronda',
  '5th round': 'Quinta Ronda',
  'round 1': 'Primera Ronda',
  'round 2': 'Segunda Ronda',
  'round 3': 'Tercera Ronda',
  'round 4': 'Cuarta Ronda',
  '3rd place final': 'Tercer Lugar',
  '3rd place': 'Tercer Lugar',
  'third place': 'Tercer Lugar',
  'third place final': 'Tercer Lugar',
  'third-place final': 'Tercer Lugar',
  'conference semi-finals': 'Semifinales de Conferencia',
  'conference finals': 'Finales de Conferencia',
  'conference final': 'Final de Conferencia',
  'mls cup': 'MLS Cup',
};

/** Spanish name of a knockout round ("Quarter-finals" → "Cuartos de Final"). */
export function translateRoundName(base: string): string {
  return ROUND_ES[base.toLowerCase().trim()] ?? base;
}

/** Canonical depth of a knockout round — only a tie-breaker when two rounds start the same day. */
function knockoutRank(base: string): number {
  const b = base.toLowerCase();
  if (/play-in/.test(b)) return /final/.test(b) && !/semi/.test(b) ? 2 : 1;
  if (/1\/128|round of 128/.test(b)) return 10;
  if (/1\/64|round of 64/.test(b)) return 11;
  if (/round of 32|1\/16/.test(b)) return 12;
  if (/knockout round play-offs|play-?offs?/.test(b)) return 13;
  if (/round of 16|1\/8|8th/.test(b)) return 14;
  if (/quarter/.test(b)) return 15;
  if (/semi/.test(b)) return 16;
  if (/3rd|third/.test(b)) return 17;
  if (/final/.test(b)) return 18;
  return 5; // "1st Round", "2nd Round"…
}

// ── Bracket builder ──────────────────────────────────────────────────────────

function teamOf(id: string, name: string): Team {
  return { id, name, shortName: deriveShortName(name), logo: fbTeamLogo(id) };
}

interface BracketOptions {
  /** Highlights the tie this match belongs to and picks its tournament half. */
  currentFixtureId?: string;
  leagueId?: number;
}

/**
 * Knockout bracket of a season.
 *
 * Which rounds count: knockout-labelled rounds that are not qualifiers, and —
 * when the season also has a league/group stage — only those played after it
 * started (so UEFA's summer "Play-offs" before the league phase stay out).
 * A season with two tournaments (Apertura / Clausura) yields the bracket of
 * the half the current match belongs to, or the most recent one with ties.
 */
export function buildBracket(fixtures: FbFixtureLite[], opts: BracketOptions = {}): CupRound[] {
  const parsed = fixtures
    .filter(f => f.homeId && f.awayId)
    .map(f => ({ f, r: parseRound(f.round) }));
  if (!parsed.length) return [];

  const stageStartByPhase = new Map<string, number>();
  for (const { f, r } of parsed) {
    if (r.kind !== 'league' && r.kind !== 'group') continue;
    const cur = stageStartByPhase.get(r.phase);
    if (cur === undefined || f.timestamp < cur) stageStartByPhase.set(r.phase, f.timestamp);
  }
  const anyStageStart = stageStartByPhase.size ? Math.min(...stageStartByPhase.values()) : null;

  let knockouts = parsed.filter(({ f, r }) => {
    if (r.kind !== 'knockout') return false;
    const stageStart = stageStartByPhase.get(r.phase) ?? anyStageStart;
    return stageStart === null || f.timestamp >= stageStart;
  });
  if (!knockouts.length) return [];

  // Pick the tournament half.
  const phases = [...new Set(knockouts.map(k => k.r.phase))];
  if (phases.length > 1) {
    const current = opts.currentFixtureId
      ? parsed.find(p => p.f.id === opts.currentFixtureId)?.r.phase
      : undefined;
    const latest = (p: string) => Math.max(...knockouts.filter(k => k.r.phase === p).map(k => k.f.timestamp));
    const chosen = current !== undefined && phases.includes(current)
      ? current
      : phases.reduce((a, b) => (latest(b) > latest(a) ? b : a));
    knockouts = knockouts.filter(k => k.r.phase === chosen);
  }

  // Group by round, order rounds chronologically.
  const byRound = new Map<string, FbFixtureLite[]>();
  for (const { f, r } of knockouts) {
    if (!byRound.has(r.base)) byRound.set(r.base, []);
    byRound.get(r.base)!.push(f);
  }
  const ordered = [...byRound.entries()]
    .map(([base, list]) => ({ base, list, start: Math.min(...list.map(f => f.timestamp)) }))
    .sort((a, b) => a.start - b.start || knockoutRank(a.base) - knockoutRank(b.base));

  const rounds: CupRound[] = ordered.map(({ base, list }, idx) => {
    const ties = new Map<string, FbFixtureLite[]>();
    for (const f of list) {
      const key = [f.homeId, f.awayId].sort().join('-');
      if (!ties.has(key)) ties.set(key, []);
      ties.get(key)!.push(f);
    }
    const mapped = [...ties.entries()]
      .map(([key, legs]) => mapTie(`${idx}-${key}`, legs.sort((a, b) => a.timestamp - b.timestamp), opts))
      .sort((a, b) => (a.legs[0]?.date ?? '').localeCompare(b.legs[0]?.date ?? '') || a.id.localeCompare(b.id));
    return {
      id: idx + 1,
      name: translateRoundName(base),
      sortOrder: idx,
      isCurrent: false,
      isFinished: mapped.length > 0 && mapped.every(t => t.isFinished),
      ties: mapped,
    };
  });

  // A tie level on aggregate with no shootout is decided off the pitch (away
  // goals, seeding): whoever shows up in the next round went through.
  for (let i = 0; i < rounds.length - 1; i++) {
    const later = new Set<string>();
    for (const r of rounds.slice(i + 1)) for (const t of r.ties) { later.add(t.homeTeam.id); later.add(t.awayTeam.id); }
    for (const tie of rounds[i].ties) {
      if (tie.winner || !tie.isFinished) continue;
      const h = later.has(tie.homeTeam.id);
      const a = later.has(tie.awayTeam.id);
      if (h !== a) tie.winner = h ? tie.homeTeam : tie.awayTeam;
    }
  }

  const withCurrentMatch = rounds.findIndex(r => r.ties.some(t => t.isCurrentMatch));
  const firstOpen = rounds.findIndex(r => !r.isFinished);
  const currentIdx = withCurrentMatch >= 0 ? withCurrentMatch : firstOpen >= 0 ? firstOpen : rounds.length - 1;
  if (rounds[currentIdx]) rounds[currentIdx].isCurrent = true;
  return rounds;
}

function mapTie(id: string, fixtures: FbFixtureLite[], opts: BracketOptions): CupTie {
  const first = fixtures[0];
  const homeTeam = teamOf(first.homeId, first.homeName);
  const awayTeam = teamOf(first.awayId, first.awayName);
  const twoLegged = fixtures.length === 2;

  const legs: CupLeg[] = fixtures.map((f, i) => {
    const status = statusFromShort(f.statusShort);
    const played = status !== 'scheduled' && f.homeScore !== null && f.awayScore !== null && !f.statusShort.match(/^(PST|CANC|ABD)$/);
    const pens = typeof f.homePen === 'number' && typeof f.awayPen === 'number';
    return {
      fixtureId: f.id,
      date: localDateOf(f.timestamp),
      status,
      homeTeam: teamOf(f.homeId, f.homeName),
      awayTeam: teamOf(f.awayId, f.awayName),
      homeScore: played ? f.homeScore : null,
      awayScore: played ? f.awayScore : null,
      homePenScore: pens ? f.homePen! : undefined,
      awayPenScore: pens ? f.awayPen! : undefined,
      legLabel: twoLegged ? (i === 0 ? 'IDA' : 'VUELTA') : '',
      venueId: f.venueId ?? undefined,
      venueName: f.venueName ?? undefined,
      venueCity: f.venueCity ?? undefined,
      leagueId: opts.leagueId,
    };
  });

  // Aggregate from the first-leg home team's perspective.
  let aggHome = 0;
  let aggAway = 0;
  let anyScore = false;
  for (const leg of legs) {
    if (leg.homeScore === null || leg.awayScore === null) continue;
    anyScore = true;
    const same = leg.homeTeam.id === homeTeam.id;
    aggHome += same ? leg.homeScore : leg.awayScore;
    aggAway += same ? leg.awayScore : leg.homeScore;
  }

  const isFinished = legs.every(l => l.status === 'finished' && l.homeScore !== null);
  let winner: Team | null = null;
  if (isFinished) {
    if (aggHome !== aggAway) {
      winner = aggHome > aggAway ? homeTeam : awayTeam;
    } else {
      // Level: the deciding leg's shootout, else the provider's winner flag.
      const lastFixture = fixtures[fixtures.length - 1];
      const last = legs[legs.length - 1];
      if (last.homePenScore !== undefined && last.awayPenScore !== undefined && last.homePenScore !== last.awayPenScore) {
        winner = last.homePenScore > last.awayPenScore ? last.homeTeam : last.awayTeam;
      } else if (lastFixture.winner && !twoLegged) {
        winner = lastFixture.winner === 'home' ? last.homeTeam : last.awayTeam;
      }
    }
  }

  return {
    id,
    homeTeam,
    awayTeam,
    legs,
    aggregate: twoLegged && anyScore ? { home: aggHome, away: aggAway } : null,
    winner,
    isCurrentMatch: !!opts.currentFixtureId && legs.some(l => l.fixtureId === opts.currentFixtureId),
    isFinished,
  };
}
