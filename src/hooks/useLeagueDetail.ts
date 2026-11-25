// ── useLeagueDetail — a league's table, top players, teams and calendar ──────
//
// Everything comes from Firestore through services/football/leagueData:
//   • standings / top players — kept fresh by the backend for the big leagues,
//     fetched on demand for any other league or past season;
//   • the season calendar — one cached document per league-season, overlaid
//     with today's live scores.
//
// `seasonId` is a season key (league id × 10000 + season year). Without one,
// the league's current season from the catalog is used.
import { useState, useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { getLeagueConfig } from '../config/leagues';
import { AppCache, CacheTTL } from '../services/cache';
import {
  getCurrentSeasonId, parseSeasonId, peekCatalogEntry, peekCurrentSeasonId, peekLeagueLogo, seasonLabel,
} from '../services/football/catalog';
import {
  getSeasonFixtures, getStandings, getTopPlayers, type TopPlayersByCategory,
} from '../services/football/leagueData';
import type { TopPlayerRow } from '../services/football/mappers';
import { parseRound, stageNameOf } from '../services/football/rounds';
import type { LeagueStanding, Match } from '../data/types';

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
  /** Table index for leagues with several tables (conferences, groups). Null for a single table. */
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
  /** Kickoff as "YYYY-MM-DD HH:MM:SS" in UTC. */
  date: string;
  homeTeamId: number;
  homeTeamName: string;
  homeTeamLogo: string;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamLogo: string;
  homeScore: number | null;
  awayScore: number | null;
  /** Live label ("67'", "HT") while in play; the provider status code otherwise. */
  stateShort: string;
  status: 'live' | 'finished' | 'scheduled';
  seasonId: number;
  leagueId: number;
  /** Stage the fixture is listed under: "Apertura", "Group Stage", "Apertura - Quarter-finals". */
  stageName: string;
  /** Matchday within the stage, e.g. "17" (empty for knockout rounds). */
  roundName: string;
  /** Chronological order of the stage within the season. */
  stageSortOrder: number;
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
  topAssists: TopScorerRow[];
  topCards: TopScorerRow[];
  teams: LeagueTeam[];
  fixtures: LeagueFixture[];
  /** True once standings/top players arrived (cache or network). Until then
   *  the UI shows "loading", not "not available". */
  metaLoaded?: boolean;
}

// ── Mapping ────────────────────────────────────────────────────────────────

function toStandingRow(s: LeagueStanding): LeagueStandingRow {
  return {
    position: s.position,
    teamId: Number(s.team.id) || 0,
    teamName: s.team.name,
    teamLogo: s.team.logo,
    teamShortCode: s.team.shortName,
    played: s.played,
    won: s.won,
    drawn: s.drawn,
    lost: s.lost,
    goalsFor: s.goalsFor,
    goalsAgainst: s.goalsAgainst,
    goalDifference: s.goalDifference,
    points: s.points,
    groupId: s.groupId ?? null,
  };
}

/** Legacy category codes some views still switch on (goals / assists / yellow cards). */
const TOP_TYPE = { goals: 208, assists: 209, cards: 84 } as const;

function toTopRows(rows: TopPlayerRow[], typeId: number): TopScorerRow[] {
  return rows.slice(0, 20).map((r, i) => ({
    position: r.position || i + 1,
    playerId: Number(r.playerId) || 0,
    playerName: r.playerName,
    playerImage: r.playerImage,
    teamId: Number(r.teamId) || 0,
    teamName: r.teamName,
    teamLogo: r.teamLogo,
    goals: r.goals,
    typeId,
  }));
}

/** Matches → calendar rows, tagging each with its stage and the stage's chronological order. */
function toFixtures(matches: Match[], seasonId: number): LeagueFixture[] {
  const stageOrder = new Map<string, number>();
  const sorted = [...matches].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  for (const m of sorted) {
    const stage = stageNameOf(m.roundLabel);
    if (!stageOrder.has(stage)) stageOrder.set(stage, stageOrder.size);
  }
  return sorted.map(m => {
    const stage = stageNameOf(m.roundLabel);
    const round = parseRound(m.roundLabel);
    const inPlay = m.status === 'live' || m.status === 'interrupted';
    const played = m.status !== 'scheduled' && m.stateId === undefined;
    return {
      id: Number(m.id) || 0,
      date: m.startingAtUtc ?? '',
      homeTeamId: Number(m.homeTeam.id) || 0,
      homeTeamName: m.homeTeam.name,
      homeTeamLogo: m.homeTeam.logo,
      awayTeamId: Number(m.awayTeam.id) || 0,
      awayTeamName: m.awayTeam.name,
      awayTeamLogo: m.awayTeam.logo,
      homeScore: played ? m.homeScore : null,
      awayScore: played ? m.awayScore : null,
      stateShort: inPlay ? (m.time || m.statusShort || '') : (m.statusShort ?? 'NS'),
      status: inPlay ? 'live' : m.status === 'finished' && played ? 'finished' : 'scheduled',
      seasonId,
      leagueId: Number(m.leagueId) || 0,
      stageName: stage,
      roundName: round.number !== null ? String(round.number) : '',
      stageSortOrder: stageOrder.get(stage) ?? 0,
    };
  });
}

function teamsFromStandings(rows: LeagueStandingRow[]): LeagueTeam[] {
  const seen = new Set<number>();
  const teams: LeagueTeam[] = [];
  for (const s of rows) {
    if (!s.teamId || seen.has(s.teamId)) continue;
    seen.add(s.teamId);
    teams.push({ id: s.teamId, name: s.teamName, shortCode: s.teamShortCode, logo: s.teamLogo });
  }
  return teams;
}

function teamsFromFixtures(fixtures: LeagueFixture[]): LeagueTeam[] {
  const byId = new Map<number, LeagueTeam>();
  for (const f of fixtures) {
    if (f.homeTeamId && !byId.has(f.homeTeamId)) {
      byId.set(f.homeTeamId, { id: f.homeTeamId, name: f.homeTeamName, shortCode: '', logo: f.homeTeamLogo });
    }
    if (f.awayTeamId && !byId.has(f.awayTeamId)) {
      byId.set(f.awayTeamId, { id: f.awayTeamId, name: f.awayTeamName, shortCode: '', logo: f.awayTeamLogo });
    }
  }
  return [...byId.values()];
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
    setData(null);

    const config = getLeagueConfig(leagueId);
    const emptyData = (resolvedSeasonId: number): LeagueDetailData => ({
      leagueId,
      leagueName: config?.name || leagueName,
      leagueLogo: peekLeagueLogo(leagueId) || leagueLogo || '',
      country: config?.country || peekCatalogEntry(leagueId)?.c || '',
      countryFlag: config?.flag || '',
      seasonId: resolvedSeasonId,
      seasonName: '',
      standings: [],
      topScorers: [],
      topAssists: [],
      topCards: [],
      teams: [],
      fixtures: [],
    });

    // Defer until the navigation animation completes so the transition doesn't
    // compete with Firestore reads and list processing.
    const task = InteractionManager.runAfterInteractions(() => {
      (async () => {
        try {
          const resolvedSeasonId = seasonId ?? (await getCurrentSeasonId(leagueId));
          if (!resolvedSeasonId) {
            if (cancelled) return;
            setError('No se encontró la temporada actual');
            setData({ ...emptyData(0), metaLoaded: true });
            setLoading(false);
            return;
          }
          const key = parseSeasonId(resolvedSeasonId);
          const base = (): LeagueDetailData => ({
            ...emptyData(resolvedSeasonId),
            seasonName: key ? seasonLabel(leagueId, key.season) : '',
          });
          const merge = (prev: LeagueDetailData | null, slice: Partial<LeagueDetailData>): LeagueDetailData =>
            ({ ...(prev ?? base()), ...slice });

          // Table + top players and the calendar are independent reads: start
          // both now. Leagues open on the table, cups on the calendar — neither
          // should wait for the other.
          const metaPromise = Promise.all([
            getStandings(resolvedSeasonId).catch(() => [] as LeagueStanding[]),
            getTopPlayers(resolvedSeasonId).catch((): TopPlayersByCategory => ({ goals: [], assists: [], cards: [] })),
          ] as const);
          const fixturesPromise = getSeasonFixtures(resolvedSeasonId).catch(() => [] as Match[]);

          // Stale-while-revalidate: paint what we showed last time at once.
          type CachedMeta = Pick<LeagueDetailData, 'standings' | 'topScorers' | 'topAssists' | 'topCards' | 'teams'>;
          const metaKey = `fb_league_meta_v1_${resolvedSeasonId}`;
          const fixturesKey = `fb_league_fixtures_v1_${resolvedSeasonId}`;
          AppCache.get<CachedMeta>(metaKey).then(cachedMeta => {
            if (!cachedMeta || cancelled) return;
            setData(prev => (prev?.metaLoaded ? prev : merge(prev, { ...cachedMeta, metaLoaded: true })));
          }).catch(() => {});
          AppCache.get<LeagueFixture[]>(fixturesKey).then(cachedFixtures => {
            if (!cachedFixtures?.length || cancelled) return;
            setData(prev => (prev?.fixtures.length ? prev : merge(prev, { fixtures: cachedFixtures })));
            setLoading(false);
          }).catch(() => {});

          const fixtures = toFixtures(await fixturesPromise, resolvedSeasonId);
          if (cancelled) return;
          setData(prev => merge(prev, { fixtures }));
          setLoading(false);
          if (fixtures.length > 0) {
            const ttl = fixtures.some(f => f.status === 'live') ? CacheTTL.fixturesLive : CacheTTL.fixturesStatic;
            AppCache.set(fixturesKey, fixtures, ttl).catch(() => {});
          }

          const [standingsRaw, top] = await metaPromise;
          if (cancelled) return;
          const standings = standingsRaw.map(toStandingRow);
          const fromTable = teamsFromStandings(standings);
          const teams = (fromTable.length ? fromTable : teamsFromFixtures(fixtures))
            .sort((a, b) => a.name.localeCompare(b.name));
          const meta: CachedMeta = {
            standings,
            topScorers: toTopRows(top.goals, TOP_TYPE.goals),
            topAssists: toTopRows(top.assists, TOP_TYPE.assists),
            topCards: toTopRows(top.cards, TOP_TYPE.cards),
            teams,
          };
          setData(prev => merge(prev, { ...meta, metaLoaded: true }));
          AppCache.set(metaKey, meta, CacheTTL.detailScheduled).catch(() => {});
        } catch (err: unknown) {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : 'Error loading league';
          console.warn('useLeagueDetail error for league', leagueId, 'season', seasonId, ':', message);
          setError(message);
          // Expose a minimal valid object so the screen renders the league
          // name + an empty state instead of an eternal skeleton.
          setData(prev => prev ?? { ...emptyData(seasonId ?? peekCurrentSeasonId(leagueId) ?? 0), metaLoaded: true });
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [leagueId, seasonId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error };
}
