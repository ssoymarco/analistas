// ── useTeamDetail — a team's page: profile, squad, calendar, table, form ─────
//
// All from Firestore through services/football:
//   • fb_teams/{id}                 identity, stadium, coach, squad, competitions
//   • fb_team_fixtures/{id}_{season} the whole season in every competition
//   • fb_standings                  the table of the team's main league
// The first open of a team makes the backend fetch and cache it; later opens
// (by anyone) are plain document reads.
//
// `seasonId` (optional) is a season key: league id × 10000 + season year.
import { useState, useEffect, useRef } from 'react';
import { getLeagueConfig } from '../config/leagues';
import { parseSeasonId } from '../services/football/catalog';
import { getStandings } from '../services/football/leagueData';
import { currentSeasonLabels, getTeam, getTeamFixtures } from '../services/football/teams';
import { localizeCityName } from '../utils/cityI18n';
import { translateLeagueCountry } from '../utils/nationalTeams';
import { fbSeasonKey, type FbTeamDoc } from '../../functions/src/shared/football/model';
import type { LeagueStanding, Match } from '../data/types';

// ── Public types ────────────────────────────────────────────────────────────

export interface TeamInfo {
  id: number;
  name: string;
  shortCode: string;
  logo: string;
  country: string;
  city: string;
  founded: number;
  coach: string;
  coachImage: string;
  coachAge: number;
  /** Coach id — opens the coach profile. */
  coachId?: number;
  venueName: string;
  venueCapacity: number;
  venueImage?: string;
  /** The team's main competition (its domestic league for clubs). */
  leagueId: number;
  leagueName: string;
  /** Season key of that competition's current season. */
  currentSeasonId: number | null;
  /** True for national teams. */
  national?: boolean;
}

export interface SquadPlayer {
  id: number;
  playerId: number;
  name: string;
  displayName: string;
  number: number;
  /** POR | DEF | MED | DEL | JUG */
  position: string;
  /** Sort rank of the position (goalkeepers first). */
  positionId: number;
  nationality: string;
  age: number;
  dateOfBirth?: string;
  image: string;
  isCaptain: boolean;
  clubName: string;
  clubLogo: string;
}

export interface RecentMatch {
  id: number;
  /** Device-local date, "YYYY-MM-DD". */
  date: string;
  homeName: string;
  homeShort: string;
  homeLogo: string;
  homeId: number;
  awayName: string;
  awayShort: string;
  awayLogo: string;
  awayId: number;
  homeScore: number;
  awayScore: number;
  isHome: boolean;
  isFinished: boolean;
  league: string;
  result: 'W' | 'D' | 'L' | null;
  /** The full match, for navigation into the match screen. */
  match?: Match;
}

export interface FormEntry {
  result: 'W' | 'D' | 'L';
}

export interface TeamDetailData {
  info: TeamInfo;
  squad: SquadPlayer[];
  /** The team's season, chronological (played first, then upcoming). */
  recentMatches: RecentMatch[];
  standings: LeagueStanding[];
  teamStanding: LeagueStanding | null;
  form: FormEntry[];
}

interface UseTeamDetailResult {
  data: TeamDetailData | null;
  loading: boolean;
  error: string | null;
}

// ── Mapping ─────────────────────────────────────────────────────────────────

const POSITION_RANK: Record<string, number> = { POR: 24, DEF: 25, MED: 26, DEL: 27, JUG: 28 };

function toInfo(team: FbTeamDoc, leagueId: number, leagueName: string, seasonKey: number | null): TeamInfo {
  const national = !!team.national;
  return {
    id: Number(team.id) || 0,
    name: team.name,
    shortCode: team.shortName,
    logo: team.logo,
    country: team.country ? translateLeagueCountry(team.country) : '',
    // National teams have no home ground or home city.
    city: national || !team.venue?.city ? '' : localizeCityName(team.venue.city),
    founded: team.founded ?? 0,
    coach: team.coach?.name ?? '',
    coachImage: team.coach?.photo ?? '',
    coachAge: team.coach?.age ?? 0,
    coachId: team.coach ? Number(team.coach.id) || undefined : undefined,
    venueName: national ? '' : (team.venue?.name ?? ''),
    venueCapacity: national ? 0 : (team.venue?.capacity ?? 0),
    venueImage: national ? undefined : (team.venue?.image ?? undefined),
    leagueId,
    leagueName,
    currentSeasonId: seasonKey,
    national,
  };
}

function toSquad(team: FbTeamDoc): SquadPlayer[] {
  return team.squad.map(p => ({
    id: Number(p.id) || 0,
    playerId: Number(p.id) || 0,
    name: p.name,
    displayName: p.name,
    number: p.number ?? 0,
    position: p.position,
    positionId: POSITION_RANK[p.position] ?? 28,
    nationality: '',
    age: p.age ?? 0,
    image: p.photo,
    isCaptain: false,
    clubName: '',
    clubLogo: '',
  }));
}

function toRecentMatch(m: Match, teamId: string): RecentMatch {
  const isHome = m.homeTeam.id === teamId;
  // Postponed / cancelled fixtures are "finished" for the clock but weren't played.
  const isFinished = m.status === 'finished' && m.stateId === undefined;
  let result: RecentMatch['result'] = null;
  if (isFinished) {
    const gf = isHome ? m.homeScore : m.awayScore;
    const ga = isHome ? m.awayScore : m.homeScore;
    if (gf !== ga) result = gf > ga ? 'W' : 'L';
    else if (typeof m.homePenScore === 'number' && typeof m.awayPenScore === 'number' && m.homePenScore !== m.awayPenScore) {
      const won = isHome ? m.homePenScore > m.awayPenScore : m.awayPenScore > m.homePenScore;
      result = won ? 'W' : 'L';
    } else result = 'D';
  }
  return {
    id: Number(m.id) || 0,
    date: m.date,
    homeName: m.homeTeam.name,
    homeShort: m.homeTeam.shortName,
    homeLogo: m.homeTeam.logo,
    homeId: Number(m.homeTeam.id) || 0,
    awayName: m.awayTeam.name,
    awayShort: m.awayTeam.shortName,
    awayLogo: m.awayTeam.logo,
    awayId: Number(m.awayTeam.id) || 0,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    isHome,
    isFinished,
    league: m.league,
    result,
    match: m,
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTeamDetail(teamId: number, seasonId?: number): UseTeamDetailResult {
  const [data, setData] = useState<TeamDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    const alive = () => mounted.current && !cancelled;
    setLoading(true);
    setError(null);
    setData(null);

    const build = async (team: FbTeamDoc, withExtras: boolean) => {
      // Which competition/season the page is about. A club is always shown in
      // its own league — opening América from a Champions Cup match must not
      // turn the cup into "its league". The caller's season only applies when
      // it is that same league (an older season picked in the league screen)
      // or the team is a national team (seen from the World Cup, a qualifier…).
      const primaryLeagueId = Number(team.primaryLeagueId) || 0;
      const requested = parseSeasonId(seasonId);
      const useRequested = !!requested && (team.national || !primaryLeagueId || requested.leagueId === primaryLeagueId);
      const leagueId = useRequested ? requested!.leagueId : primaryLeagueId;
      const season = (useRequested ? requested!.season : team.season) ?? null;
      const seasonKey = leagueId && season ? fbSeasonKey(leagueId, season) : null;
      // The calendar: every competition the team is playing now — or, for an
      // older season of its league, that season alone.
      const historical = useRequested && !team.national && !!team.season && season !== team.season;
      const calendarSeasons = historical || !team.season
        ? (season ? [season] : [])
        : [...new Set([...(season ? [season] : []), ...currentSeasonLabels(team)])].slice(0, 3);
      const leagueName = getLeagueConfig(leagueId)?.name
        ?? team.leagues.find(l => Number(l.leagueId) === leagueId)?.name
        ?? team.primaryLeagueName ?? '';
      const info = toInfo(team, leagueId, leagueName, seasonKey);
      const squad = toSquad(team);

      if (!withExtras) {
        if (alive()) setData(prev => prev ?? { info, squad, recentMatches: [], standings: [], teamStanding: null, form: [] });
        return;
      }

      const [fixtures, standings] = await Promise.all([
        calendarSeasons.length
          ? getTeamFixtures(teamId, calendarSeasons).catch(() => [] as Match[])
          : Promise.resolve([] as Match[]),
        seasonKey ? getStandings(seasonKey).catch(() => [] as LeagueStanding[]) : Promise.resolve([] as LeagueStanding[]),
      ]);
      if (!alive()) return;

      const id = String(teamId);
      const recentMatches = fixtures.map(m => toRecentMatch(m, id));
      const teamStanding = standings.find(s => s.team.id === id) ?? null;
      // Chronological list → the five most recent results are at the end.
      const form: FormEntry[] = recentMatches
        .filter(rm => rm.result !== null)
        .slice(-5)
        .map(rm => ({ result: rm.result! }));

      setData({ info, squad, recentMatches, standings, teamStanding, form });
      setLoading(false);
    };

    (async () => {
      try {
        // A stale copy paints the header and squad at once while the refresh runs.
        const team = await getTeam(teamId, { onStale: stale => { build(stale, false).catch(() => {}); } });
        if (!alive()) return;
        await build(team, true);
      } catch (err) {
        if (!alive()) return;
        setError(err instanceof Error ? err.message : 'Error loading team');
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [teamId, seasonId]);

  return { data, loading, error };
}
