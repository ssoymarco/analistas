/**
 * football/mappers.ts
 *
 * Firestore `fb_*` documents (API-Sports, normalized by the Cloud Functions —
 * shapes in functions/src/shared/football/model.ts) → the app's domain types
 * (src/data/types.ts). Pure functions with no React Native or Firebase
 * imports, so they run unchanged in Node tests.
 */

import {
  fbSeasonKey, fbTeamLogo,
  type FbAbsence, type FbEvent, type FbFixtureLite, type FbFormRow, type FbH2HRow, type FbLineup,
  type FbMatchDetailDoc, type FbMatchDoc, type FbMatchPreviewDoc, type FbPlayerRating,
  type FbStandingsDoc, type FbStandingsGroup, type FbTeamRef, type FbTopPlayer,
} from '../../../functions/src/shared/football/model';
import type {
  CupGroup, CupGroupsResult, H2HResult, LeagueStanding, Match, MatchDetail, MatchEvent, MatchLineup,
  MatchPrediction, MatchStatus, MissingPlayer, PlayerRating, Team, TeamFormEntry,
} from '../../data/types';
import {
  DEAD_STATE_ID, localDateOf, localTimeOf, displayTeam, shortNameFor, statusFromShort, stateLabelFromShort,
  utcStringOf,
} from './base';
import { parseRound } from './rounds';
import { absenceDoubtfulLabel, absenceFallbackLabel, translateAbsenceReason } from '../../utils/absenceReasons';
import { getFootballLeague } from '../../../functions/src/shared/football/leagues';

export {
  DEAD_STATE_ID, deriveShortName, localDateOf, localDayRange, localTimeOf, shortNameFor,
  statusFromShort, stateLabelFromShort, utcStringOf,
} from './base';

// ── Teams ────────────────────────────────────────────────────────────────────

export function teamFromFb(t: FbTeamRef): Team {
  // Tables stored before the backend learned to repair them can hold a row
  // whose team id is missing (the literal "null").
  const id = /^\d+$/.test(String(t.id ?? '')) ? String(t.id) : '';
  return {
    id,
    ...displayTeam(id, t.name, t.shortName),
    logo: t.logo || (id ? fbTeamLogo(id) : ''),
  };
}

// ── Match rows ───────────────────────────────────────────────────────────────

function timeDisplay(status: MatchStatus, short: string, minute: number | null | undefined, timestamp: number): string {
  if (status === 'scheduled') return localTimeOf(timestamp);
  if (status === 'finished') return 'FT';
  if (short === 'HT') return 'HT';
  if (short === 'P') return 'PEN';
  return minute != null ? `${minute}'` : '';
}

export function matchFromFb(d: FbMatchDoc): Match {
  const short = String(d.statusShort ?? 'NS');
  const status = statusFromShort(short);
  const live = status === 'live';
  // During a shootout the clock is stopped: no minute, so cards show "PEN".
  const minute = live && short !== 'P' ? (d.minute ?? undefined) : undefined;
  const hasPens = typeof d.homePenScore === 'number' && typeof d.awayPenScore === 'number';
  const m: Match = {
    id: String(d.id),
    homeTeam: teamFromFb(d.homeTeam),
    awayTeam: teamFromFb(d.awayTeam),
    homeScore: d.homeScore ?? 0,
    awayScore: d.awayScore ?? 0,
    status,
    time: timeDisplay(status, short, minute, d.timestamp),
    minute,
    league: d.league,
    leagueLogo: d.leagueLogo || undefined,
    leagueId: String(d.leagueId),
    date: localDateOf(d.timestamp),
    startingAtUtc: utcStringOf(d.timestamp),
    timestamp: d.timestamp,
    seasonId: fbSeasonKey(d.leagueId, d.season),
    season: d.season,
    statusShort: short,
    roundLabel: d.round ?? undefined,
    leagueCountry: d.leagueCountry || undefined,
    popularity: d.popularity,
    homeScoreHT: d.homeScoreHT ?? undefined,
    awayScoreHT: d.awayScoreHT ?? undefined,
    homePenScore: hasPens ? d.homePenScore! : undefined,
    awayPenScore: hasPens ? d.awayPenScore! : undefined,
    lastEvent: d.lastEvent || undefined,
    homeEvents: d.homeEvents || undefined,
    awayEvents: d.awayEvents || undefined,
    homeYellowCards: d.homeYellowCards ?? undefined,
    awayYellowCards: d.awayYellowCards ?? undefined,
    liveStats: d.liveStats ?? undefined,
    homeRedCards: d.homeRedCards || undefined,
    awayRedCards: d.awayRedCards || undefined,
    stateLabel: live || status === 'interrupted' ? stateLabelFromShort(short) : undefined,
    stateId: DEAD_STATE_ID[short],
    liveClock: live ? (d.liveClock ?? undefined) : undefined,
    venueId: d.venueId ?? undefined,
    venueName: d.venueName ?? undefined,
    venueCity: d.venueCity ?? undefined,
  };
  return m;
}

/** A slim calendar row → Match. `ctx` supplies what the row leaves out. */
export function matchFromLite(
  f: FbFixtureLite,
  ctx: { leagueId?: string; league?: string; leagueLogo?: string; season?: number },
): Match {
  const short = f.statusShort;
  const status = statusFromShort(short);
  const live = status === 'live';
  const leagueId = f.leagueId ?? ctx.leagueId ?? '';
  const season = f.season ?? ctx.season;
  const minute = live && short !== 'P' ? (f.minute ?? undefined) : undefined;
  const hasPens = typeof f.homePen === 'number' && typeof f.awayPen === 'number';
  return {
    id: f.id,
    homeTeam: { id: f.homeId, ...displayTeam(f.homeId, f.homeName), logo: fbTeamLogo(f.homeId) },
    awayTeam: { id: f.awayId, ...displayTeam(f.awayId, f.awayName), logo: fbTeamLogo(f.awayId) },
    homeScore: f.homeScore ?? 0,
    awayScore: f.awayScore ?? 0,
    status,
    time: timeDisplay(status, short, minute, f.timestamp),
    minute,
    // Same curated name the day list shows ("Champions League", not the
    // provider's "UEFA Champions League").
    league: (leagueId ? getFootballLeague(leagueId)?.name : undefined) ?? f.league ?? ctx.league ?? '',
    leagueLogo: ctx.leagueLogo,
    leagueId,
    date: localDateOf(f.timestamp),
    startingAtUtc: utcStringOf(f.timestamp),
    timestamp: f.timestamp,
    seasonId: leagueId && season ? fbSeasonKey(leagueId, season) : undefined,
    season,
    statusShort: short,
    roundLabel: f.round ?? undefined,
    homePenScore: hasPens ? f.homePen! : undefined,
    awayPenScore: hasPens ? f.awayPen! : undefined,
    stateLabel: live || status === 'interrupted' ? stateLabelFromShort(short) : undefined,
    stateId: DEAD_STATE_ID[short],
    venueId: f.venueId ?? undefined,
    venueName: f.venueName ?? undefined,
    venueCity: f.venueCity ?? undefined,
  };
}

/**
 * Overlay fresher rows (live scores from `fb_matches`) onto a list built from a
 * cached calendar. Rows not present in `fresh` are returned untouched.
 */
export function overlayMatches(base: Match[], fresh: Match[]): Match[] {
  if (!fresh.length) return base;
  const byId = new Map(fresh.map(m => [m.id, m]));
  return base.map(m => {
    const f = byId.get(m.id);
    // Keep calendar-only context the live row doesn't carry differently.
    return f ? { ...m, ...f, leagueLogo: f.leagueLogo ?? m.leagueLogo } : m;
  });
}

/** Display order: in play first, then upcoming by kickoff, then finished. */
export function sortForDisplay(a: Match, b: Match): number {
  const order: Record<string, number> = { live: 0, interrupted: 0, scheduled: 1, finished: 2 };
  const so = (order[a.status] ?? 1) - (order[b.status] ?? 1);
  if (so !== 0) return so;
  const ta = a.timestamp ?? 0;
  const tb = b.timestamp ?? 0;
  if (ta !== tb) return ta - tb;
  return a.id.localeCompare(b.id);
}

// ── Match detail ─────────────────────────────────────────────────────────────

const EMPTY_LINEUP: MatchLineup = { formation: '?', starters: [], bench: [], coach: '', coachNationality: '' };

function eventFromFb(e: FbEvent): MatchEvent {
  return {
    id: e.id,
    minute: e.minute,
    addedTime: e.addedTime,
    type: e.type,
    team: e.team,
    player: e.player,
    relatedPlayer: e.relatedPlayer,
    description: e.description,
    shootoutOrder: e.shootoutOrder,
    shootoutResult: e.shootoutResult,
  };
}

function lineupFromFb(l: FbLineup | null | undefined): MatchLineup {
  if (!l) return EMPTY_LINEUP;
  return {
    formation: l.formation || '?',
    starters: l.starters ?? [],
    bench: l.bench ?? [],
    coach: l.coach ?? '',
    coachNationality: '',
    coachImageUrl: l.coachImageUrl,
    coachId: l.coachId,
  };
}

function ratingFromFb(r: FbPlayerRating): PlayerRating {
  return {
    name: r.name,
    number: r.number,
    position: r.position,
    rating: r.rating,
    goals: r.goals,
    assists: r.assists,
    shots: r.shots,
    keyPasses: r.keyPasses,
    tackles: r.tackles,
    saves: r.saves,
    touches: 0,
    passAccuracy: r.passAccuracy,
    duelsWon: r.duelsWon,
    isMOTM: r.isMOTM,
  };
}

/** Best-rated player of the match gets the "MOTM" badge. */
function markMotm(home: PlayerRating[], away: PlayerRating[]): void {
  let best: PlayerRating | null = null;
  for (const r of [...home, ...away]) if (!best || r.rating > best.rating) best = r;
  if (best && best.rating >= 7) best.isMOTM = true;
}

function missingFromFb(a: FbAbsence): MissingPlayer {
  const reason: MissingPlayer['reason'] =
    a.type === 'injury' || a.type === 'doubtful' ? 'injury' :
    a.type === 'suspension' ? 'suspension' :
    a.type === 'international' ? 'international' : 'other';
  // The provider's reason ("Knee Injury", "Red Card"…) in the app's language.
  const why = translateAbsenceReason(a.reason) || absenceFallbackLabel(a.type);
  const detail = a.type === 'doubtful' && a.reason ? `${absenceDoubtfulLabel()} · ${why}` : why;
  return { name: a.name, reason, detail };
}

/**
 * H2H rows from the CURRENT match's point of view: `homeScore` is always the
 * goals of today's home team, wherever that old match was played — the UI
 * counts `homeScore > awayScore` as a win for today's home side.
 */
export function h2hFromFb(rows: FbH2HRow[], homeTeamId: string): H2HResult[] {
  return rows.map(r => {
    const sameOrientation = String(r.homeTeam.id) === String(homeTeamId);
    return {
      date: localDateOf(r.timestamp),
      homeScore: sameOrientation ? r.homeScore : r.awayScore,
      awayScore: sameOrientation ? r.awayScore : r.homeScore,
      competition: r.league,
      venue: r.venueName ?? '',
    };
  });
}

function formFromFb(rows: FbFormRow[]): TeamFormEntry[] {
  return rows.map(r => ({
    matchId: r.matchId,
    opponent: r.opponent.name,
    opponentLogo: r.opponent.logo || fbTeamLogo(r.opponent.id),
    isHome: r.isHome,
    goalsFor: r.goalsFor,
    goalsAgainst: r.goalsAgainst,
    result: r.result,
    date: localDateOf(r.timestamp),
    league: r.league,
  }));
}

function predictionsFromFb(p: FbMatchPreviewDoc['prediction']): MatchPrediction[] | undefined {
  if (!p) return undefined;
  const { home, draw, away } = p.percent;
  if (home + draw + away <= 0) return undefined;
  return [{ type: 'Fulltime Result', homeWin: home, draw, awayWin: away }];
}

/**
 * Aggregate of a two-legged tie, when this match is the return leg: the
 * previous meeting of the same teams in the same competition round, played in
 * the last 3 weeks. Scored from the current home team's perspective.
 */
export function aggregateFromH2H(
  match: Pick<Match, 'leagueId' | 'roundLabel' | 'timestamp' | 'homeScore' | 'awayScore' | 'status' | 'homeTeam'>,
  h2h: FbH2HRow[],
): { home: number; away: number } | undefined {
  if (parseRound(match.roundLabel).kind !== 'knockout' || !match.timestamp) return undefined;
  if (match.status === 'scheduled') return undefined;
  const firstLeg = h2h.find(r =>
    String(r.leagueId) === String(match.leagueId) &&
    (r.round ?? '') === (match.roundLabel ?? '') &&
    r.timestamp < match.timestamp! &&
    match.timestamp! - r.timestamp < 21 * 86_400);
  if (!firstLeg) return undefined;
  const sameOrientation = String(firstLeg.homeTeam.id) === String(match.homeTeam.id);
  return {
    home: match.homeScore + (sameOrientation ? firstLeg.homeScore : firstLeg.awayScore),
    away: match.awayScore + (sameOrientation ? firstLeg.awayScore : firstLeg.homeScore),
  };
}

/** "César Ramos, Mexico" → name + nationality (API-Sports appends the country to some referees). */
function splitReferee(raw: string | null | undefined): { name: string; nationality: string } {
  if (!raw) return { name: '', nationality: '' };
  const [name, ...rest] = raw.split(',');
  return { name: name.trim(), nationality: rest.join(',').trim() };
}

/**
 * Assemble the MatchDetail the tabs render from the three Firestore docs
 * behind a match: the row (score/venue/referee), the detail (events, lineups,
 * statistics, ratings, pressure) and the preview (H2H, absences, form,
 * prediction, stadium). Any of the last two may still be loading.
 */
export function detailFromFb(
  match: Match,
  row: FbMatchDoc | null,
  detail: FbMatchDetailDoc | null,
  preview: FbMatchPreviewDoc | null,
): MatchDetail {
  const homeRatings = (detail?.playerRatings?.home ?? []).map(ratingFromFb);
  const awayRatings = (detail?.playerRatings?.away ?? []).map(ratingFromFb);
  if (match.status === 'finished') markMotm(homeRatings, awayRatings);

  const v = preview?.venue;
  const referee = splitReferee(row?.referee);
  const pressure = detail?.pressure;

  return {
    matchId: match.id,
    venue: {
      id: v?.id ?? match.venueId,
      name: v?.name ?? match.venueName ?? '',
      city: v?.city ?? match.venueCity ?? '',
      capacity: v?.capacity ?? 0,
      surface: v?.surface ?? '',
      image: v?.image ?? undefined,
    },
    // API-Sports only knows the referee's name: no photo, flag or statistics.
    referee: { name: referee.name, nationality: referee.nationality, flag: '' },
    events: (detail?.events ?? []).map(eventFromFb),
    statistics: detail?.statistics ?? [],
    homeLineup: lineupFromFb(detail?.lineups?.home),
    awayLineup: lineupFromFb(detail?.lineups?.away),
    homePlayerRatings: homeRatings,
    awayPlayerRatings: awayRatings,
    odds: [],
    h2h: {
      homeTeam: match.homeTeam.name,
      awayTeam: match.awayTeam.name,
      results: preview ? h2hFromFb(preview.h2h, match.homeTeam.id) : [],
    },
    missingPlayers: {
      home: (preview?.absences.home ?? []).map(missingFromFb),
      away: (preview?.absences.away ?? []).map(missingFromFb),
    },
    predictions: predictionsFromFb(preview?.prediction ?? null),
    homeForm: preview && preview.form.home.length ? formFromFb(preview.form.home) : undefined,
    awayForm: preview && preview.form.away.length ? formFromFb(preview.form.away) : undefined,
    pressureIndex: pressure
      ? { home: pressure.home, away: pressure.away, homeAttacks: 0, awayAttacks: 0, homeDangerousAttacks: 0, awayDangerousAttacks: 0 }
      : undefined,
    aggregateScore: preview ? aggregateFromH2H(match, preview.h2h) : undefined,
  };
}

// ── Standings ────────────────────────────────────────────────────────────────

function standingsOfGroup(g: FbStandingsGroup, groupId: number | null, groupName?: string): LeagueStanding[] {
  return g.rows.map(r => ({
    position: r.position,
    team: teamFromFb(r.team),
    played: r.played,
    won: r.won,
    drawn: r.drawn,
    lost: r.lost,
    goalsFor: r.goalsFor,
    goalsAgainst: r.goalsAgainst,
    goalDifference: r.goalDifference,
    points: r.points,
    groupId,
    ...(groupName ? { groupName } : {}),
  }));
}

/**
 * Tables a league can ship besides its main one (API-Sports returns them as
 * extra "groups"): split-phase tables, aggregate/relegation tables, per
 * conference… A single-table league has exactly one group.
 */
export function standingsFromFb(doc: FbStandingsDoc | null | undefined): LeagueStanding[] {
  const groups = primaryGroups(doc);
  if (groups.length === 0) return [];
  if (groups.length === 1) return standingsOfGroup(groups[0], null);
  return groups.flatMap((g, i) => standingsOfGroup(g, i + 1, groupDisplayName(g.name, i)));
}

/** Order of the halves of a split season ("Liga MX: Apertura" / "Liga MX: Clausura"). 0 = not a half. */
function phaseRank(name: string): number {
  if (/apertura|opening|1st|first/i.test(name)) return 1;
  if (/clausura|closing|2nd|second/i.test(name)) return 2;
  return 0;
}

const hasStarted = (g: FbStandingsGroup) => g.rows.some(r => (r.played ?? 0) > 0);
const teamSetKey = (g: FbStandingsGroup) => g.rows.map(r => String(r.team.id)).sort().join(',');

/**
 * The tables to show as "the" standings: the provider's groups in order,
 * skipping any that repeats teams already listed (overall/aggregate tables
 * that come after the per-conference or per-phase ones).
 *
 * A split season lists both halves with the same teams: the one to show is the
 * half being played — the latest that has started — whatever order they come in.
 */
export function primaryGroups(doc: FbStandingsDoc | null | undefined): FbStandingsGroup[] {
  const seen = new Set<string>();
  const out: FbStandingsGroup[] = [];
  for (const g of doc?.groups ?? []) {
    if (!g.rows.length) continue;
    if (g.rows.some(r => seen.has(String(r.team.id)))) {
      const rank = phaseRank(g.name);
      const i = rank ? out.findIndex(o => phaseRank(o.name) > 0 && teamSetKey(o) === teamSetKey(g)) : -1;
      if (i >= 0) {
        const cur = out[i];
        const curRank = phaseRank(cur.name);
        const better = hasStarted(g) !== hasStarted(cur)
          ? hasStarted(g)                                   // the half that has matches played
          : hasStarted(g) ? rank > curRank : rank < curRank; // both running → later; none → first
        if (better) out[i] = g;
      }
      continue;
    }
    for (const r of g.rows) seen.add(String(r.team.id));
    out.push(g);
  }
  return out;
}

/** "Group A" … "Group L", "Group 1" — a real group of a group stage (not "Group Stage", the third-placed ranking). */
const GROUP_NAME_RE = /group\s+([a-z]|\d{1,2})$/i;

/** "Group A", "Liga MX: Apertura", "Eastern Conference" → display name. */
export function groupDisplayName(name: string, index: number): string {
  const m = name.trim().match(GROUP_NAME_RE);
  if (m) return `Grupo ${m[1].toUpperCase()}`;
  if (/east(ern)? conference/i.test(name)) return 'Conferencia Este';
  if (/west(ern)? conference/i.test(name)) return 'Conferencia Oeste';
  const afterColon = name.split(':').pop()?.trim();
  return afterColon || `Grupo ${String.fromCharCode(65 + index)}`;
}

export function cupGroupsFromFb(doc: FbStandingsDoc | null | undefined): CupGroupsResult {
  const groups = doc?.groups ?? [];
  // Only real group stages: several tables whose names say "Group X".
  const real = groups.filter(g => GROUP_NAME_RE.test(g.name.trim()));
  if (real.length < 2) return { hasGroups: false, groups: [] };
  const out: CupGroup[] = real.map((g, i) => ({
    id: i + 1,
    name: groupDisplayName(g.name, i),
    standings: standingsOfGroup(g, i + 1, groupDisplayName(g.name, i)),
  }));
  return { hasGroups: true, groups: out };
}

// ── Top players ──────────────────────────────────────────────────────────────

export interface TopPlayerRow {
  playerId: string;
  playerName: string;
  playerImage: string;
  teamId: string;
  teamName: string;
  teamLogo: string;
  goals: number;
  position: number;
}

export function topPlayerFromFb(p: FbTopPlayer): TopPlayerRow {
  return {
    playerId: p.playerId,
    playerName: p.name,
    playerImage: p.photo,
    teamId: p.teamId,
    teamName: displayTeam(p.teamId, p.teamName).name,
    teamLogo: p.teamLogo,
    goals: p.value,
    position: p.position,
  };
}
