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

// ── Country flag emoji helper ───────────────────────────────────────────────
function countryIdToFlag(countryId: number): string {
  // Common country IDs in SM → flag emoji (best effort)
  const map: Record<number, string> = {
    17: '🇧🇪', // Belgium
    32: '🇧🇷', // Brazil
    38: '🇨🇲', // Cameroon
    43: '🇨🇱', // Chile
    47: '🇨🇴', // Colombia
    51: '🇭🇷', // Croatia
    56: '🇩🇰', // Denmark
    62: '🇬🇧', // England
    320: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', // England alt
    64: '🇪🇸', // Spain
    67: '🇫🇷', // France
    77: '🇩🇪', // Germany
    83: '🇬🇭', // Ghana
    98: '🇮🇹', // Italy
    118: '🇲🇽', // Mexico
    125: '🇳🇱', // Netherlands
    130: '🇳🇬', // Nigeria
    135: '🇳🇴', // Norway
    141: '🇵🇱', // Poland
    144: '🇵🇹', // Portugal
    164: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', // Scotland
    175: '🇸🇪', // Sweden
    178: '🇨🇭', // Switzerland
    203: '🇺🇸', // USA
    205: '🇺🇾', // Uruguay
    211: '🇦🇷', // Argentina
    214: '🇯🇵', // Japan
    219: '🇰🇷', // South Korea
    220: '🇦🇺', // Australia
    321: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', // Wales
    322: '🏴󠁧󠁢󠁮󠁩󠁲󠁿', // Northern Ireland
    327: '🇮🇪', // Ireland
    381: '🇪🇨', // Ecuador
    382: '🇵🇾', // Paraguay
    383: '🇵🇪', // Peru
    384: '🇻🇪', // Venezuela
    385: '🇧🇴', // Bolivia
    462: '🇨🇮', // Ivory Coast
    463: '🇸🇳', // Senegal
    464: '🇲🇱', // Mali
    480: '🇪🇬', // Egypt
    481: '🇹🇳', // Tunisia
    482: '🇲🇦', // Morocco
    483: '🇩🇿', // Algeria
  };
  return map[countryId] || '🏳️';
}

function countryIdToName(countryId: number): string {
  const map: Record<number, string> = {
    17: 'Bélgica', 32: 'Brasil', 38: 'Camerún', 43: 'Chile', 47: 'Colombia',
    51: 'Croacia', 56: 'Dinamarca', 62: 'Inglaterra', 320: 'Inglaterra',
    64: 'España', 67: 'Francia', 77: 'Alemania', 83: 'Ghana', 98: 'Italia',
    118: 'México', 125: 'Países Bajos', 130: 'Nigeria', 135: 'Noruega',
    141: 'Polonia', 144: 'Portugal', 164: 'Escocia', 175: 'Suecia',
    178: 'Suiza', 203: 'Estados Unidos', 205: 'Uruguay', 211: 'Argentina',
    214: 'Japón', 219: 'Corea del Sur', 220: 'Australia',
    321: 'Gales', 322: 'Irlanda del Norte', 327: 'Irlanda',
    381: 'Ecuador', 382: 'Paraguay', 383: 'Perú', 384: 'Venezuela',
    385: 'Bolivia', 462: 'Costa de Marfil', 463: 'Senegal', 464: 'Malí',
    480: 'Egipto', 481: 'Túnez', 482: 'Marruecos', 483: 'Argelia',
  };
  return map[countryId] || 'Desconocido';
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
  teamId: number;
  teamName: string;
  teamLogo: string;
  leagueName: string;
}

// ── Fetch enhanced player data ──────────────────────────────────────────────

async function fetchPlayerEnhanced(playerId: number): Promise<SMPlayer & { statistics?: SMSeasonStatistic[] }> {
  return fetchApi<SMPlayer & { statistics?: SMSeasonStatistic[] }>(
    `players/${playerId}`,
    { include: 'statistics.details;statistics.season;statistics.team' },
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

        const info: PlayerInfo = {
          id: player.id,
          name: player.name,
          displayName: player.display_name,
          firstName: player.firstname,
          lastName: player.lastname,
          commonName: player.common_name,
          image: player.image_path,
          nationality: countryIdToName(player.nationality_id),
          nationalityFlag: countryIdToFlag(player.nationality_id),
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
          jerseyNumber: currentStats?.jerseyNumber ?? jerseyNumber ?? 0,
          teamId: currentStats?.teamId ?? 0,
          teamName: currentStats?.teamName ?? teamName ?? '',
          teamLogo: currentStats?.teamLogo ?? teamLogo ?? '',
          leagueName: '',
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
