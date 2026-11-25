/**
 * football/base.ts
 *
 * Small pure helpers shared by the football data layer: provider status codes,
 * local-time handling and team short names. No imports beyond the app types.
 */

import type { MatchStatus } from '../../data/types';

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
