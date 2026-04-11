// ── useTeamDetail — loads full team data from SportMonks ─────────────────────
import { useState, useEffect, useRef } from 'react';
import {
  fetchTeamById,
  fetchSquad,
  fetchStandings,
  fetchTeamRecentFixtures,
  type SMTeam,
  type SMSquadPlayer,
  type SMStandingGroup,
  type SMFixture,
} from '../services/sportmonks';
import type { LeagueStanding } from '../data/types';

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
  venueName: string;
  venueCapacity: number;
  venueImage?: string;
  leagueId: number;
  leagueName: string;
  currentSeasonId: number | null;
}

export interface SquadPlayer {
  id: number;
  playerId: number;
  name: string;
  displayName: string;
  number: number;
  position: string;
  positionId: number;
  nationality: string;
  age: number;
  image: string;
  isCaptain: boolean;
}

export interface RecentMatch {
  id: number;
  date: string;
  homeName: string;
  homeShort: string;
  homeLogo: string;
  awayName: string;
  awayShort: string;
  awayLogo: string;
  homeScore: number;
  awayScore: number;
  isHome: boolean;
  isFinished: boolean;
  league: string;
  result: 'W' | 'D' | 'L' | null;
}

export interface FormEntry {
  result: 'W' | 'D' | 'L';
}

export interface TeamDetailData {
  info: TeamInfo;
  squad: SquadPlayer[];
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function positionLabel(posId: number): string {
  switch (posId) {
    case 24: return 'POR';
    case 25: return 'DEF';
    case 26: return 'MED';
    case 27: return 'DEL';
    default: return 'JUG';
  }
}

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function getGoals(scores: any[] | undefined, location: 'home' | 'away'): number {
  if (!scores || scores.length === 0) return 0;
  const current = scores.find((s: any) => s.description === 'CURRENT' && s.score.participant === location);
  if (current) return current.score.goals;
  const ft = scores.find((s: any) => (s.description === '2ND_HALF' || s.description === 'FT') && s.score.participant === location);
  return ft?.score.goals ?? 0;
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
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // Fetch team info first to get season data
        const team = await fetchTeamById(teamId);
        if (!mounted.current) return;

        // Determine season ID
        const sId = seasonId
          ?? team.activeSeasons?.find(s => s.is_current)?.id
          ?? team.activeSeasons?.[0]?.id
          ?? null;

        const leagueName = team.activeSeasons?.find(s => s.id === sId)?.name ?? '';
        const leagueId = team.activeSeasons?.find(s => s.id === sId)?.league_id ?? 0;

        // Fetch all data in parallel
        const [squadData, recentData, standingsData] = await Promise.all([
          sId ? fetchSquad(sId, teamId).catch(() => [] as SMSquadPlayer[]) : Promise.resolve([] as SMSquadPlayer[]),
          fetchTeamRecentFixtures(teamId).catch(() => [] as SMFixture[]),
          sId ? fetchStandings(sId).catch(() => [] as SMStandingGroup[]) : Promise.resolve([] as SMStandingGroup[]),
        ]);

        if (!mounted.current) return;

        // Map team info
        const info: TeamInfo = {
          id: team.id,
          name: team.name,
          shortCode: team.short_code || team.name.slice(0, 3).toUpperCase(),
          logo: team.image_path,
          country: '',
          city: team.venue?.city_name ?? '',
          founded: team.founded,
          coach: team.coach?.display_name ?? team.coach?.common_name ?? '',
          coachImage: team.coach?.image_path ?? '',
          venueName: team.venue?.name ?? '',
          venueCapacity: team.venue?.capacity ?? 0,
          venueImage: team.venue?.image_path ?? undefined,
          leagueId,
          leagueName,
          currentSeasonId: sId,
        };

        // Map squad
        const squad: SquadPlayer[] = squadData
          .filter(sp => sp.player)
          .map(sp => ({
            id: sp.id,
            playerId: sp.player_id,
            name: sp.player!.name,
            displayName: sp.player!.display_name || sp.player!.common_name,
            number: sp.jersey_number,
            position: positionLabel(sp.position_id),
            positionId: sp.position_id,
            nationality: '',
            age: sp.player!.date_of_birth ? calculateAge(sp.player!.date_of_birth) : 0,
            image: sp.player!.image_path,
            isCaptain: sp.captain,
          }))
          .sort((a, b) => a.positionId - b.positionId || a.number - b.number);

        // Map recent matches
        const recentMatches: RecentMatch[] = recentData.slice(0, 10).map(f => {
          const home = f.participants?.find(p => p.meta?.location === 'home');
          const away = f.participants?.find(p => p.meta?.location === 'away');
          const homeScore = getGoals(f.scores, 'home');
          const awayScore = getGoals(f.scores, 'away');
          const isHome = home?.id === teamId;
          const isFinished = [5, 9, 10].includes(f.state_id);
          let result: 'W' | 'D' | 'L' | null = null;
          if (isFinished) {
            const gf = isHome ? homeScore : awayScore;
            const ga = isHome ? awayScore : homeScore;
            result = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
          }

          return {
            id: f.id,
            date: f.starting_at.split(' ')[0],
            homeName: home?.name ?? '',
            homeShort: home?.short_code ?? '',
            homeLogo: home?.image_path ?? '',
            awayName: away?.name ?? '',
            awayShort: away?.short_code ?? '',
            awayLogo: away?.image_path ?? '',
            homeScore,
            awayScore,
            isHome,
            isFinished,
            league: f.league?.name ?? '',
            result,
          };
        });

        // Map standings
        const standings: LeagueStanding[] = standingsData
          .map(sg => {
            const p = sg.participant;
            const details = sg.details ?? [];
            const findDetail = (typeId: number) => details.find(d => d.type_id === typeId)?.value ?? 0;
            const won = findDetail(129);
            const drawn = findDetail(130);
            const lost = findDetail(131);
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
                logo: p?.image_path ?? '',
              },
              played, won, drawn, lost,
              goalsFor: gf, goalsAgainst: ga, goalDifference: gd,
              points: sg.points,
            };
          })
          .sort((a, b) => a.position - b.position);

        const teamStanding = standings.find(s => s.team.id === String(teamId)) ?? null;

        // Form (last 5 finished)
        const form: FormEntry[] = recentMatches
          .filter(m => m.result !== null)
          .slice(0, 5)
          .map(m => ({ result: m.result! }));

        setData({ info, squad, recentMatches, standings, teamStanding, form });
        setLoading(false);
      } catch (err) {
        if (!mounted.current) return;
        setError(err instanceof Error ? err.message : 'Error loading team');
        setLoading(false);
      }
    })();
  }, [teamId, seasonId]);

  return { data, loading, error };
}
