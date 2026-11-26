// ── usePlayerDetail — a player's profile and statistics ─────────────────────
//
// Read from `fb_players/{id}` through services/football/teams: the first open
// of a player makes the backend fetch and cache the profile, the statistics of
// the running and previous season (one row per competition) and the clubs of
// the career; later opens are a single document read.
import { useState, useEffect, useRef } from 'react';
import { seasonLabel } from '../services/football/catalog';
import { displayTeam } from '../services/football/base';
import { getPlayer } from '../services/football/teams';
import {
  fbSeasonKey, type FbPlayerDoc, type FbPlayerSeasonStat,
} from '../../functions/src/shared/football/model';

// ── Position helpers ────────────────────────────────────────────────────────

/** Legacy numeric position codes the screen colors by (24 GK · 25 DEF · 26 MID · 27 FWD). */
function positionIdOf(position: string | null): number {
  switch ((position ?? '').toLowerCase()) {
    case 'goalkeeper': return 24;
    case 'defender':   return 25;
    case 'midfielder': return 26;
    case 'attacker':   return 27;
    default:           return 0;
  }
}

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
// The data gives the nationality as an English country name. It is mapped to
// an ISO2 code (NATIONALITY_ISO2 below); ISO2 → flag emoji is a deterministic
// Unicode trick and ISO2 → Spanish name a small static map.

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
 * country name + ISO2 code.
 * Special-cases UK constituent countries which need their non-ISO2 flags.
 */
function resolveCountry(
  country: { name?: string; iso2?: string } | undefined,
): { name: string; flag: string } {
  if (!country) return { name: 'Desconocido', flag: '🏳️' };

  const apiNameLower = (country.name || '').toLowerCase();
  // UK constituent countries come as "England", "Scotland", etc.
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
  starts: number;
  goals: number;
  assists: number;
  minutesPlayed: number;
  yellowCards: number;
  redCards: number;
  rating: number;
  shotsTotal: number;
  shotsOnTarget: number;
  passes: number;
  passAccuracy: number;
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
  /** The player's NATIONAL TEAM, if there is a record of them being
   *  called up. Falls back to undefined when the player has never appeared
   *  in a national team — in that case we still show their nationality
   *  (info.nationality) but render it without a click target. */
  nationalTeamId?: number;
  nationalTeamName?: string;
  nationalTeamLogo?: string;
}

// ── Mapping ─────────────────────────────────────────────────────────────────

function mapSeasonStats(row: FbPlayerSeasonStat): PlayerSeasonStats {
  return {
    seasonId: fbSeasonKey(row.leagueId, row.season),
    seasonName: `${row.league} ${seasonLabel(row.leagueId, row.season)}`.trim(),
    teamId: Number(row.teamId) || 0,
    teamName: row.team,
    teamLogo: row.teamLogo,
    jerseyNumber: row.number,
    appearances: row.appearances,
    starts: row.lineups,
    goals: row.goals,
    assists: row.assists,
    minutesPlayed: row.minutes,
    yellowCards: row.yellow,
    redCards: row.red + row.yellowRed,
    rating: row.rating ? Math.round(row.rating * 10) / 10 : 0,
    shotsTotal: row.shots,
    shotsOnTarget: row.shotsOn,
    passes: row.passes,
    passAccuracy: row.passAccuracy,
    keyPasses: row.keyPasses,
    dribbles: row.dribblesWon,
    tackles: row.tackles,
    interceptions: row.interceptions,
    // Not provided by the data source: hidden by the screen when 0.
    clearances: 0,
    saves: row.saves,
    cleanSheets: 0,
    foulsCommitted: row.foulsCommitted,
    foulsDrawn: row.foulsDrawn,
    duelsWon: row.duelsWon,
    aerialWon: 0,
    crosses: 0,
    offsides: 0,
    penScored: row.penScored,
    penMissed: row.penMissed,
  };
}

/** English nationality → the ISO2 code the country resolver needs. */
const NATIONALITY_ISO2: Record<string, string> = {
  argentina: 'AR', australia: 'AU', austria: 'AT', belgium: 'BE', bolivia: 'BO', brazil: 'BR',
  cameroon: 'CM', canada: 'CA', chile: 'CL', china: 'CN', colombia: 'CO', 'costa rica': 'CR',
  croatia: 'HR', cuba: 'CU', 'czech republic': 'CZ', czechia: 'CZ', denmark: 'DK',
  'dominican republic': 'DO', ecuador: 'EC', egypt: 'EG', 'el salvador': 'SV', spain: 'ES',
  usa: 'US', 'united states': 'US', finland: 'FI', france: 'FR', georgia: 'GE', germany: 'DE',
  ghana: 'GH', greece: 'GR', guatemala: 'GT', guinea: 'GN', haiti: 'HT', honduras: 'HN',
  hungary: 'HU', iceland: 'IS', india: 'IN', indonesia: 'ID', iran: 'IR', iraq: 'IQ',
  ireland: 'IE', 'republic of ireland': 'IE', israel: 'IL', italy: 'IT', 'ivory coast': 'CI',
  "cote d'ivoire": 'CI', jamaica: 'JM', japan: 'JP', 'south korea': 'KR', 'korea republic': 'KR',
  'north korea': 'KP', morocco: 'MA', mali: 'ML', mexico: 'MX', netherlands: 'NL',
  'new zealand': 'NZ', nigeria: 'NG', norway: 'NO', pakistan: 'PK', panama: 'PA', paraguay: 'PY',
  peru: 'PE', philippines: 'PH', poland: 'PL', portugal: 'PT', 'puerto rico': 'PR', qatar: 'QA',
  romania: 'RO', russia: 'RU', 'saudi arabia': 'SA', senegal: 'SN', serbia: 'RS', singapore: 'SG',
  slovakia: 'SK', slovenia: 'SI', 'south africa': 'ZA', sweden: 'SE', switzerland: 'CH',
  thailand: 'TH', tunisia: 'TN', turkey: 'TR', 'türkiye': 'TR', ukraine: 'UA',
  'united arab emirates': 'AE', uruguay: 'UY', venezuela: 'VE', vietnam: 'VN', algeria: 'DZ',
  albania: 'AL', armenia: 'AM', azerbaijan: 'AZ', 'bosnia and herzegovina': 'BA', bulgaria: 'BG',
  cyprus: 'CY', estonia: 'EE', latvia: 'LV', lithuania: 'LT', luxembourg: 'LU', malta: 'MT',
  montenegro: 'ME', moldova: 'MD', 'north macedonia': 'MK', rwanda: 'RW',
};

function mapPlayer(
  p: FbPlayerDoc,
  fallback: { teamName?: string; teamLogo?: string; jerseyNumber?: number },
): PlayerDetailData {
  const history = p.stats.map(mapSeasonStats);
  // "Current" numbers: the competition where he has played most this season
  // for his club (a cup cameo or a national-team call-up shouldn't headline).
  const newest = p.stats[0]?.season;
  const clubRows = p.stats.filter(r => r.season === newest && (!p.currentTeam || r.teamId === p.currentTeam.id));
  const headline = [...(clubRows.length ? clubRows : p.stats.filter(r => r.season === newest))]
    .sort((a, b) => b.appearances - a.appearances || b.minutes - a.minutes)[0];
  const currentStats = headline ? mapSeasonStats(headline) : (history[0] ?? null);

  const nationalityKey = (p.nationality ?? '').toLowerCase();
  const { name: nationalityName, flag: nationalityFlag } = resolveCountry(
    p.nationality ? { name: p.nationality, iso2: NATIONALITY_ISO2[nationalityKey] } : undefined,
  );
  const posId = positionIdOf(p.position);
  const first = p.firstName.split(' ')[0] ?? '';

  const info: PlayerInfo = {
    id: Number(p.id) || 0,
    name: p.name,
    displayName: p.name,
    firstName: p.firstName,
    lastName: p.lastName,
    commonName: first && p.lastName ? `${first} ${p.lastName.split(' ')[0]}` : p.name,
    image: p.photo,
    nationality: nationalityName,
    nationalityFlag,
    nationalityId: 0,
    position: positionName(posId),
    positionShort: positionShort(posId),
    positionId: posId,
    age: p.age ?? 0,
    dateOfBirth: p.birthDate ?? '',
    height: p.heightCm ? `${(p.heightCm / 100).toFixed(2)}m` : '-',
    weight: p.weightKg ? `${p.weightKg}kg` : '-',
    gender: 'male',
  };

  return {
    info,
    currentStats,
    seasonHistory: history,
    jerseyNumber: p.number ?? currentStats?.jerseyNumber ?? fallback.jerseyNumber ?? 0,
    teamId: Number(p.currentTeam?.id) || currentStats?.teamId || 0,
    teamName: p.currentTeam
      ? displayTeam(p.currentTeam.id, p.currentTeam.name).name
      : currentStats?.teamName ?? fallback.teamName ?? '',
    teamLogo: p.currentTeam?.logo ?? currentStats?.teamLogo ?? fallback.teamLogo ?? '',
    leagueName: headline?.league ?? '',
    nationalTeamId: p.nationalTeam ? Number(p.nationalTeam.id) || undefined : undefined,
    nationalTeamName: p.nationalTeam?.name,
    nationalTeamLogo: p.nationalTeam?.logo,
  };
}

/** Shown while loading fails: the name and photo the caller already had. */
function placeholderPlayer(playerId: number, playerName: string, playerImage?: string): PlayerDetailData {
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
    let cancelled = false;
    const alive = () => mounted.current && !cancelled;
    const fallback = { teamName, teamLogo, jerseyNumber };
    setLoading(true);
    setError(null);

    getPlayer(playerId, { onStale: stale => { if (alive()) setData(mapPlayer(stale, fallback)); } })
      .then(player => {
        if (alive()) setData(mapPlayer(player, fallback));
      })
      .catch((err: unknown) => {
        if (!alive()) return;
        const message = err instanceof Error ? err.message : 'Error loading player';
        console.warn('usePlayerDetail error:', message);
        setData(prev => prev ?? {
          ...placeholderPlayer(playerId, playerName, playerImage),
          teamName: teamName ?? '',
          teamLogo: teamLogo ?? '',
          jerseyNumber: jerseyNumber ?? 0,
        });
        setError(message);
      })
      .finally(() => { if (alive()) setLoading(false); });

    return () => { cancelled = true; mounted.current = false; };
  }, [playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error };
}
