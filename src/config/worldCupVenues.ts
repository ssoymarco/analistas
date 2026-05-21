// ── World Cup 2026 venue name overrides ──────────────────────────────────────
// FIFA enforces "clean venue" names during the tournament — commercial
// sponsors (Banorte, BBVA, AT&T, etc.) are replaced with neutral names that
// align with the host city. These are the names every TV broadcaster
// (Telemundo, FOX, ESPN, Televisa) and major football app (FotMob, FIFA app,
// BeSoccer) will use during the World Cup.
//
// Strategy: when a fixture belongs to league 732 (World Cup) AND its venue
// has a mapping below, we display the FIFA name. For every other competition
// (Liga MX, MLS, friendlies played at the same stadium), the original
// commercial name from SportMonks is preserved.
//
// Each entry maps SportMonks venue_id → FIFA-clean name in Spanish.

interface VenueOverride {
  /** FIFA-clean stadium name (no sponsor) */
  name: string;
  /** Optional: short city label shown when extra context helps */
  city?: string;
}

export const WORLD_CUP_VENUE_OVERRIDES: Record<number, VenueOverride> = {
  // ── México ────────────────────────────────────────────────────────────────
  1599:   { name: 'Estadio Ciudad de México', city: 'Ciudad de México' }, // ex-Azteca / Banorte
  1583:   { name: 'Estadio Monterrey',         city: 'Monterrey' },         // ex-BBVA
  181421: { name: 'Estadio Guadalajara',       city: 'Guadalajara' },       // ex-Akron

  // ── Canada ────────────────────────────────────────────────────────────────
  11542:  { name: 'Estadio Toronto',           city: 'Toronto' },           // ex-BMO Field
  11554:  { name: 'Estadio Vancouver',         city: 'Vancouver' },         // ex-BC Place

  // ── United States ─────────────────────────────────────────────────────────
  160:    { name: 'Estadio Boston',            city: 'Boston' },            // ex-Gillette Stadium
  1579:   { name: 'Estadio Seattle',           city: 'Seattle' },           // ex-Lumen Field
  11556:  { name: 'Estadio Filadelfia',        city: 'Filadelfia' },        // ex-Lincoln Financial Field
  11579:  { name: 'Estadio Bahía de San Francisco', city: 'San Francisco' }, // ex-Levi's Stadium
  21826:  { name: 'Estadio Nueva York Nueva Jersey', city: 'Nueva York' },  // ex-MetLife — Final venue
  21827:  { name: 'Estadio Houston',           city: 'Houston' },           // ex-NRG Stadium
  72370:  { name: 'Estadio Kansas City',       city: 'Kansas City' },       // ex-Arrowhead
  72372:  { name: 'Estadio Dallas',            city: 'Dallas' },            // ex-AT&T Stadium
  78531:  { name: 'Estadio Miami',             city: 'Miami' },             // ex-Hard Rock — 3rd place
  161191: { name: 'Estadio Atlanta',           city: 'Atlanta' },           // ex-Mercedes-Benz
  343444: { name: 'Estadio Los Ángeles',       city: 'Los Ángeles' },       // ex-SoFi Stadium
};

/**
 * Get the display name for a venue in the context of a competition.
 *
 *   • World Cup 2026 fixture (leagueId === 732) at a known venue → FIFA name
 *   • Any other competition or unknown venue → fallback (the commercial
 *     name from SportMonks, passed by the caller)
 *
 * Returns null when no fallback is available either.
 */
export function getDisplayVenueName(
  venueId: number | null | undefined,
  leagueId: number | null | undefined,
  fallbackName?: string | null,
): string | null {
  if (leagueId === 732 && venueId && WORLD_CUP_VENUE_OVERRIDES[venueId]) {
    return WORLD_CUP_VENUE_OVERRIDES[venueId].name;
  }
  return fallbackName?.trim() || null;
}

/**
 * Same logic for the city label. Useful when SportMonks returns a suburb
 * name (Foxborough, East Rutherford, Guadalupe…) but FIFA uses the main
 * metro city (Boston, Nueva York, Monterrey).
 */
export function getDisplayVenueCity(
  venueId: number | null | undefined,
  leagueId: number | null | undefined,
  fallbackCity?: string | null,
): string | null {
  if (leagueId === 732 && venueId && WORLD_CUP_VENUE_OVERRIDES[venueId]?.city) {
    return WORLD_CUP_VENUE_OVERRIDES[venueId].city!;
  }
  return fallbackCity?.trim() || null;
}
