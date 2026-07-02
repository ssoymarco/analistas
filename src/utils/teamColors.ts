// ── Team colors ───────────────────────────────────────────────────────────────
// Maps a national team (by FIFA 3-letter code = SportMonks `short_code`, which
// is what Team.shortName holds) to a single vibrant, dark-background-friendly
// primary color. Used to tint the Pressure Index chart per team instead of the
// generic red/green.
//
// Scope: national teams only (the World Cup focus). Clubs — hundreds of them —
// are NOT curated here and fall back to the classic home=red / away=green pair.
//
// Contrast guard: a two-sided chart needs the two teams to be visually
// distinct. resolveMatchColors() keeps the home team's real color and, if the
// away team's color is too close (e.g. red vs red), swaps the away side to a
// guaranteed-contrasting fallback so the chart stays readable.

export const DEFAULT_HOME = '#ef4444'; // red   (classic Pressure-Index home)
export const DEFAULT_AWAY = '#10b981'; // green (classic Pressure-Index away)

// FIFA 3-letter code → representative color. Colors are chosen for punch on the
// #0D0D0D background (literal navy/black flags are lightened toward a vivid
// tone), not for flag accuracy.
const TEAM_COLORS: Record<string, string> = {
  // ── UEFA ──
  FRA: '#2f6fed', // France – blue
  BEL: '#e63946', // Belgium – red
  SWE: '#f2c53d', // Sweden – gold
  NOR: '#d7263d', // Norway – red
  ESP: '#e23636', // Spain – red
  GER: '#eab308', // Germany – gold (black doesn't show on dark bg)
  POR: '#d61f34', // Portugal – red
  ITA: '#2f6fed', // Italy – azzurri blue
  NED: '#ff6a13', // Netherlands – orange
  ENG: '#e63946', // England – red
  CRO: '#e23636', // Croatia – red
  DEN: '#d7263d', // Denmark – red
  SUI: '#e23636', // Switzerland – red
  POL: '#e2445c', // Poland – red-pink
  CZE: '#2f6fed', // Czechia – blue
  SRB: '#e23636', // Serbia – red
  AUT: '#e23636', // Austria – red
  SCO: '#2f6fed', // Scotland – blue
  WAL: '#e23636', // Wales – red
  TUR: '#e63946', // Turkey – red
  UKR: '#f2c53d', // Ukraine – yellow
  GRE: '#2f6fed', // Greece – blue
  HUN: '#16a34a', // Hungary – green
  // ── CONMEBOL ──
  ARG: '#5aa9e6', // Argentina – sky blue
  BRA: '#f7d417', // Brazil – yellow
  URU: '#4aa3e0', // Uruguay – sky blue
  COL: '#ffcf1f', // Colombia – yellow
  ECU: '#f5ce1e', // Ecuador – yellow
  PER: '#e63946', // Peru – red
  CHI: '#e63946', // Chile – red
  PAR: '#e2445c', // Paraguay – red
  BOL: '#16a34a', // Bolivia – green
  VEN: '#e2551e', // Venezuela – burgundy/red
  // ── CONCACAF ──
  MEX: '#12984f', // Mexico – green
  USA: '#2b6fd8', // USA – blue
  CAN: '#e63946', // Canada – red
  CRC: '#e63946', // Costa Rica – red
  PAN: '#d7263d', // Panama – red
  HON: '#2b6fd8', // Honduras – blue
  JAM: '#f2c53d', // Jamaica – gold
  // ── CAF ──
  SEN: '#16a34a', // Senegal – green
  CIV: '#ff7a1f', // Ivory Coast – orange
  MAR: '#16a34a', // Morocco – green
  GHA: '#16a34a', // Ghana – green
  CMR: '#16a34a', // Cameroon – green
  NGA: '#16a34a', // Nigeria – green
  EGY: '#e63946', // Egypt – red
  TUN: '#e63946', // Tunisia – red
  ALG: '#16a34a', // Algeria – green
  RSA: '#16a34a', // South Africa – green
  MLI: '#16a34a', // Mali – green
  CPV: '#2f6fed', // Cape Verde – blue
  // ── AFC ──
  JPN: '#2b5fd8', // Japan – blue
  KOR: '#e0343f', // South Korea – red
  KSA: '#16a34a', // Saudi Arabia – green
  IRN: '#e63946', // Iran – red
  AUS: '#f2c53d', // Australia – gold
  QAT: '#a51447', // Qatar – maroon (lightened)
  IRQ: '#e63946', // Iraq – red
  UAE: '#e63946', // UAE – red
  // ── OFC ──
  NZL: '#4b62d8', // New Zealand – blue
};

// ── small hex helpers ─────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b; // 0..255
}

/** Perceptual-ish RGB distance (0 = identical, ~441 = black↔white). */
function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** Look up a team's color by its shortName (FIFA code), else null. */
export function teamColor(shortName?: string): string | null {
  if (!shortName) return null;
  return TEAM_COLORS[shortName.toUpperCase()] ?? null;
}

/**
 * Resolve the two chart colors for a match, guaranteeing they're distinct.
 *  • Each side uses its team color when known, else the classic red/green.
 *  • If the two resolved colors are too similar (red vs red, both dark, etc.),
 *    the AWAY side is swapped to a contrasting fallback so the two-sided chart
 *    stays legible — the HOME team always keeps its real color.
 */
export function resolveMatchColors(
  homeShort?: string,
  awayShort?: string,
): { home: string; away: string } {
  const home = teamColor(homeShort) ?? DEFAULT_HOME;
  let away = teamColor(awayShort) ?? DEFAULT_AWAY;

  const TOO_CLOSE = 90; // RGB-distance threshold below which colors read as "same"
  if (colorDistance(home, away) < TOO_CLOSE) {
    // Prefer green as the contrasting away color; if home is itself greenish,
    // fall back to red instead.
    const homeIsGreenish = colorDistance(home, DEFAULT_AWAY) < 120;
    away = homeIsGreenish ? DEFAULT_HOME : DEFAULT_AWAY;
    // Last resort: if still too close (home ≈ our chosen fallback), nudge to a
    // blue so the two are never indistinguishable.
    if (colorDistance(home, away) < TOO_CLOSE) away = '#2f6fed';
  }

  return { home, away };
}
