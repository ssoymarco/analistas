// ── useLeagueDetail — loads league standings, top scorers, teams & fixtures ──
import { useState, useEffect, useRef } from 'react';
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
} from '../services/sportmonks';
import { getLeagueConfig } from '../config/leagues';
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
      stage_id: 0,
      group_id: null,
      aggregate_id: null,
      round_id: 0,
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
      stage: undefined,
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
  stateShort: string; // NS, FT, 1H, HT, 2H, etc.
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
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // 1. Resolve season ID
        let resolvedSeasonId = seasonId ?? null;
        let resolvedSeasonName = '';
        const config = getLeagueConfig(leagueId);

        if (!resolvedSeasonId && config?.currentSeasonId) {
          resolvedSeasonId = config.currentSeasonId;
        }

        // If still no season, try fetching from API
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
          if (!mounted.current) return;
          setError('No se encontró la temporada actual');
          setLoading(false);
          return;
        }

        // 2. Fetch all data in parallel
        // type_ids: 208=goals, 209=assists, 84=yellow cards
        // ALWAYS fetch fixtures by seasonId — when the user switches to a past
        // season via the picker we must show that season's matches, not the
        // current league fixtures. fetchLeagueFixtures only knows about today
        // ± a few days, so it would return the current jornada regardless of
        // which historical season the user picked.
        // ── Firestore-first: try to satisfy as much as possible from our
        // own data layer (zero SportMonks calls per user). Fall back to the
        // proxy only for fields Firestore doesn't have yet.
        const [fsStandings, fsTopScorers, fsFixturesMatch] = await Promise.all([
          getStandingsFromFirestore(resolvedSeasonId).catch(() => []),
          getTopScorersAllCategories(resolvedSeasonId).catch(() => ({ goals: [], assists: [], cards: [] })),
          getFixturesBySeasonFromFirestore(resolvedSeasonId).catch(() => []),
        ]);

        // If we have a meaningful Firestore hit (standings present and at
        // least one of goleadores OR fixtures present), serve everything
        // from cache and ONLY fetch league metadata (1 call vs 7).
        const hasFirestoreData =
          fsStandings.length > 0 &&
          (fsTopScorers.goals.length > 0 || fsFixturesMatch.length > 0);

        const [standingsRaw, topScorersRaw, topAssistsRaw, topCardsRaw, teamsRaw, fixturesRaw, leagueInfo] = hasFirestoreData
          ? await Promise.all([
              // Standings: convert Firestore LeagueStanding[] back to SM group shape
              // (the downstream mapper expects SMStandingGroup[]).
              Promise.resolve(firestoreStandingsToSMGroups(fsStandings)),
              // Top scorers: convert FirestoreTopScorer[] back to SM shape so
              // buildStatRows below can stay unchanged.
              Promise.resolve(firestoreTopToSM(fsTopScorers.goals)),
              Promise.resolve(firestoreTopToSM(fsTopScorers.assists)),
              Promise.resolve(firestoreTopToSM(fsTopScorers.cards)),
              // Teams: derive from standings when present (covers most leagues).
              // Cup competitions with no league table still hit the proxy.
              Promise.resolve(deriveTeamsFromStandings(fsStandings)),
              // Fixtures: Firestore Match[] → SMFixture[] shim for the mapper.
              Promise.resolve(firestoreFixturesToSM(fsFixturesMatch)),
              // League metadata still needs the proxy for the logo URL —
              // SM uses sharded folder paths we can't construct. Single call.
              fetchSeasonsByLeagueId(leagueId).catch(() => null as null | Record<string, unknown>),
            ])
          : await Promise.all([
              fetchStandings(resolvedSeasonId).catch(() => [] as SMStandingGroup[]),
              fetchTopScorers(resolvedSeasonId, 208).catch(() => [] as SMTopScorer[]),
              fetchTopScorers(resolvedSeasonId, 209).catch(() => [] as SMTopScorer[]),
              fetchTopScorers(resolvedSeasonId, 84).catch(() => [] as SMTopScorer[]),
              fetchTeamsBySeasonId(resolvedSeasonId).catch(() => [] as SMParticipant[]),
              fetchFixturesBySeasonId(resolvedSeasonId).catch(() => [] as SMFixture[]),
              fetchSeasonsByLeagueId(leagueId).catch(() => null as null | Record<string, unknown>),
            ]);

        const apiLeagueLogo = (leagueInfo?.image_path as string | undefined) ?? '';

        if (!mounted.current) return;

        // 3. Map data — dedup standings for multi-stage leagues
        const standings = deduplicateStandings(standingsRaw);

        // Filter out placeholder entries (e.g. "1st ranked" used in bracket draws)
        const realTeams = teamsRaw.filter(p => !p.placeholder);
        // Fall back to deriving teams from standings when the API returns no real teams
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
        for (const t of teams) teamLookup.set(t.id, { name: t.name, logo: t.logo });
        // Also add from standings (covers cases where teams tab is empty)
        for (const s of standings) teamLookup.set(s.teamId, { name: s.teamName, logo: s.teamLogo });

        // Helper to map a raw topscorer array enriched with team lookup
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

        // Goals (type_id=208 filtered at API level; fall back to unfiltered if empty)
        const scorersFallback = topScorersRaw.length === 0
          ? [] : topScorersRaw;
        const topScorers = buildStatRows(scorersFallback);

        // Assists (type_id=209) — stored in `goals` field for UI reuse
        const topAssists = buildStatRows(topAssistsRaw);

        // Cards (type_id=84, yellow cards) — stored in `goals` field for UI reuse
        const topCards = buildStatRows(topCardsRaw);

        // Sort: today/live first, then past matches (most recent first),
        // then future matches (soonest first). Matches 365scores' UX where the
        // current matchday is what the user lands on, scroll up = history,
        // scroll down = upcoming. Previously this was a flat ascending sort
        // which forced the user to scroll all the way down past the August
        // games to find today's match.
        const todayUTC = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const fixtures = fixturesRaw
          .map(mapFixture)
          .sort((a, b) => {
            const dayA = a.date.slice(0, 10);
            const dayB = b.date.slice(0, 10);
            const isTodayA = dayA === todayUTC;
            const isTodayB = dayB === todayUTC;
            const isPastA  = dayA < todayUTC;
            const isPastB  = dayB < todayUTC;

            // Group precedence: today (0) > past (1) > future (2)
            const groupA = isTodayA ? 0 : isPastA ? 1 : 2;
            const groupB = isTodayB ? 0 : isPastB ? 1 : 2;
            if (groupA !== groupB) return groupA - groupB;

            // Within today: chronological (earliest kickoff first)
            if (isTodayA) return new Date(a.date).getTime() - new Date(b.date).getTime();
            // Within past: most recent first (descending)
            if (isPastA)  return new Date(b.date).getTime() - new Date(a.date).getTime();
            // Within future: soonest first (ascending)
            return new Date(a.date).getTime() - new Date(b.date).getTime();
          });

        setData({
          leagueId,
          leagueName: config?.name || leagueName,
          // Prefer the API's real image_path over the constructed URL
          // (SportMonks uses sharded folder paths like /leagues/2/1122.png).
          leagueLogo: apiLeagueLogo || leagueLogo || '',
          country: config?.country || '',
          countryFlag: config?.flag || '',
          seasonId: resolvedSeasonId,
          seasonName: resolvedSeasonName || `${new Date().getFullYear() - 1}/${String(new Date().getFullYear()).slice(2)}`,
          standings,
          topScorers,
          topAssists,
          topCards,
          teams,
          fixtures,
        });
      } catch (err: any) {
        if (!mounted.current) return;
        // Surface full error info to help debug
        // eslint-disable-next-line no-console
        console.warn('useLeagueDetail error for league', leagueId, 'season', seasonId, ':', err?.message, err?.stack?.slice(0, 200));
        setError(err?.message ?? 'Error loading league');
        // Even on partial failure, expose a minimal valid data object so the
        // screen at least renders the league name + a "no data" placeholder
        // instead of an empty wireframe.
        const config = getLeagueConfig(leagueId);
        setData({
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
        if (mounted.current) setLoading(false);
      }
    })();

    return () => { mounted.current = false; };
  }, [leagueId, seasonId]);

  return { data, loading, error };
}
