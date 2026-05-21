// ── useTeamDetail — loads full team data from SportMonks ─────────────────────
import { useState, useEffect, useRef } from 'react';
import {
  fetchTeamById,
  fetchSquad,
  fetchTeamRecentFixtures,
  type SMTeam,
  type SMSquadPlayer,
  type SMFixture,
} from '../services/sportmonks';
import { getStandings } from '../services/sportsApi';
import { getLeagueConfig } from '../config/leagues';
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
  coachAge: number;
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
  clubName: string;
  clubLogo: string;
}

export interface RecentMatch {
  id: number;
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

        // SM returns `activeseasons` (lowercase) — normalize
        const seasons = team.activeSeasons ?? team.activeseasons ?? [];

        // Determine season ID — try multiple fallbacks, with one critical
        // override:  national teams in qualifying competitions usually have
        // both the qualifier season AND the Mundial 2026 season marked as
        // `is_current` in SportMonks. The plain `.find(is_current)` would
        // grab whichever appears first — often the qualifier (e.g. "WC
        // Qualification Europe", Group I for Norway: NOR / ITA / ISR / EST /
        // MDA). The user is browsing a national team page during World Cup
        // season, so they expect the Mundial 2026 group, not the qualifier
        // group. Prefer Mundial 2026 (league_id 732) whenever it appears.
        //
        // If a caller passed `seasonId` explicitly (e.g. from the season
        // picker), that always wins — no override applies.
        const PREFERRED_LEAGUE_IDS = [732]; // FIFA World Cup 2026
        const preferredSeason = seasons.find(
          s => s.is_current && PREFERRED_LEAGUE_IDS.includes(s.league_id),
        );
        const sId = seasonId
          ?? preferredSeason?.id
          ?? seasons.find(s => s.is_current)?.id
          ?? seasons[0]?.id
          ?? null;
        // If still null, try matching league config
        const fallbackLeagueId = seasons[0]?.league_id;
        const fallbackCfg = (!sId && fallbackLeagueId) ? getLeagueConfig(fallbackLeagueId) : null;
        const effectiveSeasonId = sId ?? fallbackCfg?.currentSeasonId ?? null;

        const seasonName = seasons.find(s => s.id === effectiveSeasonId)?.name ?? '';
        const leagueId = seasons.find(s => s.id === effectiveSeasonId)?.league_id ?? 0;
        // Prefer the league display name from our config (e.g. "Mundial 2026") over the
        // raw season name from SportMonks (e.g. "2026" or "2025/26").
        const leagueCfgForName = getLeagueConfig(leagueId);
        const leagueName = leagueCfgForName?.name ?? seasonName;

        // Fetch all data in parallel
        const [squadData, recentData, standings] = await Promise.all([
          effectiveSeasonId ? fetchSquad(effectiveSeasonId, teamId).catch(() => [] as SMSquadPlayer[]) : Promise.resolve([] as SMSquadPlayer[]),
          fetchTeamRecentFixtures(teamId).catch(() => [] as SMFixture[]),
          effectiveSeasonId ? getStandings(effectiveSeasonId).catch(() => [] as LeagueStanding[]) : Promise.resolve([] as LeagueStanding[]),
        ]);

        if (!mounted.current) return;

        // For World Cup national teams, SportMonks often returns incorrect venue data
        // (e.g. Mexico → Soldier Field, Chicago). Suppress the venue for these teams.
        const isWCNationalTeam = leagueId === 732;

        // Extract active coach from coaches array
        const coaches: any[] = (team as any).coaches ?? [];
        const activeCoach = coaches.find((c: any) => c.active !== false) ?? coaches[0] ?? null;
        const coachName = activeCoach
          ? (activeCoach.display_name || activeCoach.common_name || activeCoach.name || '')
          : (team.coach ? (team.coach.display_name || team.coach.common_name || team.coach.name || '') : '');
        const coachImg = activeCoach?.image_path ?? team.coach?.image_path ?? '';
        const coachAge = activeCoach?.date_of_birth
          ? calculateAge(activeCoach.date_of_birth)
          : (team.coach?.date_of_birth ? calculateAge(team.coach.date_of_birth) : 0);

        // Map team info
        const info: TeamInfo = {
          id: team.id,
          name: team.name,
          shortCode: team.short_code || team.name.slice(0, 3).toUpperCase(),
          logo: team.image_path,
          country: '',
          city: isWCNationalTeam ? '' : (team.venue?.city_name ?? ''),
          founded: team.founded,
          coach: coachName,
          coachImage: coachImg,
          coachAge,
          venueName: isWCNationalTeam ? '' : (team.venue?.name ?? ''),
          venueCapacity: isWCNationalTeam ? 0 : (team.venue?.capacity ?? 0),
          venueImage: isWCNationalTeam ? undefined : (team.venue?.image_path ?? undefined),
          leagueId,
          leagueName,
          currentSeasonId: sId,
        };

        // Today's date string for active membership check
        const todayStr = new Date().toISOString().split('T')[0];

        // Map squad
        const squad: SquadPlayer[] = squadData
          .filter(sp => sp.player)
          .map(sp => {
            // Find current club (non-national, active membership)
            const clubMembership = sp.player?.teams?.find(mt =>
              (!mt.end || mt.end > todayStr) &&
              mt.team &&
              mt.team.type !== 'national'
            );
            return {
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
              clubName: clubMembership?.team?.name ?? '',
              clubLogo: clubMembership?.team?.image_path ?? '',
            };
          })
          .sort((a, b) => a.positionId - b.positionId || a.number - b.number);

        // Sort by date descending (most recent first) then take up to 25
        // (covers full tournament windows: WC group + KO + friendlies, etc.)
        const sortedRecent = [...recentData].sort((a, b) => b.starting_at_timestamp - a.starting_at_timestamp);

        // State IDs that definitively mean the match ended
        const FINISHED_STATES = new Set([5, 9, 10, 11, 17]);

        // Map recent matches
        const recentMatches: RecentMatch[] = sortedRecent.slice(0, 25).map(f => {
          const home = f.participants?.find(p => p.meta?.location === 'home');
          const away = f.participants?.find(p => p.meta?.location === 'away');
          const homeScore = getGoals(f.scores, 'home');
          const awayScore = getGoals(f.scores, 'away');
          const isHome = home?.id === teamId;
          // A match is finished if: known finished state, OR the kickoff was >4h ago
          // and the state is not scheduled (1), not live (13/14)
          const isDateWayPast = new Date(f.starting_at).getTime() < Date.now() - 4 * 3_600_000;
          const isFinished =
            FINISHED_STATES.has(f.state_id) ||
            (isDateWayPast && f.state_id !== 1 && f.state_id !== 13 && f.state_id !== 14);

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
            homeId: home?.id ?? 0,
            awayName: away?.name ?? '',
            awayShort: away?.short_code ?? '',
            awayLogo: away?.image_path ?? '',
            awayId: away?.id ?? 0,
            homeScore,
            awayScore,
            isHome,
            isFinished,
            league: f.league?.name ?? '',
            result,
          };
        });

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
