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
import {
  getStandingsFromFirestore,
  getRecentFixturesByTeam,
  getTeamFromFirestore,
  getSquadFromFirestore,
} from '../services/firestoreApi';
import { getLeagueConfig } from '../config/leagues';
import { resolveTeamLogo } from '../utils/teamLogoOverrides';
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

// Convert an SMFixture (from the proxy fallback) into the app's Match shape so
// the downstream `recentMatches` mapper can treat all rows uniformly. Only
// runs if the Firestore query errored out — in steady state this code path
// is dead.
const PROXY_FALLBACK_FINISHED_STATES = new Set([5, 9, 10, 11, 17]);
function smFixtureToMatchShim(f: SMFixture): Match {
  const home = f.participants?.find(p => p.meta?.location === 'home');
  const away = f.participants?.find(p => p.meta?.location === 'away');
  const isDateWayPast = new Date(f.starting_at).getTime() < Date.now() - 4 * 3_600_000;
  const isFinished =
    PROXY_FALLBACK_FINISHED_STATES.has(f.state_id) ||
    (isDateWayPast && f.state_id !== 1 && f.state_id !== 13 && f.state_id !== 14);
  return {
    id:           String(f.id),
    homeTeam: {
      id:        String(home?.id ?? 0),
      name:      home?.name ?? '',
      shortName: home?.short_code ?? '',
      logo:      resolveTeamLogo(home?.id, home?.image_path ?? ''),
    },
    awayTeam: {
      id:        String(away?.id ?? 0),
      name:      away?.name ?? '',
      shortName: away?.short_code ?? '',
      logo:      resolveTeamLogo(away?.id, away?.image_path ?? ''),
    },
    homeScore:    getGoals(f.scores, 'home'),
    awayScore:    getGoals(f.scores, 'away'),
    status:       isFinished ? 'finished' : 'scheduled',
    time:         f.starting_at?.slice(11, 16) ?? '',
    league:       f.league?.name ?? '',
    leagueId:     String(f.league_id ?? ''),
    date:         f.starting_at?.slice(0, 10) ?? '',
    startingAtUtc: f.starting_at,
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
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // ── Firestore-first path ──
        // If syncTeams has written this team's doc, we can build the whole
        // TeamDetailData without a single SportMonks call. Fall through to
        // the proxy only when the team isn't yet in Firestore (rare — only
        // happens for teams that aren't in any league in functions/config.ts,
        // OR before the first syncTeams run lands).
        const fsInfo = await getTeamFromFirestore(teamId);
        if (mounted.current && fsInfo) {
          const effSeasonId = seasonId ?? fsInfo.currentSeasonId ?? null;
          const [squadFs, recentMatchesRaw, standingsFs] = await Promise.all([
            effSeasonId
              ? getSquadFromFirestore(effSeasonId, teamId).catch(() => [])
              : Promise.resolve([]),
            getRecentFixturesByTeam(teamId, 25).catch(() => [] as Match[]),
            effSeasonId
              ? getStandingsFromFirestore(effSeasonId).catch(() => [] as LeagueStanding[])
              : Promise.resolve([] as LeagueStanding[]),
          ]);
          if (!mounted.current) return;

          // Only ship the Firestore result if squad OR recent matches came
          // back populated. An empty pair means syncSquads / syncFixtures
          // haven't run for this team yet — drop through to the proxy for
          // a complete page.
          if (squadFs.length > 0 || recentMatchesRaw.length > 0) {
            const recentMatches: RecentMatch[] = recentMatchesRaw.slice(0, 25).map(m => {
              const isHome = m.homeTeam.id === String(teamId);
              const isFinished = m.status === 'finished';
              let result: 'W' | 'D' | 'L' | null = null;
              if (isFinished) {
                const gf = isHome ? m.homeScore : m.awayScore;
                const ga = isHome ? m.awayScore : m.homeScore;
                result = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
              }
              return {
                id:        Number(m.id) || 0,
                date:      m.date,
                homeName:  m.homeTeam.name,
                homeShort: m.homeTeam.shortName,
                homeLogo:  m.homeTeam.logo,
                homeId:    Number(m.homeTeam.id) || 0,
                awayName:  m.awayTeam.name,
                awayShort: m.awayTeam.shortName,
                awayLogo:  m.awayTeam.logo,
                awayId:    Number(m.awayTeam.id) || 0,
                homeScore: m.homeScore,
                awayScore: m.awayScore,
                isHome,
                isFinished,
                league:    m.league,
                result,
              };
            });
            const teamStanding = standingsFs.find(s => s.team.id === String(teamId)) ?? null;
            const form: FormEntry[] = recentMatches
              .filter(rm => rm.result !== null)
              .slice(0, 5)
              .map(rm => ({ result: rm.result! }));
            const info: TeamInfo = {
              ...fsInfo,
              currentSeasonId: effSeasonId,
            };
            setData({
              info,
              squad: squadFs as SquadPlayer[],
              recentMatches,
              standings: standingsFs,
              teamStanding,
              form,
            });
            setLoading(false);
            return;
          }
          // Firestore had the team but no squad/matches — fall through to proxy
        }

        // ── Proxy fallback path ──
        // Reached only when the team isn't in Firestore OR Firestore had
        // the team but no squad/matches (very rare in steady state).
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

        // Fetch all data in parallel.
        //
        // Standings: read from Firestore first (zero SportMonks calls). The
        // syncStandings Cloud Function refreshes `standings/{seasonId}` every
        // hour; if the doc is empty (a brand-new season not yet synced) we
        // fall back to the proxy as a last resort.
        const standingsPromise: Promise<LeagueStanding[]> = effectiveSeasonId
          ? getStandingsFromFirestore(effectiveSeasonId)
              .then(rows => rows.length > 0
                ? rows
                : getStandings(effectiveSeasonId).catch(() => [] as LeagueStanding[])
              )
              .catch(() => effectiveSeasonId
                ? getStandings(effectiveSeasonId).catch(() => [] as LeagueStanding[])
                : Promise.resolve([] as LeagueStanding[])
              )
          : Promise.resolve([] as LeagueStanding[]);

        // Recent fixtures: pull from Firestore matches collection (zero
        // SportMonks calls). The historical crawl wrote ~282k fixtures
        // across every league SM covers; the ongoing syncFixtures keeps
        // ±1 day fresh. Fall back to the proxy only if the Firestore
        // query errors out (rules / network).
        const recentPromise: Promise<Match[]> = getRecentFixturesByTeam(teamId, 25)
          .catch(err => {
            console.warn('[useTeamDetail] Firestore recent fixtures failed, falling back to proxy:', err?.message);
            return fetchTeamRecentFixtures(teamId)
              .then(arr => arr.map(smFixtureToMatchShim))
              .catch(() => [] as Match[]);
          });

        const [squadData, recentMatchesRaw, standings] = await Promise.all([
          effectiveSeasonId ? fetchSquad(effectiveSeasonId, teamId).catch(() => [] as SMSquadPlayer[]) : Promise.resolve([] as SMSquadPlayer[]),
          recentPromise,
          standingsPromise,
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
          logo: resolveTeamLogo(team.id, team.image_path),
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

        // Recent fixtures are already Match[] from Firestore (or the proxy
        // fallback shim). They're sorted desc by kickoff already; just
        // re-clamp to 25 in case the fallback path returned more.
        const sortedRecent = recentMatchesRaw.slice(0, 25);

        // Map recent matches
        const recentMatches: RecentMatch[] = sortedRecent.map(m => {
          const isHome = m.homeTeam.id === String(teamId);
          const isFinished = m.status === 'finished';
          let result: 'W' | 'D' | 'L' | null = null;
          if (isFinished) {
            const gf = isHome ? m.homeScore : m.awayScore;
            const ga = isHome ? m.awayScore : m.homeScore;
            result = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
          }
          // Numeric IDs for backwards compat with the old RecentMatch shape.
          // Match.homeTeam.id is a string; coerce for the screen consumer.
          return {
            id:         Number(m.id) || 0,
            date:       m.date,
            homeName:   m.homeTeam.name,
            homeShort:  m.homeTeam.shortName,
            homeLogo:   m.homeTeam.logo, // already routed through resolveTeamLogo in teamFromDoc
            homeId:     Number(m.homeTeam.id) || 0,
            awayName:   m.awayTeam.name,
            awayShort:  m.awayTeam.shortName,
            awayLogo:   m.awayTeam.logo,
            awayId:     Number(m.awayTeam.id) || 0,
            homeScore:  m.homeScore,
            awayScore:  m.awayScore,
            isHome,
            isFinished,
            league:     m.league,
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
