// ── useLeagueDetail — loads league standings, top scorers, teams & fixtures ──
import { useState, useEffect } from 'react';
import { InteractionManager } from 'react-native';
import {
  fetchStandings,
  fetchTopScorers,
  fetchTeamsBySeasonId,
  fetchFixturesByDate,
  fetchFixturesBySeasonId,
  fetchSeasonsByLeagueId,
  type SMStandingGroup,
  type SMStandingDetail,
  type SMTopScorer,
  type SMParticipant,
  type SMFixture,
  type SMScore,
  SM_STATE_IDS,
} from '../services/sportmonks';
import { getLeagueConfig, isCopyrightSensitiveLeague } from '../config/leagues';
import { AppCache, CacheTTL } from '../services/cache';

// Finished / live state-id sets (verified SportMonks v3 — see sportmonks.ts).
// FixtureRow keys off these NUMERIC ids instead of the string `short_name`,
// which the Firestore shim doesn't populate (penalty matches were showing as
// "upcoming" with dashes because short_name was undefined → 'NS').
const LF_FINISHED_STATE_IDS = new Set<number>([
  SM_STATE_IDS.FULL_TIME, SM_STATE_IDS.FINISHED_AET, SM_STATE_IDS.FINISHED_PEN, SM_STATE_IDS.AWARDED,
]);
const LF_LIVE_STATE_IDS = new Set<number>([
  SM_STATE_IDS.FIRST_HALF, SM_STATE_IDS.HALF_TIME, SM_STATE_IDS.SECOND_HALF,
  SM_STATE_IDS.ET_BREAK, SM_STATE_IDS.EXTRA_TIME, SM_STATE_IDS.EXTRA_TIME_BREAK,
  SM_STATE_IDS.PENALTIES, SM_STATE_IDS.PEN_BREAK,
]);

/** Robust finished/live/scheduled derivation from the numeric state_id, with
 *  the same 2-135 min time fallback the rest of the app uses (covers lagging
 *  feeds and any unmapped state). */
function deriveFixtureStatus(stateId: number, startingAt?: string): 'live' | 'finished' | 'scheduled' {
  if (LF_FINISHED_STATE_IDS.has(stateId)) return 'finished';
  if (LF_LIVE_STATE_IDS.has(stateId)) return 'live';
  if (startingAt) {
    const ms = new Date(startingAt.replace(' ', 'T') + 'Z').getTime();
    if (!Number.isNaN(ms)) {
      const elapsed = (Date.now() - ms) / 60000;
      if (elapsed > 2 && elapsed < 135) return 'live';
    }
  }
  return 'scheduled';
}
import {
  getStandingsFromFirestore,
  getTopScorersAllCategories,
  getFixturesBySeasonFromFirestore,
  type FirestoreTopScorer,
} from '../services/firestoreApi';
import type { LeagueStanding, Match } from '../data/types';

// ── Firestore → SM shape shims ──────────────────────────────────────────────
// Convert data fetched from Firestore back into the SportMonks-shaped objects
// the existing mapping code (mapStanding, mapTopScorer, etc.) expects. Lets
// us reuse the proven mappers without a parallel implementation.

function firestoreStandingsToSMGroups(rows: LeagueStanding[]): SMStandingGroup[] {
  // DETAIL_TYPE constants are defined just below this block — we duplicate
  // the type_id literals here to avoid a forward-reference issue.
  const TYPE_ID = { PLAYED: 129, WON: 130, DRAW: 131, LOST: 132, GOALS_FOR: 133, GOALS_AGAINST: 134, GOAL_DIFF: 179 };
  return rows.map(r => ({
    id: 0,
    participant_id: Number(r.team.id),
    sport_id: 1,
    league_id: 0,
    season_id: 0,
    stage_id: 0,
    group_id: r.groupId ?? null,
    round_id: 0,
    standing_rule_id: 0,
    position: r.position,
    result: null,
    points: r.points,
    participant: {
      id: Number(r.team.id),
      name: r.team.name,
      short_code: r.team.shortName,
      image_path: r.team.logo,
    } as SMParticipant,
    details: [
      { id: 0, standing_id: 0, standing_rule_id: 0, type_id: TYPE_ID.PLAYED,        value: r.played },
      { id: 0, standing_id: 0, standing_rule_id: 0, type_id: TYPE_ID.WON,           value: r.won },
      { id: 0, standing_id: 0, standing_rule_id: 0, type_id: TYPE_ID.DRAW,          value: r.drawn },
      { id: 0, standing_id: 0, standing_rule_id: 0, type_id: TYPE_ID.LOST,          value: r.lost },
      { id: 0, standing_id: 0, standing_rule_id: 0, type_id: TYPE_ID.GOALS_FOR,     value: r.goalsFor },
      { id: 0, standing_id: 0, standing_rule_id: 0, type_id: TYPE_ID.GOALS_AGAINST, value: r.goalsAgainst },
      { id: 0, standing_id: 0, standing_rule_id: 0, type_id: TYPE_ID.GOAL_DIFF,     value: r.goalDifference },
    ],
  }));
}

function firestoreTopToSM(rows: FirestoreTopScorer[]): SMTopScorer[] {
  return rows.map(r => ({
    id: 0,
    player_id: Number(r.playerId),
    type_id: 208,
    season_id: 0,
    participant_id: 0,
    total: r.goals,
    position: r.position,
    player: {
      id: Number(r.playerId),
      display_name: r.playerName,
      common_name: r.playerName,
      image_path: r.playerImage,
    } as any,
    participant: {
      id: 0,
      name: r.teamName,
      image_path: r.teamLogo,
    } as SMParticipant,
  }) as unknown as SMTopScorer);
}

function deriveTeamsFromStandings(rows: LeagueStanding[]): SMParticipant[] {
  return rows.map(r => ({
    id: Number(r.team.id),
    name: r.team.name,
    short_code: r.team.shortName,
    image_path: r.team.logo,
  }) as SMParticipant);
}

function firestoreFixturesToSM(matches: Match[]): SMFixture[] {
  return matches.map(m => {
    const homeId = Number(m.homeTeam.id) || 0;
    const awayId = Number(m.awayTeam.id) || 0;
    const stateMap: Record<string, number> = {
      'scheduled': 1, 'live': 22, 'finished': 5,
    };
    const stateId = stateMap[m.status] ?? 1;
    return {
      id: Number(m.id) || 0,
      league_id: Number(m.leagueId) || 0,
      season_id: m.seasonId ?? 0,
      // Preserve stage/round/group metadata from the Match doc so the Partidos
      // list can separate "Fase de Grupos" from "Octavos", "Cuartos", etc.
      // Without this every fixture collapsed into a single bucket (mapFixture
      // read f.stage?.name → undefined). Self-heals on docs synced before the
      // stage wire-up (fields fall back to 0/null → single bucket, as before).
      stage_id: m.stageId ?? 0,
      group_id: m.groupId ?? null,
      aggregate_id: null,
      round_id: m.roundId ?? 0,
      round_name: '',
      starting_at: m.startingAtUtc ?? '',
      starting_at_timestamp: m.startingAtUtc ? Math.floor(new Date(m.startingAtUtc).getTime() / 1000) : 0,
      result_info: null,
      leg: null,
      length: 90,
      state_id: stateId,
      participants: [
        { id: homeId, name: m.homeTeam.name, short_code: m.homeTeam.shortName, image_path: m.homeTeam.logo, meta: { location: 'home' } },
        { id: awayId, name: m.awayTeam.name, short_code: m.awayTeam.shortName, image_path: m.awayTeam.logo, meta: { location: 'away' } },
      ] as SMParticipant[],
      scores: m.status === 'finished' || m.status === 'live' ? [
        { id: 0, fixture_id: Number(m.id) || 0, type_id: 1525, participant_id: homeId, score: { goals: m.homeScore, participant: 'home' }, description: 'CURRENT' },
        { id: 0, fixture_id: Number(m.id) || 0, type_id: 1525, participant_id: awayId, score: { goals: m.awayScore, participant: 'away' }, description: 'CURRENT' },
      ] as SMScore[] : [],
      league: { id: Number(m.leagueId) || 0, name: m.league, image_path: m.leagueLogo ?? '' } as any,
      state: { id: stateId, state: m.status, name: m.status } as any,
      stage: (m.stage as any) ?? undefined,
      round: (m.round as any) ?? undefined,
    } as unknown as SMFixture;
  });
}

// ── Standing detail type IDs (SportMonks) ──────────────────────────────────
const DETAIL_TYPE = {
  PLAYED: 129,
  WON: 130,
  DRAW: 131,
  LOST: 132,
  GOALS_FOR: 133,
  GOALS_AGAINST: 134,
  GOAL_DIFF: 179,
};

function detailValue(details: SMStandingDetail[] | undefined, typeId: number): number {
  if (!details) return 0;
  const d = details.find(x => x.type_id === typeId);
  return d?.value ?? 0;
}

// ── Public types ───────────────────────────────────────────────────────────

export interface LeagueStandingRow {
  position: number;
  teamId: number;
  teamName: string;
  teamLogo: string;
  teamShortCode: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Group ID for multi-group leagues (championship/relegation splits). Null for simple leagues. */
  groupId?: number | null;
}

export interface TopScorerRow {
  position: number;
  playerId: number;
  playerName: string;
  playerImage: string;
  teamId: number;
  teamName: string;
  teamLogo: string;
  goals: number;
  typeId: number;
}

export interface LeagueTeam {
  id: number;
  name: string;
  shortCode: string;
  logo: string;
}

export interface LeagueFixture {
  id: number;
  date: string;
  homeTeamId: number;
  homeTeamName: string;
  homeTeamLogo: string;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamLogo: string;
  homeScore: number | null;
  awayScore: number | null;
  stateShort: string; // NS, FT, 1H, HT, 2H, etc. (string hint, may be 'NS' on Firestore path)
  /** Robust live/finished/scheduled derived from the numeric state_id —
   *  FixtureRow should key off THIS, not stateShort. */
  status: 'live' | 'finished' | 'scheduled';
  seasonId: number;
  leagueId: number;
  stageName: string;  // e.g. "Group Stage", "Round of 16", "Quarter-finals"
  roundName: string;  // e.g. "Matchday 1", "Round of 32"
  stageSortOrder: number; // for ordering stages
}

export interface LeagueDetailData {
  leagueId: number;
  leagueName: string;
  leagueLogo: string;
  country: string;
  countryFlag: string;
  seasonId: number;
  seasonName: string;
  standings: LeagueStandingRow[];
  topScorers: TopScorerRow[];
  /** Top 20 assist leaders for the season (type_id=209). */
  topAssists: TopScorerRow[];
  /** Top 20 card leaders for the season (type_id=84, yellow cards). */
  topCards: TopScorerRow[];
  teams: LeagueTeam[];
  fixtures: LeagueFixture[];
}

// ── Map helpers ────────────────────────────────────────────────────────────

function mapStanding(sg: SMStandingGroup): LeagueStandingRow {
  return {
    position: sg.position,
    teamId: sg.participant_id,
    teamName: sg.participant?.name ?? `Team ${sg.participant_id}`,
    teamLogo: sg.participant?.image_path ?? '',
    teamShortCode: sg.participant?.short_code ?? '',
    played: detailValue(sg.details, DETAIL_TYPE.PLAYED),
    won: detailValue(sg.details, DETAIL_TYPE.WON),
    drawn: detailValue(sg.details, DETAIL_TYPE.DRAW),
    lost: detailValue(sg.details, DETAIL_TYPE.LOST),
    goalsFor: detailValue(sg.details, DETAIL_TYPE.GOALS_FOR),
    goalsAgainst: detailValue(sg.details, DETAIL_TYPE.GOALS_AGAINST),
    goalDifference: detailValue(sg.details, DETAIL_TYPE.GOAL_DIFF),
    points: sg.points,
  };
}

/**
 * Deduplicate standings for multi-stage leagues (e.g. Danish Superliga).
 *
 * Problem: leagues with championship/relegation splits have multiple entries
 * per team (one per stage). The API position field is local to each group
 * (1-6 in championship, 1-6 in relegation) causing duplicated positions.
 *
 * Solution:
 * 1. Flatten any nested arrays
 * 2. Keep only the latest stage per team (highest stage_id)
 * 3. Sort by group then position
 * 4. Assign global sequential positions
 */
function deduplicateStandings(rawData: SMStandingGroup[]): LeagueStandingRow[] {
  // Guard: flatten nested arrays (some leagues return [[group1], [group2]])
  const data: SMStandingGroup[] = rawData.length > 0 && Array.isArray(rawData[0])
    ? (rawData as unknown as SMStandingGroup[][]).flat()
    : rawData;

  if (data.length === 0) return [];

  // Step 1: Keep only latest stage per team
  const byTeam = new Map<number, SMStandingGroup>();
  for (const sg of data) {
    if (!sg.participant_id) continue;
    const existing = byTeam.get(sg.participant_id);
    if (!existing || sg.stage_id > existing.stage_id) {
      byTeam.set(sg.participant_id, sg);
    }
  }

  const deduplicated = Array.from(byTeam.values());

  // Step 2: Detect multi-group
  const groupIds = new Set(deduplicated.map(sg => sg.group_id ?? 0));
  const isMultiGroup = groupIds.size > 1;

  // Step 3: Sort by group_id then position
  deduplicated.sort((a, b) => {
    const gA = a.group_id ?? 0;
    const gB = b.group_id ?? 0;
    if (gA !== gB) return gA - gB;
    return a.position - b.position;
  });

  // Step 4: Map with positions
  // For multi-group competitions (e.g. World Cup, Copa Libertadores group
  // stage) we KEEP the original SportMonks position (1-4 within each group)
  // so the UI can show "Grupo A: 1. México 2. Sudáfrica…" naturally.
  // For single-table leagues, the API position is already 1..N globally.
  return deduplicated.map(sg => ({
    ...mapStanding(sg),
    position: sg.position, // 1-4 within group OR 1..N globally
    groupId: isMultiGroup ? (sg.group_id ?? null) : null,
  }));
}

function mapTopScorer(ts: SMTopScorer, idx: number): TopScorerRow {
  return {
    position: ts.position || idx + 1,
    playerId: ts.player_id,
    playerName: ts.player?.display_name || ts.player?.common_name || `Player ${ts.player_id}`,
    playerImage: ts.player?.image_path ?? '',
    teamId: ts.participant_id,
    teamName: '',
    teamLogo: '',
    goals: ts.total,
    typeId: ts.type_id,
  };
}

function mapTeam(p: SMParticipant): LeagueTeam {
  return {
    id: p.id,
    name: p.name,
    shortCode: p.short_code ?? '',
    logo: p.image_path ?? '',
  };
}

function extractFixtureScore(scores: SMScore[] | undefined, side: 'home' | 'away'): number | null {
  if (!scores) return null;
  const ft = scores.find(s => s.description === 'CURRENT' && s.score.participant === side);
  return ft ? ft.score.goals : null;
}

// Map + today-first sort for a season's fixtures. Extracted so it can run once
// on the fixtures slice (progressive hydration) instead of inside the monolithic
// effect. Sort: today/live first, then past (most recent first), then future
// (soonest first) — device-local day so late-night kickoffs aren't off by one.
function processFixtures(fixturesRaw: SMFixture[]): LeagueFixture[] {
  const _now = new Date();
  const todayLocal = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;
  const localDateOf = (utcStr: string) => {
    const d = new Date(utcStr.replace(' ', 'T') + 'Z');
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  return fixturesRaw
    .map(mapFixture)
    .sort((a, b) => {
      const dayA = localDateOf(a.date);
      const dayB = localDateOf(b.date);
      const isTodayA = dayA === todayLocal;
      const isTodayB = dayB === todayLocal;
      const isPastA  = dayA < todayLocal;
      const isPastB  = dayB < todayLocal;
      const groupA = isTodayA ? 0 : isPastA ? 1 : 2;
      const groupB = isTodayB ? 0 : isPastB ? 1 : 2;
      if (groupA !== groupB) return groupA - groupB;
      if (isTodayA) return new Date(a.date).getTime() - new Date(b.date).getTime();
      if (isPastA)  return new Date(b.date).getTime() - new Date(a.date).getTime();
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
}

function mapFixture(f: SMFixture): LeagueFixture {
  const home = f.participants?.find(p => p.meta?.location === 'home');
  const away = f.participants?.find(p => p.meta?.location === 'away');
  return {
    id: f.id,
    date: f.starting_at,
    homeTeamId: home?.id ?? 0,
    homeTeamName: home?.name ?? '',
    homeTeamLogo: home?.image_path ?? '',
    awayTeamId: away?.id ?? 0,
    awayTeamName: away?.name ?? '',
    awayTeamLogo: away?.image_path ?? '',
    homeScore: extractFixtureScore(f.scores, 'home'),
    awayScore: extractFixtureScore(f.scores, 'away'),
    stateShort: f.state?.short_name ?? 'NS',
    status: deriveFixtureStatus(f.state_id, f.starting_at),
    seasonId: f.season_id,
    leagueId: f.league_id,
    stageName: f.stage?.name ?? '',
    roundName: f.round?.name ?? '',
    stageSortOrder: f.stage?.sort_order ?? 0,
  };
}

// ── Fetch fixtures for a league around today ───────────────────────────────

async function fetchLeagueFixtures(leagueId: number): Promise<SMFixture[]> {
  const now = new Date();
  const dates: string[] = [];
  // Fetch 7 days back and 7 days forward
  for (let d = -7; d <= 7; d++) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() + d);
    dates.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`);
  }

  const results: SMFixture[] = [];
  // Fetch in batches of 3 to avoid rate limits
  for (let i = 0; i < dates.length; i += 3) {
    const batch = dates.slice(i, i + 3);
    const fetches = await Promise.all(
      batch.map(date =>
        fetchFixturesByDate(date, String(leagueId)).catch(() => [] as SMFixture[]),
      ),
    );
    for (const list of fetches) results.push(...list);
  }

  return results;
}

// ══════════════════════════════════════════════════════════════════════════════
// HOOK
// ══════════════════════════════════════════════════════════════════════════════

export function useLeagueDetail(
  leagueId: number,
  leagueName: string,
  leagueLogo?: string,
  seasonId?: number,
) {
  const [data, setData] = useState<LeagueDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Defer until navigation animation completes so the transition doesn't
    // block on Firestore reads + synchronous processing.
    const task = InteractionManager.runAfterInteractions(() => {
      (async () => {
        try {
          const config = getLeagueConfig(leagueId);

          // 1. Resolve season ID — sync-first (route param → config). Only hit
          // the network when we genuinely don't know the season.
          let resolvedSeasonId = seasonId ?? config?.currentSeasonId ?? null;
          let resolvedSeasonName = '';
          if (!resolvedSeasonId) {
            try {
              const leagueData = await fetchSeasonsByLeagueId(leagueId);
              if (leagueData.currentSeason) {
                resolvedSeasonId = leagueData.currentSeason.id;
                resolvedSeasonName = leagueData.currentSeason.name;
              }
            } catch {
              // ignore — we'll use what we have
            }
          }

          if (!resolvedSeasonId) {
            if (cancelled) return;
            setError('No se encontró la temporada actual');
            setLoading(false);
            return;
          }

          const seasonIdNum = resolvedSeasonId;
          const defaultSeasonName = resolvedSeasonName
            || `${new Date().getFullYear() - 1}/${String(new Date().getFullYear()).slice(2)}`;

          // Merge a slice onto whatever's already in state (progressive
          // hydration) → always produces a complete LeagueDetailData.
          const mergeData = (
            prev: LeagueDetailData | null,
            slice: Partial<LeagueDetailData>,
          ): LeagueDetailData => ({
            leagueId,
            leagueName: config?.name || leagueName,
            leagueLogo: prev?.leagueLogo || leagueLogo || '',
            country: config?.country || '',
            countryFlag: config?.flag || '',
            seasonId: seasonIdNum,
            seasonName: prev?.seasonName || defaultSeasonName,
            standings: prev?.standings ?? [],
            topScorers: prev?.topScorers ?? [],
            topAssists: prev?.topAssists ?? [],
            topCards: prev?.topCards ?? [],
            teams: prev?.teams ?? [],
            fixtures: prev?.fixtures ?? [],
            ...slice,
          });

          // 2. FIXTURES FIRST — all the landing "Partidos" tab needs. Painting
          // these dismisses the full-screen skeleton (gate is loading && !data).
          const fixturesKey = `league_fixtures_v2_${seasonIdNum}`;

          // 2a. Stale-while-revalidate: paint cached fixtures instantly.
          try {
            const cachedFixtures = await AppCache.get<LeagueFixture[]>(fixturesKey);
            if (cachedFixtures?.length && !cancelled) {
              setData(prev => mergeData(prev, { fixtures: cachedFixtures }));
              setLoading(false);
            }
          } catch {
            // ignore cache read errors
          }

          // 2b. Fresh fixtures — Firestore first (deduped at the service layer),
          // proxy fallback. processFixtures = map + today-first sort.
          const fsFixturesMatch = await getFixturesBySeasonFromFirestore(seasonIdNum).catch(() => [] as Match[]);
          let fixtures: LeagueFixture[];
          if (fsFixturesMatch.length > 0) {
            fixtures = processFixtures(firestoreFixturesToSM(fsFixturesMatch));
          } else {
            const proxyFixtures = await fetchFixturesBySeasonId(seasonIdNum).catch(() => [] as SMFixture[]);
            fixtures = processFixtures(proxyFixtures);
          }
          if (!cancelled) {
            setData(prev => mergeData(prev, { fixtures }));
            setLoading(false); // skeleton clears — Partidos renders now
            if (fixtures.length > 0) {
              const ttl = fixtures.some(f => f.status === 'live')
                ? CacheTTL.fixturesLive
                : CacheTTL.fixturesStatic;
              AppCache.set(fixturesKey, fixtures, ttl).catch(() => {});
            }
          }

          // 3. META (standings + scorers + teams) — background; the
          // Grupos/Goleadores/Asistencias/Equipos tabs need it.
          const [fsStandings, fsTopScorers] = await Promise.all([
            getStandingsFromFirestore(seasonIdNum).catch(() => []),
            getTopScorersAllCategories(seasonIdNum).catch(() => ({ goals: [], assists: [], cards: [] })),
          ]);
          const hasFsMeta =
            fsStandings.length > 0 &&
            (fsTopScorers.goals.length > 0 || fsTopScorers.assists.length > 0 || fsTopScorers.cards.length > 0);

          let standingsRaw: SMStandingGroup[];
          let topScorersRaw: SMTopScorer[];
          let topAssistsRaw: SMTopScorer[];
          let topCardsRaw: SMTopScorer[];
          let teamsRaw: SMParticipant[];
          if (hasFsMeta) {
            standingsRaw = firestoreStandingsToSMGroups(fsStandings);
            topScorersRaw = firestoreTopToSM(fsTopScorers.goals);
            topAssistsRaw = firestoreTopToSM(fsTopScorers.assists);
            topCardsRaw = firestoreTopToSM(fsTopScorers.cards);
            teamsRaw = deriveTeamsFromStandings(fsStandings);
          } else {
            [standingsRaw, topScorersRaw, topAssistsRaw, topCardsRaw, teamsRaw] = await Promise.all([
              fetchStandings(seasonIdNum).catch(() => [] as SMStandingGroup[]),
              fetchTopScorers(seasonIdNum, 208).catch(() => [] as SMTopScorer[]),
              fetchTopScorers(seasonIdNum, 209).catch(() => [] as SMTopScorer[]),
              fetchTopScorers(seasonIdNum, 84).catch(() => [] as SMTopScorer[]),
              fetchTeamsBySeasonId(seasonIdNum).catch(() => [] as SMParticipant[]),
            ]);
          }

          if (cancelled) return;

          // Map meta — dedup standings for multi-stage leagues
          const standings = deduplicateStandings(standingsRaw);

          // Filter out placeholder entries (e.g. "1st ranked" used in bracket draws)
          const realTeams = teamsRaw.filter(p => !p.placeholder);
          const mappedTeams: LeagueTeam[] = realTeams.length > 0
            ? realTeams.map(mapTeam)
            : standings.map(s => ({
                id: s.teamId,
                name: s.teamName,
                shortCode: s.teamShortCode,
                logo: s.teamLogo,
              }));
          const teams = mappedTeams.sort((a, b) => a.name.localeCompare(b.name));

          // Build team lookup for top scorers
          const teamLookup = new Map<number, { name: string; logo: string }>();
          for (const tm of teams) teamLookup.set(tm.id, { name: tm.name, logo: tm.logo });
          for (const s of standings) teamLookup.set(s.teamId, { name: s.teamName, logo: s.teamLogo });

          const buildStatRows = (raw: SMTopScorer[]): TopScorerRow[] =>
            raw
              .map((ts, i) => {
                const row = mapTopScorer(ts, i);
                const team = teamLookup.get(ts.participant_id);
                if (team) { row.teamName = team.name; row.teamLogo = team.logo; }
                return row;
              })
              .sort((a, b) => a.position - b.position)
              .slice(0, 20);

          const topScorers = buildStatRows(topScorersRaw.length === 0 ? [] : topScorersRaw);
          const topAssists = buildStatRows(topAssistsRaw);
          const topCards = buildStatRows(topCardsRaw);

          if (!cancelled) {
            setData(prev => mergeData(prev, { standings, topScorers, topAssists, topCards, teams }));
          }

          // 4. League logo — fire-and-forget, OFF the critical path. Skip for
          // copyright-sensitive leagues (WC logo suppressed) and when we already
          // have a logo. This network call previously blocked the whole screen.
          if (!isCopyrightSensitiveLeague(leagueId) && !leagueLogo) {
            fetchSeasonsByLeagueId(leagueId)
              .then(info => {
                const logo = (info?.image_path as string | undefined) ?? '';
                if (!cancelled && logo) {
                  setData(prev => (prev ? { ...prev, leagueLogo: logo } : prev));
                }
              })
              .catch(() => {});
          }
        } catch (err: any) {
          if (cancelled) return;
          // eslint-disable-next-line no-console
          console.warn('useLeagueDetail error for league', leagueId, 'season', seasonId, ':', err?.message, err?.stack?.slice(0, 200));
          setError(err?.message ?? 'Error loading league');
          // Even on partial failure expose a minimal valid object so the screen
          // renders the league name + a "no data" placeholder, not a wireframe.
          const config = getLeagueConfig(leagueId);
          setData(prev => prev ?? {
            leagueId,
            leagueName: config?.name || leagueName,
            leagueLogo: leagueLogo || '',
            country: config?.country || '',
            countryFlag: config?.flag || '',
            seasonId: seasonId ?? config?.currentSeasonId ?? 0,
            seasonName: '',
            standings: [],
            topScorers: [],
            topAssists: [],
            topCards: [],
            teams: [],
            fixtures: [],
          });
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [leagueId, seasonId]);

  return { data, loading, error };
}
