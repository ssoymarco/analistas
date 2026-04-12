// ── useLeagueDetail — loads league standings, top scorers, teams & fixtures ──
import { useState, useEffect, useRef } from 'react';
import {
  fetchStandings,
  fetchTopScorers,
  fetchTeamsBySeasonId,
  fetchFixturesByDate,
  fetchSeasonsByLeagueId,
  type SMStandingGroup,
  type SMStandingDetail,
  type SMTopScorer,
  type SMParticipant,
  type SMFixture,
  type SMScore,
} from '../services/sportmonks';
import { getLeagueConfig } from '../config/leagues';

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
        const [standingsRaw, topScorersRaw, teamsRaw, fixturesRaw] = await Promise.all([
          fetchStandings(resolvedSeasonId).catch(() => [] as SMStandingGroup[]),
          fetchTopScorers(resolvedSeasonId).catch(() => [] as SMTopScorer[]),
          fetchTeamsBySeasonId(resolvedSeasonId).catch(() => [] as SMParticipant[]),
          fetchLeagueFixtures(leagueId).catch(() => [] as SMFixture[]),
        ]);

        if (!mounted.current) return;

        // 3. Map data
        const standings = standingsRaw.map(mapStanding).sort((a, b) => a.position - b.position);
        const teams = teamsRaw.map(mapTeam).sort((a, b) => a.name.localeCompare(b.name));

        // Build team lookup for top scorers
        const teamLookup = new Map<number, { name: string; logo: string }>();
        for (const t of teams) teamLookup.set(t.id, { name: t.name, logo: t.logo });
        // Also add from standings
        for (const s of standings) teamLookup.set(s.teamId, { name: s.teamName, logo: s.teamLogo });

        // Only goals (type_id=208 is goals in topscorers endpoint)
        const topScorers = topScorersRaw
          .map((ts, i) => {
            const row = mapTopScorer(ts, i);
            const team = teamLookup.get(ts.participant_id);
            if (team) {
              row.teamName = team.name;
              row.teamLogo = team.logo;
            }
            return row;
          })
          .sort((a, b) => a.position - b.position)
          .slice(0, 20);

        const fixtures = fixturesRaw
          .map(mapFixture)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        setData({
          leagueId,
          leagueName: config?.name || leagueName,
          leagueLogo: leagueLogo || '',
          country: config?.country || '',
          countryFlag: config?.flag || '',
          seasonId: resolvedSeasonId,
          seasonName: resolvedSeasonName || `${new Date().getFullYear() - 1}/${String(new Date().getFullYear()).slice(2)}`,
          standings,
          topScorers,
          teams,
          fixtures,
        });
      } catch (err: any) {
        if (!mounted.current) return;
        console.warn('useLeagueDetail error:', err?.message);
        setError(err?.message ?? 'Error loading league');
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();

    return () => { mounted.current = false; };
  }, [leagueId, seasonId]);

  return { data, loading, error };
}
