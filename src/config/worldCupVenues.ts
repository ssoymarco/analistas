// ── World Cup 2026 venue name overrides ──────────────────────────────────────
// FIFA enforces "clean venue" names during the tournament — commercial
// sponsors (Banorte, BBVA, AT&T, etc.) are replaced with neutral names that
// align with the host city. These are the names every TV broadcaster
// (Telemundo, FOX, ESPN, Televisa) and major football app will use during the
// World Cup.
//
// Strategy: when a fixture belongs to the World Cup AND its stadium is one of
// the 16 venues below, we display the FIFA name. For every other competition
// (Liga MX, MLS, friendlies played at the same stadium), the commercial name
// from the data is preserved.
//
// Venues are matched by a keyword of the stadium's commercial name: the data
// source ships most World Cup fixtures without a venue id and spells the same
// stadium several ways ("AT&T Stadium" / "Dallas Stadium").

import { WORLD_CUP_LEAGUE_ID } from './leagues';

interface VenueOverride {
  /** Lowercase fragments of the commercial name that identify the stadium. */
  match: string[];
  /** FIFA-clean stadium name (no sponsor) */
  name: string;
  /** Host city label */
  city: string;
}

export const WORLD_CUP_VENUE_OVERRIDES: VenueOverride[] = [
  // ── México ────────────────────────────────────────────────────────────────
  { match: ['azteca', 'banorte'],      name: 'Estadio Ciudad de México',        city: 'Ciudad de México' },
  { match: ['bbva'],                   name: 'Estadio Monterrey',               city: 'Monterrey' },
  { match: ['akron'],                  name: 'Estadio Guadalajara',             city: 'Guadalajara' },
  // ── Canada ────────────────────────────────────────────────────────────────
  { match: ['bmo field'],              name: 'Estadio Toronto',                 city: 'Toronto' },
  { match: ['bc place'],               name: 'Estadio Vancouver',               city: 'Vancouver' },
  // ── United States ─────────────────────────────────────────────────────────
  { match: ['gillette'],               name: 'Estadio Boston',                  city: 'Boston' },
  { match: ['lumen'],                  name: 'Estadio Seattle',                 city: 'Seattle' },
  { match: ['lincoln financial'],      name: 'Estadio Filadelfia',              city: 'Filadelfia' },
  { match: ["levi's", 'levis'],        name: 'Estadio Bahía de San Francisco',  city: 'San Francisco' },
  { match: ['metlife'],                name: 'Estadio Nueva York Nueva Jersey', city: 'Nueva York' },   // Final
  { match: ['nrg'],                    name: 'Estadio Houston',                 city: 'Houston' },
  { match: ['arrowhead'],              name: 'Estadio Kansas City',             city: 'Kansas City' },
  { match: ['at&t', 'dallas stadium'], name: 'Estadio Dallas',                  city: 'Dallas' },
  { match: ['hard rock'],              name: 'Estadio Miami',                   city: 'Miami' },        // 3rd place
  { match: ['mercedes-benz'],          name: 'Estadio Atlanta',                 city: 'Atlanta' },
  { match: ['sofi'],                   name: 'Estadio Los Ángeles',             city: 'Los Ángeles' },
];

function findOverride(leagueId: number | null | undefined, venueName?: string | null): VenueOverride | undefined {
  if (Number(leagueId) !== WORLD_CUP_LEAGUE_ID || !venueName) return undefined;
  const lower = venueName.toLowerCase();
  return WORLD_CUP_VENUE_OVERRIDES.find(v => v.match.some(m => lower.includes(m)));
}

/**
 * Display name for a venue in the context of a competition.
 *
 *   • World Cup fixture at one of the 16 venues → FIFA name
 *   • Any other competition or unknown venue → the commercial name from the
 *     data (`fallbackName`)
 *
 * Returns null when there is no name at all. (`_venueId` is kept for call-site
 * compatibility; matching is by name.)
 */
export function getDisplayVenueName(
  _venueId: number | null | undefined,
  leagueId: number | null | undefined,
  fallbackName?: string | null,
): string | null {
  return findOverride(leagueId, fallbackName)?.name ?? (fallbackName?.trim() || null);
}

/**
 * Same logic for the city label: the data names the suburb (Foxborough, East
 * Rutherford, Zapopan…) while FIFA uses the metro city (Boston, Nueva York,
 * Guadalajara). `venueName` identifies the stadium.
 */
export function getDisplayVenueCity(
  _venueId: number | null | undefined,
  leagueId: number | null | undefined,
  fallbackCity?: string | null,
  venueName?: string | null,
): string | null {
  return findOverride(leagueId, venueName)?.city ?? (fallbackCity?.trim() || null);
}
