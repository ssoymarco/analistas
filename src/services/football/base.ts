/**
 * football/base.ts
 *
 * Small pure helpers shared by the football data layer: provider status codes,
 * local-time handling and team short names. No imports beyond the app types.
 */

import type { MatchStatus } from '../../data/types';
import { seniorNameOf, youthOf } from '../../../functions/src/shared/football/youth';
import { POPULAR_TEAMS } from './popular';

// ── Status ───────────────────────────────────────────────────────────────────

const LIVE_SHORT = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE']);
const FINISHED_SHORT = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
const HALTED_SHORT = new Set(['SUSP', 'INT']);

/** Dead-state codes understood by utils/deadState.ts (label "Aplazado" / "Cancelado"). */
export const DEAD_STATE_ID: Record<string, number> = { PST: 10, CANC: 12, ABD: 15 };

export function statusFromShort(short: string): MatchStatus {
  if (LIVE_SHORT.has(short)) return 'live';
  if (FINISHED_SHORT.has(short)) return 'finished';
  if (HALTED_SHORT.has(short)) return 'interrupted';
  // Postponed / cancelled / abandoned are terminal for the UI: no clock, no
  // countdown. deadState.ts turns them into the honest label via `stateId`.
  if (short in DEAD_STATE_ID) return 'finished';
  return 'scheduled'; // TBD, NS
}

export function stateLabelFromShort(short: string): string | undefined {
  switch (short) {
    case '1H':   return '1T';
    case 'HT':   return 'HT';
    case '2H':   return '2T';
    case 'ET':   return 'ET';
    case 'BT':   return 'ETB'; // break before / between extra-time halves
    case 'P':    return 'PEN';
    case 'SUSP': return 'SUSP';
    case 'INT':  return 'INT';
    default:     return undefined;
  }
}

// ── Dates ────────────────────────────────────────────────────────────────────

export const pad = (n: number) => String(n).padStart(2, '0');

/** Device-local calendar day of a kickoff, "YYYY-MM-DD". */
export function localDateOf(timestampSec: number): string {
  const d = new Date(timestampSec * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Device-local kickoff time, "HH:MM" (24 h — formatMatchTime adapts it for display). */
export function localTimeOf(timestampSec: number): string {
  const d = new Date(timestampSec * 1000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Kickoff as "YYYY-MM-DD HH:MM:SS" in UTC — the format `Match.startingAtUtc` consumers parse. */
export function utcStringOf(timestampSec: number): string {
  return new Date(timestampSec * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

/** [start, end) of a device-local day in unix seconds. */
export function localDayRange(localDate: string): { start: number; end: number } {
  const [y, m, d] = localDate.split('-').map(Number);
  const start = Math.floor(new Date(y, m - 1, d, 0, 0, 0).getTime() / 1000);
  const end = Math.floor(new Date(y, m - 1, d + 1, 0, 0, 0).getTime() / 1000);
  return { start, end };
}

// ── Teams ────────────────────────────────────────────────────────────────────

/**
 * FIFA 3-letter codes of national teams, keyed by the English name the data
 * uses. The app keys national-team colors and flag emoji by this code
 * (utils/teamColors.ts), and the data only ships it for some endpoints — so
 * national teams get it from here, and so do their youth sides ("Mexico U17" →
 * MEX). Clubs and women's teams ("Mexico W") keep their derived short name.
 */
const NATIONAL_TEAM_CODES: Record<string, string> = {
  // UEFA
  'France': 'FRA', 'Belgium': 'BEL', 'Sweden': 'SWE', 'Norway': 'NOR', 'Spain': 'ESP',
  'Germany': 'GER', 'Portugal': 'POR', 'Italy': 'ITA', 'Netherlands': 'NED', 'England': 'ENG',
  'Croatia': 'CRO', 'Denmark': 'DEN', 'Switzerland': 'SUI', 'Poland': 'POL', 'Czechia': 'CZE',
  'Czech Republic': 'CZE', 'Serbia': 'SRB', 'Austria': 'AUT', 'Scotland': 'SCO', 'Wales': 'WAL',
  'Turkey': 'TUR', 'Türkiye': 'TUR', 'Ukraine': 'UKR', 'Greece': 'GRE', 'Hungary': 'HUN',
  'Romania': 'ROU', 'Slovakia': 'SVK', 'Slovenia': 'SVN', 'Finland': 'FIN', 'Iceland': 'ISL',
  'Ireland': 'IRL', 'Rep. Of Ireland': 'IRL', 'Northern Ireland': 'NIR', 'Albania': 'ALB',
  'Georgia': 'GEO', 'Bosnia & Herzegovina': 'BIH', 'Bosnia and Herzegovina': 'BIH',
  // CONMEBOL
  'Argentina': 'ARG', 'Brazil': 'BRA', 'Uruguay': 'URU', 'Colombia': 'COL', 'Ecuador': 'ECU',
  'Peru': 'PER', 'Chile': 'CHI', 'Paraguay': 'PAR', 'Bolivia': 'BOL', 'Venezuela': 'VEN',
  // CONCACAF
  'Mexico': 'MEX', 'USA': 'USA', 'United States': 'USA', 'Canada': 'CAN', 'Costa Rica': 'CRC',
  'Panama': 'PAN', 'Honduras': 'HON', 'Jamaica': 'JAM', 'El Salvador': 'SLV', 'Guatemala': 'GUA',
  'Haiti': 'HAI', 'Cuba': 'CUB', 'Trinidad and Tobago': 'TRI', 'Curaçao': 'CUW', 'Curacao': 'CUW',
  // CAF
  'Senegal': 'SEN', 'Ivory Coast': 'CIV', 'Morocco': 'MAR', 'Ghana': 'GHA', 'Cameroon': 'CMR',
  'Nigeria': 'NGA', 'Egypt': 'EGY', 'Tunisia': 'TUN', 'Algeria': 'ALG', 'South Africa': 'RSA',
  'Mali': 'MLI', 'Cape Verde Islands': 'CPV', 'Cape Verde': 'CPV', 'Congo DR': 'COD',
  // AFC / OFC
  'Japan': 'JPN', 'South Korea': 'KOR', 'Saudi Arabia': 'KSA', 'Iran': 'IRN', 'Australia': 'AUS',
  'Qatar': 'QAT', 'Iraq': 'IRQ', 'United Arab Emirates': 'UAE', 'New Zealand': 'NZL',
  'Uzbekistan': 'UZB', 'Jordan': 'JOR', 'China': 'CHN',
};

// The data provider writes the big clubs its own way ("Club America",
// "Guadalajara Chivas", "U.N.A.M. - Pumas", "Atletico Madrid"). For the clubs of
// the curated list the app shows the name and code it has always used.
const CURATED_CLUBS = new Map(POPULAR_TEAMS.map(t => [String(t.id), { name: t.name, shortName: t.shortName }]));
// The rest of Liga MX — the app's home league — outside the popular picker.
for (const [id, name, shortName] of [
  ['2289', 'León', 'LEO'],
  ['2280', 'Tijuana', 'TIJ'],
  ['2290', 'Querétaro', 'QRO'],
  ['2314', 'Atlético San Luis', 'ASL'],
  ['2298', 'FC Juárez', 'JUA'],
  ['2312', 'Atlante', 'ATE'],
  ['2288', 'Necaxa', 'NEC'],
  ['2291', 'Puebla', 'PUE'],
] as const) {
  if (!CURATED_CLUBS.has(id)) CURATED_CLUBS.set(id, { name, shortName });
}

/** Name and short code to display for a team. */
export function displayTeam(
  id: string | number | null | undefined,
  name: string,
  provided?: string | null,
): { name: string; shortName: string } {
  const curated = id != null ? CURATED_CLUBS.get(String(id)) : undefined;
  if (curated) return curated;
  return { name, shortName: shortNameFor(name, provided) };
}

/**
 * Short code to show for a team: the FIFA code for national teams, else the
 * code the data provides, else one derived from the name.
 */
export function shortNameFor(name: string, provided?: string | null): string {
  if (NATIONAL_TEAM_CODES[name]) return NATIONAL_TEAM_CODES[name];
  // A youth national team carries its country's code (Mexico U17 → MEX, not "MU1").
  const youth = youthOf(name);
  const country = youth && (NATIONAL_TEAM_CODES[youth.base] ?? NATIONAL_TEAM_CODES[seniorNameOf(youth.base)]);
  return country || provided || deriveShortName(name);
}


const SHORT_SKIP = new Set(['FC', 'CF', 'AFC', 'SC', 'CD', 'CA', 'AC', 'AS', 'SS', 'US', 'FK', 'SK', 'CLUB', 'DE', 'THE']);

/** 3-letter code from a team name (mirror of the server's deriveShortName). */
export function deriveShortName(name: string): string {
  const words = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const meaningful = words.filter(w => !SHORT_SKIP.has(w));
  const w = meaningful.length ? meaningful : words;
  if (w.length === 0) return '???';
  if (w.length === 1) return w[0].slice(0, 3);
  return (w[0][0] + w[1].slice(0, 2)).slice(0, 3);
}
