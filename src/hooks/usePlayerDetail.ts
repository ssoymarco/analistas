// ── usePlayerDetail — loads full player data from SportMonks ──────────────────
import { useState, useEffect, useRef } from 'react';
import {
  fetchPlayerById,
  fetchApi,
  type SMPlayer,
} from '../services/sportmonks';

// ── Position helpers ────────────────────────────────────────────────────────

function positionName(posId: number): string {
  switch (posId) {
    case 24: return 'Portero';
    case 25: return 'Defensa';
    case 26: return 'Mediocampista';
    case 27: return 'Delantero';
    default: return 'Jugador';
  }
}

function positionShort(posId: number): string {
  switch (posId) {
    case 24: return 'POR';
    case 25: return 'DEF';
    case 26: return 'MED';
    case 27: return 'DEL';
    default: return 'JUG';
  }
}

// ── Country resolver (ISO2-based) ───────────────────────────────────────────
//
// We previously mapped SportMonks numeric `country_id` → Spanish name + emoji.
// That map was wrong (Griezmann showed as Belgian, Kane as Ivorian) because
// SportMonks numeric IDs don't match the values we'd guessed.
//
// This version uses the COUNTRY OBJECT returned by `?include=nationality`,
// which has a stable `iso2` code. ISO2 → emoji is a deterministic Unicode trick;
// ISO2 → Spanish name is a small static map. Both are reliable and don't depend
// on SportMonks' internal IDs.

/** Spanish country names keyed by ISO2 code. Falls back to API's English name. */
const ISO2_NAME_ES: Record<string, string> = {
  AR: 'Argentina',  AU: 'Australia',  AT: 'Austria',     BE: 'Bélgica',
  BO: 'Bolivia',    BR: 'Brasil',     CA: 'Canadá',      CM: 'Camerún',
  CL: 'Chile',      CN: 'China',      CO: 'Colombia',    CR: 'Costa Rica',
  HR: 'Croacia',    CU: 'Cuba',       CZ: 'Chequia',     DK: 'Dinamarca',
  DO: 'R. Dominicana', EC: 'Ecuador', EG: 'Egipto',      SV: 'El Salvador',
  ES: 'España',     US: 'Estados Unidos', FI: 'Finlandia', FR: 'Francia',
  GE: 'Georgia',    DE: 'Alemania',   GH: 'Ghana',       GR: 'Grecia',
  GT: 'Guatemala',  GN: 'Guinea',     HT: 'Haití',       HN: 'Honduras',
  HU: 'Hungría',    IS: 'Islandia',   IN: 'India',       ID: 'Indonesia',
  IR: 'Irán',       IQ: 'Irak',       IE: 'Irlanda',     IL: 'Israel',
  IT: 'Italia',     CI: 'Costa de Marfil', JM: 'Jamaica', JP: 'Japón',
  KR: 'Corea del Sur', KP: 'Corea del Norte', MA: 'Marruecos', ML: 'Malí',
  MX: 'México',     NL: 'Países Bajos', NZ: 'Nueva Zelanda', NG: 'Nigeria',
  NO: 'Noruega',    PK: 'Pakistán',   PA: 'Panamá',      PY: 'Paraguay',
  PE: 'Perú',       PH: 'Filipinas',  PL: 'Polonia',     PT: 'Portugal',
  PR: 'Puerto Rico',QA: 'Qatar',      RO: 'Rumanía',     RU: 'Rusia',
  SA: 'Arabia Saudita', SN: 'Senegal', RS: 'Serbia',     SG: 'Singapur',
  SK: 'Eslovaquia', SI: 'Eslovenia',  ZA: 'Sudáfrica',   SE: 'Suecia',
  CH: 'Suiza',      TH: 'Tailandia',  TN: 'Túnez',       TR: 'Turquía',
  UA: 'Ucrania',    AE: 'EAU',        UY: 'Uruguay',     VE: 'Venezuela',
  GB: 'Reino Unido', VN: 'Vietnam',   DZ: 'Argelia',     AL: 'Albania',
  AM: 'Armenia',    AZ: 'Azerbaiyán', BA: 'Bosnia',      BG: 'Bulgaria',
  CY: 'Chipre',     EE: 'Estonia',    LV: 'Letonia',     LT: 'Lituania',
  LU: 'Luxemburgo', MT: 'Malta',      ME: 'Montenegro',  MD: 'Moldavia',
  MK: 'Macedonia del Norte', RW: 'Ruanda',
};

/** Special-case flag emojis for the UK constituent countries. */
const SPECIAL_FLAG_BY_NAME: Record<string, string> = {
  england:          '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  scotland:         '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  wales:            '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  'northern ireland': '🏴󠁧󠁢󠁮󠁩󠁲󠁿',
};

const SPECIAL_NAME_ES: Record<string, string> = {
  england:          'Inglaterra',
  scotland:         'Escocia',
  wales:            'Gales',
  'northern ireland': 'Irlanda del Norte',
};

/** Convert an ISO2 code (e.g. "FR") to its flag emoji (🇫🇷). */
function iso2ToFlag(iso2: string): string {
  if (!iso2 || iso2.length !== 2) return '🏳️';
  const upper = iso2.toUpperCase();
  // Each letter A-Z maps to a regional indicator symbol (U+1F1E6..U+1F1FF)
  const cps = upper.split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65);
  return String.fromCodePoint(...cps);
}

/**
 * Resolve a player's country to (Spanish name, flag emoji) using the
 * SportMonks country object returned by `?include=nationality`.
 * Special-cases UK constituent countries which need their non-ISO2 flags.
 */
function resolveCountry(
  country: { name?: string; iso2?: string } | undefined,
): { name: string; flag: string } {
  if (!country) return { name: 'Desconocido', flag: '🏳️' };

  const apiNameLower = (country.name || '').toLowerCase();
  // UK constituent countries: SportMonks names them "England", "Scotland", etc.
  if (SPECIAL_FLAG_BY_NAME[apiNameLower]) {
    return {
      name: SPECIAL_NAME_ES[apiNameLower] || country.name || 'Desconocido',
      flag: SPECIAL_FLAG_BY_NAME[apiNameLower],
    };
  }

  const iso2 = (country.iso2 || '').toUpperCase();
  return {
    name: ISO2_NAME_ES[iso2] || country.name || 'Desconocido',
    flag: iso2 ? iso2ToFlag(iso2) : '🏳️',
  };
}

// ── SM Season Stats interface ───────────────────────────────────────────────
interface SMSeasonStatistic {
  id: number;
  player_id: number;
  team_id: number;
  season_id: number;
  has_values: boolean;
  jersey_number: number | null;
  details?: SMStatDetail[];
  season?: { id: number; name: string };
  team?: { id: number; name: string; short_code: string; image_path: string };
}

interface SMStatDetail {
  id: number;
  player_statistic_id: number;
  type_id: number;
  value: { total?: number; home?: number; away?: number; average?: number } | number;
}

// SM stat type IDs
const STAT_TYPE = {
  APPEARANCES: 321,      // Appearances (lineups)
  GOALS: 52,             // Goals scored
  ASSISTS: 79,           // Assists
  MINUTES_PLAYED: 119,   // Minutes played
  YELLOW_CARDS: 84,      // Yellow cards
  RED_CARDS: 83,         // Red cards
  RATING: 118,           // Average rating
  SHOTS_TOTAL: 42,       // Total shots
  SHOTS_ON_TARGET: 44,   // Shots on target
  PASSES: 80,            // Total passes
  KEY_PASSES: 117,       // Key passes
  DRIBBLES: 86,          // Successful dribbles
  TACKLES: 78,           // Tackles
  INTERCEPTIONS: 100,    // Interceptions
  CLEARANCES: 104,       // Clearances
  SAVES: 57,             // Saves (GK)
  CLEAN_SHEETS: 275,     // Clean sheets (GK)
  FOULS_COMMITTED: 95,   // Fouls committed
  FOULS_DRAWN: 107,      // Fouls drawn
  DUELS_WON: 105,        // Duels won
  AERIAL_WON: 110,       // Aerial duels won
  CROSSES: 99,           // Crosses
  OFFSIDES: 74,          // Offsides
  PEN_SCORED: 48,        // Penalties scored
  PEN_MISSED: 50,        // Penalties missed
};

// ── Extract stat value ──────────────────────────────────────────────────────
function getStatValue(details: SMStatDetail[] | undefined, typeId: number): number {
  if (!details) return 0;
  const d = details.find(s => s.type_id === typeId);
  if (!d) return 0;
  if (typeof d.value === 'number') return d.value;
  return d.value?.total ?? d.value?.average ?? 0;
}

function getStatAvg(details: SMStatDetail[] | undefined, typeId: number): number {
  if (!details) return 0;
  const d = details.find(s => s.type_id === typeId);
  if (!d) return 0;
  if (typeof d.value === 'number') return d.value;
  return d.value?.average ?? d.value?.total ?? 0;
}

// ── Public Types ────────────────────────────────────────────────────────────

export interface PlayerInfo {
  id: number;
  name: string;
  displayName: string;
  firstName: string;
  lastName: string;
  commonName: string;
  image: string;
  nationality: string;
  nationalityFlag: string;
  nationalityId: number;
  position: string;
  positionShort: string;
  positionId: number;
  age: number;
  dateOfBirth: string;
  height: string;
  weight: string;
  gender: string;
}

export interface PlayerSeasonStats {
  seasonId: number;
  seasonName: string;
  teamId: number;
  teamName: string;
  teamLogo: string;
  jerseyNumber: number | null;
  appearances: number;
  goals: number;
  assists: number;
  minutesPlayed: number;
  yellowCards: number;
  redCards: number;
  rating: number;
  shotsTotal: number;
  shotsOnTarget: number;
  passes: number;
  keyPasses: number;
  dribbles: number;
  tackles: number;
  interceptions: number;
  clearances: number;
  saves: number;
  cleanSheets: number;
  foulsCommitted: number;
  foulsDrawn: number;
  duelsWon: number;
  aerialWon: number;
  crosses: number;
  offsides: number;
  penScored: number;
  penMissed: number;
}

export interface PlayerDetailData {
  info: PlayerInfo;
  currentStats: PlayerSeasonStats | null;
  seasonHistory: PlayerSeasonStats[];
  jerseyNumber: number;
  /** The player's CLUB (the team they play for week-to-week). */
  teamId: number;
  teamName: string;
  teamLogo: string;
  leagueName: string;
  /** The player's NATIONAL TEAM, if SportMonks has a record of them being
   *  called up. Falls back to undefined when the player has never appeared
   *  in a national team — in that case we still show their nationality
   *  (info.nationality) but render it without a click target. */
  nationalTeamId?: number;
  nationalTeamName?: string;
  nationalTeamLogo?: string;
}

// ── Fetch enhanced player data ──────────────────────────────────────────────

async function fetchPlayerEnhanced(playerId: number): Promise<SMPlayer & { statistics?: SMSeasonStatistic[] }> {
  return fetchApi<SMPlayer & { statistics?: SMSeasonStatistic[] }>(
    `players/${playerId}`,
    {
      // - statistics.* → season-by-season numbers
      // - nationality  → country object with iso2 + name (replaces the broken numeric-id map)
      // - teams.team   → membership history; lets us find the player's CURRENT CLUB
      //                  and (when called up) their NATIONAL TEAM team_id for navigation
      include: 'statistics.details;statistics.season;statistics.team;nationality;teams.team',
    },
  );
}

// ── Map SM season statistics ────────────────────────────────────────────────

function mapSeasonStats(stat: SMSeasonStatistic): PlayerSeasonStats {
  const d = stat.details;
  return {
    seasonId: stat.season_id,
    seasonName: stat.season?.name ?? `${stat.season_id}`,
    teamId: stat.team_id,
    teamName: stat.team?.name ?? '',
    teamLogo: stat.team?.image_path ?? '',
    jerseyNumber: stat.jersey_number,
    appearances: getStatValue(d, STAT_TYPE.APPEARANCES),
    goals: getStatValue(d, STAT_TYPE.GOALS),
    assists: getStatValue(d, STAT_TYPE.ASSISTS),
    minutesPlayed: getStatValue(d, STAT_TYPE.MINUTES_PLAYED),
    yellowCards: getStatValue(d, STAT_TYPE.YELLOW_CARDS),
    redCards: getStatValue(d, STAT_TYPE.RED_CARDS),
    rating: Math.round(getStatAvg(d, STAT_TYPE.RATING) * 10) / 10,
    shotsTotal: getStatValue(d, STAT_TYPE.SHOTS_TOTAL),
    shotsOnTarget: getStatValue(d, STAT_TYPE.SHOTS_ON_TARGET),
    passes: getStatValue(d, STAT_TYPE.PASSES),
    keyPasses: getStatValue(d, STAT_TYPE.KEY_PASSES),
    dribbles: getStatValue(d, STAT_TYPE.DRIBBLES),
    tackles: getStatValue(d, STAT_TYPE.TACKLES),
    interceptions: getStatValue(d, STAT_TYPE.INTERCEPTIONS),
    clearances: getStatValue(d, STAT_TYPE.CLEARANCES),
    saves: getStatValue(d, STAT_TYPE.SAVES),
    cleanSheets: getStatValue(d, STAT_TYPE.CLEAN_SHEETS),
    foulsCommitted: getStatValue(d, STAT_TYPE.FOULS_COMMITTED),
    foulsDrawn: getStatValue(d, STAT_TYPE.FOULS_DRAWN),
    duelsWon: getStatValue(d, STAT_TYPE.DUELS_WON),
    aerialWon: getStatValue(d, STAT_TYPE.AERIAL_WON),
    crosses: getStatValue(d, STAT_TYPE.CROSSES),
    offsides: getStatValue(d, STAT_TYPE.OFFSIDES),
    penScored: getStatValue(d, STAT_TYPE.PEN_SCORED),
    penMissed: getStatValue(d, STAT_TYPE.PEN_MISSED),
  };
}

// ── Calculate age ───────────────────────────────────────────────────────────

function calcAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

// ── Mock fallback ───────────────────────────────────────────────────────────

function mockPlayerData(playerId: number, playerName: string, playerImage?: string): PlayerDetailData {
  return {
    info: {
      id: playerId,
      name: playerName,
      displayName: playerName,
      firstName: playerName.split(' ')[0],
      lastName: playerName.split(' ').slice(1).join(' '),
      commonName: playerName,
      image: playerImage || '',
      nationality: 'Desconocido',
      nationalityFlag: '🏳️',
      nationalityId: 0,
      position: 'Jugador',
      positionShort: 'JUG',
      positionId: 0,
      age: 0,
      dateOfBirth: '',
      height: '-',
      weight: '-',
      gender: 'male',
    },
    currentStats: null,
    seasonHistory: [],
    jerseyNumber: 0,
    teamId: 0,
    teamName: '',
    teamLogo: '',
    leagueName: '',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// HOOK
// ══════════════════════════════════════════════════════════════════════════════

export function usePlayerDetail(
  playerId: number,
  playerName: string,
  playerImage?: string,
  teamName?: string,
  teamLogo?: string,
  jerseyNumber?: number,
) {
  const [data, setData] = useState<PlayerDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const player = await fetchPlayerEnhanced(playerId);
        if (!mounted.current) return;

        const stats = player.statistics ?? [];
        // Sort seasons most recent first
        const sortedStats = stats
          .map(mapSeasonStats)
          .sort((a, b) => b.seasonId - a.seasonId);

        const currentStats = sortedStats.length > 0 ? sortedStats[0] : null;

        // ── Country resolution via the `nationality` include ──
        // Falls back to `country` if nationality is missing on the response.
        const countryObj = player.nationality ?? player.country;
        const { name: nationalityName, flag: nationalityFlag } = resolveCountry(countryObj);

        // ── Find the current CLUB and the NATIONAL TEAM from `teams.team` ──
        // SportMonks tags each team membership entry with a `team.type` of
        // 'club' / 'national' / 'domestic'. The active club is preferred from
        // the explicit `active === true` flag; if missing, fall back to the
        // most recent `start` date among club entries.
        const memberships = player.teams ?? [];
        const clubMemberships = memberships.filter(m => m.team && m.team.type !== 'national');
        const activeClub =
          clubMemberships.find(m => m.active === true) ??
          [...clubMemberships].sort((a, b) => {
            const aStart = a.start ? Date.parse(a.start) : 0;
            const bStart = b.start ? Date.parse(b.start) : 0;
            return bStart - aStart;
          })[0];

        // National team: any membership where team.type === 'national'.
        // Prefer one whose country_id matches the player's nationality.
        const nationalMemberships = memberships.filter(m => m.team?.type === 'national');
        const nationalTeam =
          nationalMemberships.find(m => m.team?.country_id === player.nationality_id) ??
          nationalMemberships[0];

        // Resolved club info — the activeClub from teams API takes precedence
        // over currentStats.team (which can wrongly be a national team if the
        // player's most recent stat row is a national-team appearance).
        const clubId   = activeClub?.team?.id ?? (currentStats?.teamId ?? 0);
        const clubName = activeClub?.team?.name ?? (currentStats?.teamName ?? teamName ?? '');
        const clubLogo = activeClub?.team?.image_path ?? (currentStats?.teamLogo ?? teamLogo ?? '');

        const info: PlayerInfo = {
          id: player.id,
          name: player.name,
          displayName: player.display_name,
          firstName: player.firstname,
          lastName: player.lastname,
          commonName: player.common_name,
          image: player.image_path,
          nationality: nationalityName,
          nationalityFlag,
          nationalityId: player.nationality_id,
          position: positionName(player.position_id),
          positionShort: positionShort(player.position_id),
          positionId: player.position_id,
          age: player.date_of_birth ? calcAge(player.date_of_birth) : 0,
          dateOfBirth: player.date_of_birth,
          height: player.height ? `${(player.height / 100).toFixed(2)}m` : '-',
          weight: player.weight ? `${player.weight}kg` : '-',
          gender: player.gender,
        };

        setData({
          info,
          currentStats,
          seasonHistory: sortedStats,
          jerseyNumber: activeClub?.jersey_number ?? currentStats?.jerseyNumber ?? jerseyNumber ?? 0,
          teamId: clubId,
          teamName: clubName,
          teamLogo: clubLogo,
          leagueName: '',
          nationalTeamId:   nationalTeam?.team?.id,
          nationalTeamName: nationalTeam?.team?.name,
          nationalTeamLogo: nationalTeam?.team?.image_path,
        });
      } catch (err: any) {
        if (!mounted.current) return;
        console.warn('usePlayerDetail error:', err?.message);
        // Fallback to mock with passed-in info
        setData({
          ...mockPlayerData(playerId, playerName, playerImage),
          teamName: teamName ?? '',
          teamLogo: teamLogo ?? '',
          jerseyNumber: jerseyNumber ?? 0,
        });
        setError(err?.message ?? 'Error loading player');
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();

    return () => { mounted.current = false; };
  }, [playerId]);

  return { data, loading, error };
}
