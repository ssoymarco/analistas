// ── League Configuration ─────────────────────────────────────────────────────
// All available leagues on the SportMonks Pro plan.
// Update currentSeasonId each season — it is used for standings, top scorers, etc.
//
// Organized by region for easy navigation. Flags use emoji for cross-platform compat.

/** A colored zone band in the standings table */
export interface LeagueZone {
  /** Label shown in the legend (proper noun — same in all languages) */
  label: string;
  /** Hex color for the side bar and legend pill */
  color: string;
  /** First position in the zone (inclusive) */
  from: number;
  /** Last position in the zone (inclusive) */
  to: number;
}

export interface LeagueConfig {
  id: number;
  name: string;
  country: string;
  flag: string;
  currentSeasonId: number | null;
  /** true for knockout/cup competitions — shows bracket instead of standings table */
  isCup?: boolean;
  /**
   * true for leagues that have BOTH a regular-season standings table AND a
   * knockout playoff bracket (e.g. Liga MX Liguilla, MLS Playoffs, etc.).
   * When set, TablaTab shows a "Tabla / <playoffsLabel>" toggle.
   */
  hasPlayoffs?: boolean;
  /**
   * Label for the playoff bracket toggle button (e.g. "Liguilla", "Playoffs",
   * "Cuadrangulares"). Defaults to "Playoffs" if omitted.
   */
  playoffsLabel?: string;
  /**
   * Colored zones for the standings legend.
   * If omitted, a generic European fallback is used (Champion / CL / EL / Descenso).
   */
  zones?: LeagueZone[];
  /**
   * Hidden search aliases — match user queries to this league without
   * displaying these terms anywhere. Use to handle copyrighted names we
   * cannot display (e.g. FIFA World Cup) while still making the league
   * discoverable.
   */
  searchAliases?: string[];
}

// ── Shared zone palettes ──────────────────────────────────────────────────────
const CL   = '#3b82f6'; // Champions League / ACL Elite / CAF CL / Copa Libertadores
const EL   = '#f97316'; // Europa League / Copa Sudamericana / CAF Confederation
const ECL  = '#a78bfa'; // Conference League purple
const REL  = '#ef4444'; // Relegation red
const REP  = '#fbbf24'; // Relegation playoff / repechaje yellow
const PRO  = '#22c55e'; // Direct promotion (2nd div)
const PPO  = '#86efac'; // Promotion playoff
const PO   = '#06b6d4'; // Generic playoffs / liguilla / cuadrangulares (cyan)

export const AVAILABLE_LEAGUES: LeagueConfig[] = [
  // ── Europe — Top 5 ────────────────────────────────────────────────────────
  { id: 8,    name: 'Premier League',  country: 'England',  flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', currentSeasonId: 25583,
    zones: [
      { label: 'Champions League', color: CL,  from: 1,  to: 4  },
      { label: 'Europa League',    color: EL,  from: 5,  to: 5  },
      { label: 'Conference League',color: ECL, from: 6,  to: 6  },
      { label: 'Descenso',         color: REL, from: 18, to: 20 },
    ] },
  { id: 564,  name: 'La Liga',         country: 'Spain',    flag: '🇪🇸', currentSeasonId: 25659,
    zones: [
      { label: 'Champions League', color: CL,  from: 1,  to: 4  },
      { label: 'Europa League',    color: EL,  from: 5,  to: 6  },
      { label: 'Conference League',color: ECL, from: 7,  to: 7  },
      { label: 'Descenso',         color: REL, from: 18, to: 20 },
    ] },
  { id: 82,   name: 'Bundesliga',      country: 'Germany',  flag: '🇩🇪', currentSeasonId: 25646,
    zones: [
      { label: 'Champions League', color: CL,  from: 1,  to: 4  },
      { label: 'Europa League',    color: EL,  from: 5,  to: 5  },
      { label: 'Conference League',color: ECL, from: 6,  to: 6  },
      { label: 'Repechaje',        color: REP, from: 16, to: 16 },
      { label: 'Descenso',         color: REL, from: 17, to: 18 },
    ] },
  { id: 384,  name: 'Serie A',         country: 'Italy',    flag: '🇮🇹', currentSeasonId: 25533,
    zones: [
      { label: 'Champions League', color: CL,  from: 1,  to: 4  },
      { label: 'Europa League',    color: EL,  from: 5,  to: 5  },
      { label: 'Conference League',color: ECL, from: 6,  to: 6  },
      { label: 'Descenso',         color: REL, from: 18, to: 20 },
    ] },
  { id: 301,  name: 'Ligue 1',         country: 'France',   flag: '🇫🇷', currentSeasonId: 25651,
    zones: [
      { label: 'Champions League', color: CL,  from: 1,  to: 3  },
      { label: 'Europa League',    color: EL,  from: 4,  to: 4  },
      { label: 'Conference League',color: ECL, from: 5,  to: 5  },
      { label: 'Repechaje',        color: REP, from: 16, to: 16 },
      { label: 'Descenso',         color: REL, from: 17, to: 18 },
    ] },

  // ── Europe — Segundas divisiones ──────────────────────────────────────────
  { id: 9,    name: 'Championship',           country: 'England',     flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', currentSeasonId: 25648,
    zones: [
      { label: 'Ascenso',          color: PRO, from: 1,  to: 2  },
      { label: 'Playoff ascenso',  color: PPO, from: 3,  to: 6  },
      { label: 'Descenso',         color: REL, from: 22, to: 24 },
    ] },
  { id: 567,  name: 'La Liga 2',              country: 'Spain',       flag: '🇪🇸', currentSeasonId: 25673,
    zones: [
      { label: 'Ascenso',          color: PRO, from: 1,  to: 2  },
      { label: 'Playoff ascenso',  color: PPO, from: 3,  to: 6  },
      { label: 'Descenso',         color: REL, from: 17, to: 22 },
    ] },
  { id: 85,   name: '2. Bundesliga',          country: 'Germany',     flag: '🇩🇪', currentSeasonId: 25652,
    zones: [
      { label: 'Ascenso',          color: PRO, from: 1,  to: 2  },
      { label: 'Playoff ascenso',  color: PPO, from: 3,  to: 3  },
      { label: 'Repechaje',        color: REP, from: 16, to: 16 },
      { label: 'Descenso',         color: REL, from: 17, to: 18 },
    ] },
  { id: 387,  name: 'Serie B',                country: 'Italy',       flag: '🇮🇹', currentSeasonId: 26164,
    zones: [
      { label: 'Ascenso',          color: PRO, from: 1,  to: 2  },
      { label: 'Playoff ascenso',  color: PPO, from: 3,  to: 8  },
      { label: 'Descenso',         color: REL, from: 16, to: 20 },
    ] },
  { id: 304,  name: 'Ligue 2',                country: 'France',      flag: '🇫🇷', currentSeasonId: 25658,
    zones: [
      { label: 'Ascenso',          color: PRO, from: 1,  to: 2  },
      { label: 'Playoff ascenso',  color: PPO, from: 3,  to: 3  },
      { label: 'Repechaje',        color: REP, from: 16, to: 16 },
      { label: 'Descenso',         color: REL, from: 17, to: 18 },
    ] },

  // ── Europe — Otros ────────────────────────────────────────────────────────
  { id: 462,  name: 'Liga Portugal',          country: 'Portugal',    flag: '🇵🇹', currentSeasonId: 25745,
    zones: [
      { label: 'Champions League', color: CL,  from: 1,  to: 2  },
      { label: 'Europa League',    color: EL,  from: 3,  to: 4  },
      { label: 'Conference League',color: ECL, from: 5,  to: 5  },
      { label: 'Repechaje',        color: REP, from: 16, to: 17 },
      { label: 'Descenso',         color: REL, from: 18, to: 18 },
    ] },
  { id: 72,   name: 'Eredivisie',             country: 'Netherlands', flag: '🇳🇱', currentSeasonId: 25597,
    zones: [
      { label: 'Champions League', color: CL,  from: 1,  to: 2  },
      { label: 'Europa League',    color: EL,  from: 3,  to: 4  },
      { label: 'Conference League',color: ECL, from: 5,  to: 6  },
      { label: 'Repechaje',        color: REP, from: 16, to: 17 },
      { label: 'Descenso',         color: REL, from: 18, to: 18 },
    ] },
  { id: 208,  name: 'Pro League',             country: 'Belgium',     flag: '🇧🇪', currentSeasonId: 25600,
    zones: [
      { label: 'Champions League', color: CL,  from: 1,  to: 2  },
      { label: 'Europa League',    color: EL,  from: 3,  to: 4  },
      { label: 'Conference League',color: ECL, from: 5,  to: 6  },
      { label: 'Descenso',         color: REL, from: 16, to: 16 },
    ] },
  { id: 600,  name: 'Süper Lig',              country: 'Turkey',      flag: '🇹🇷', currentSeasonId: 25682,
    zones: [
      { label: 'Champions League', color: CL,  from: 1,  to: 2  },
      { label: 'Europa League',    color: EL,  from: 3,  to: 4  },
      { label: 'Conference League',color: ECL, from: 5,  to: 6  },
      { label: 'Repechaje',        color: REP, from: 17, to: 18 },
      { label: 'Descenso',         color: REL, from: 19, to: 19 },
    ] },
  { id: 501,  name: 'Premiership',            country: 'Scotland',    flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', currentSeasonId: 25598,
    zones: [
      { label: 'Champions League', color: CL,  from: 1,  to: 1  },
      { label: 'Europa League',    color: EL,  from: 2,  to: 3  },
      { label: 'Conference League',color: ECL, from: 4,  to: 4  },
      { label: 'Repechaje',        color: REP, from: 10, to: 11 },
      { label: 'Descenso',         color: REL, from: 12, to: 12 },
    ] },
  { id: 271,  name: 'Superliga',              country: 'Denmark',     flag: '🇩🇰', currentSeasonId: 25536,
    zones: [
      { label: 'Champions League', color: CL,  from: 1,  to: 2  },
      { label: 'Europa League',    color: EL,  from: 3,  to: 4  },
      { label: 'Conference League',color: ECL, from: 5,  to: 5  },
      { label: 'Descenso',         color: REL, from: 13, to: 14 },
    ] },
  { id: 486,  name: 'Premier League',         country: 'Russia',      flag: '🇷🇺', currentSeasonId: 25599,
    zones: [
      { label: 'Champions League', color: CL,  from: 1,  to: 3  },
      { label: 'Europa League',    color: EL,  from: 4,  to: 4  },
      { label: 'Repechaje',        color: REP, from: 15, to: 15 },
      { label: 'Descenso',         color: REL, from: 16, to: 16 },
    ] },
  { id: 830,  name: 'Premier League',         country: 'Egypt',       flag: '🇪🇬', currentSeasonId: 26148,
    zones: [
      { label: 'CAF Champions League',     color: CL,  from: 1,  to: 2  },
      { label: 'CAF Confederation Cup',    color: EL,  from: 3,  to: 4  },
      { label: 'Descenso',                 color: REL, from: 18, to: 20 },
    ] },
  { id: 860,  name: 'Botola Pro',             country: 'Morocco',     flag: '🇲🇦', currentSeasonId: 26027,
    zones: [
      { label: 'CAF Champions League',     color: CL,  from: 1,  to: 2  },
      { label: 'CAF Confederation Cup',    color: EL,  from: 3,  to: 3  },
      { label: 'Descenso',                 color: REL, from: 15, to: 16 },
    ] },

  // ── Europe — Copas ────────────────────────────────────────────────────────
  { id: 24,   name: 'FA Cup',                 country: 'England',     flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', currentSeasonId: 25919,  isCup: true },
  { id: 570,  name: 'Copa del Rey',           country: 'Spain',       flag: '🇪🇸', currentSeasonId: 26557,  isCup: true },
  { id: 109,  name: 'DFB Pokal',              country: 'Germany',     flag: '🇩🇪', currentSeasonId: 25548,  isCup: true },
  { id: 390,  name: 'Coppa Italia',           country: 'Italy',       flag: '🇮🇹', currentSeasonId: 25642,  isCup: true },
  { id: 307,  name: 'Coupe de France',        country: 'France',      flag: '🇫🇷', currentSeasonId: 26654,  isCup: true },
  { id: 27,   name: 'Carabao Cup',            country: 'England',     flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', currentSeasonId: 25654,  isCup: true },

  // ── Américas — Ligas principales ──────────────────────────────────────────
  { id: 743,  name: 'Liga MX',             country: 'Mexico',    flag: '🇲🇽', currentSeasonId: 25539,
    hasPlayoffs: true, playoffsLabel: 'Liguilla',
    zones: [
      // Top 8 qualify for Liguilla. Relegation is by cociente (average), not by position.
      { label: 'Liguilla',  color: PO, from: 1,  to: 8 },
    ] },
  { id: 779,  name: 'Major League Soccer', country: 'USA',       flag: '🇺🇸', currentSeasonId: 26720,
    hasPlayoffs: true, playoffsLabel: 'Playoffs',
    zones: [
      // Top 9 from each conference qualify for playoffs (shown generically here)
      { label: 'Playoffs',  color: PO,  from: 1,  to: 9  },
    ] },
  { id: 636,  name: 'Liga Profesional',   country: 'Argentina', flag: '🇦🇷', currentSeasonId: 26808,
    zones: [
      { label: 'Copa Libertadores',  color: CL,  from: 1, to: 4  },
      { label: 'Copa Sudamericana',  color: EL,  from: 5, to: 8  },
      { label: 'Descenso',           color: REL, from: 26, to: 28 },
    ] },
  { id: 648,  name: 'Brasileirão Serie A', country: 'Brazil',   flag: '🇧🇷', currentSeasonId: 26763,
    zones: [
      { label: 'Copa Libertadores',  color: CL,  from: 1,  to: 6  },
      { label: 'Copa Sudamericana',  color: EL,  from: 7,  to: 12 },
      { label: 'Descenso',           color: REL, from: 17, to: 20 },
    ] },
  { id: 672,  name: 'Liga BetPlay',       country: 'Colombia',  flag: '🇨🇴', currentSeasonId: 26881,
    hasPlayoffs: true, playoffsLabel: 'Cuadrangulares',
    zones: [
      { label: 'Cuadrangulares',     color: PO,  from: 1,  to: 8  },
      { label: 'Descenso',           color: REL, from: 19, to: 20 },
    ] },
  { id: 663,  name: 'Primera División',   country: 'Chile',     flag: '🇨🇱', currentSeasonId: 26873,
    hasPlayoffs: true, playoffsLabel: 'Playoffs',
    zones: [
      { label: 'Playoffs',           color: PO,  from: 1,  to: 8  },
      { label: 'Descenso',           color: REL, from: 15, to: 16 },
    ] },
  { id: 770,  name: 'Primera División',   country: 'Uruguay',   flag: '🇺🇾', currentSeasonId: 27710,
    zones: [
      { label: 'Copa Libertadores',  color: CL,  from: 1,  to: 4  },
      { label: 'Copa Sudamericana',  color: EL,  from: 5,  to: 8  },
      { label: 'Descenso',           color: REL, from: 15, to: 16 },
    ] },
  { id: 755,  name: 'División 1',          country: 'Paraguay',  flag: '🇵🇾', currentSeasonId: 26765,
    zones: [
      { label: 'Copa Libertadores',  color: CL,  from: 1,  to: 4  },
      { label: 'Copa Sudamericana',  color: EL,  from: 5,  to: 8  },
      { label: 'Descenso',           color: REL, from: 11, to: 12 },
    ] },
  { id: 764,  name: 'Primera División',   country: 'Peru',      flag: '🇵🇪', currentSeasonId: 26882,
    hasPlayoffs: true, playoffsLabel: 'Playoffs',
    zones: [
      { label: 'Copa Libertadores',  color: CL,  from: 1,  to: 2  },
      { label: 'Copa Sudamericana',  color: EL,  from: 3,  to: 4  },
      { label: 'Playoffs',           color: PO,  from: 5,  to: 8  },
      { label: 'Descenso',           color: REL, from: 17, to: 18 },
    ] },
  { id: 696,  name: 'Liga Pro',           country: 'Ecuador',   flag: '🇪🇨', currentSeasonId: 27249,
    hasPlayoffs: true, playoffsLabel: 'Playoffs',
    zones: [
      { label: 'Copa Libertadores',  color: CL,  from: 1,  to: 2  },
      { label: 'Copa Sudamericana',  color: EL,  from: 3,  to: 4  },
      { label: 'Playoffs',           color: PO,  from: 5,  to: 8  },
      { label: 'Descenso',           color: REL, from: 15, to: 16 },
    ] },
  { id: 734,  name: 'Liga Nacional',      country: 'Honduras',  flag: '🇭🇳', currentSeasonId: 25763,
    hasPlayoffs: true, playoffsLabel: 'Playoffs',
    zones: [
      { label: 'Playoffs',           color: PO,  from: 1,  to: 8  },
      { label: 'Descenso',           color: REL, from: 17, to: 18 },
    ] },

  // ── Américas — Segundas divisiones + copas ────────────────────────────────
  { id: 749,  name: 'Liga de Expansión MX',   country: 'Mexico',      flag: '🇲🇽', currentSeasonId: 25886,
    hasPlayoffs: true, playoffsLabel: 'Playoffs',
    zones: [
      { label: 'Playoffs',           color: PO,  from: 1,  to: 8  },
    ] },
  { id: 645,  name: 'Primera B Nacional',     country: 'Argentina',   flag: '🇦🇷', currentSeasonId: 26809,
    zones: [
      { label: 'Ascenso',            color: PRO, from: 1,  to: 4  },
      { label: 'Descenso',           color: REL, from: 14, to: 15 },
    ] },
  { id: 651,  name: 'Brasileirão Serie B',    country: 'Brazil',      flag: '🇧🇷', currentSeasonId: 27198,
    zones: [
      { label: 'Ascenso',            color: PRO, from: 1,  to: 4  },
      { label: 'Descenso',           color: REL, from: 17, to: 20 },
    ] },
  { id: 654,  name: 'Copa do Brasil',         country: 'Brazil',      flag: '🇧🇷', currentSeasonId: 27151, isCup: true },

  // ── Asia + Medio Oriente ──────────────────────────────────────────────────
  { id: 944,  name: 'Saudi Pro League',       country: 'Saudi Arabia', flag: '🇸🇦', currentSeasonId: 26276,
    zones: [
      { label: 'AFC Champions League Elite', color: CL,  from: 1,  to: 3  },
      { label: 'AFC Champions League',       color: EL,  from: 4,  to: 5  },
      { label: 'Descenso',                   color: REL, from: 16, to: 18 },
    ] },
  { id: 968,  name: 'J1 League',              country: 'Japan',       flag: '🇯🇵', currentSeasonId: 26810,
    zones: [
      { label: 'AFC Champions League Elite', color: CL,  from: 1,  to: 2  },
      { label: 'AFC Champions League',       color: EL,  from: 3,  to: 5  },
      { label: 'Repechaje',                  color: REP, from: 16, to: 17 },
      { label: 'Descenso',                   color: REL, from: 18, to: 20 },
    ] },
  { id: 1034, name: 'K League 1',             country: 'South Korea', flag: '🇰🇷', currentSeasonId: 26894,
    zones: [
      { label: 'AFC Champions League Elite', color: CL,  from: 1,  to: 2  },
      { label: 'AFC Champions League',       color: EL,  from: 3,  to: 3  },
      { label: 'Repechaje',                  color: REP, from: 11, to: 11 },
      { label: 'Descenso',                   color: REL, from: 12, to: 12 },
    ] },
  { id: 902,  name: 'Persian Gulf Pro League', country: 'Iran',       flag: '🇮🇷', currentSeasonId: 26175,
    zones: [
      { label: 'AFC Champions League Elite', color: CL,  from: 1,  to: 2  },
      { label: 'AFC Champions League',       color: EL,  from: 3,  to: 3  },
      { label: 'Descenso',                   color: REL, from: 15, to: 16 },
    ] },

  // ── UEFA ──────────────────────────────────────────────────────────────────
  { id: 2,    name: 'Champions League',        country: 'Europe',        flag: '⭐', currentSeasonId: 25580, isCup: true },
  { id: 5,    name: 'Europa League',           country: 'Europe',        flag: '🟠', currentSeasonId: 25582, isCup: true },
  { id: 2286, name: 'Europa Conference League', country: 'Europe',       flag: '🟢', currentSeasonId: 25581, isCup: true },

  // ── Competiciones internacionales ─────────────────────────────────────────
  { id: 1122, name: 'Copa Libertadores',      country: 'South America', flag: '🏆', currentSeasonId: 26784, isCup: true },
  { id: 1116, name: 'Copa Sudamericana',      country: 'South America', flag: '🏆', currentSeasonId: 26783, isCup: true },
  { id: 1111, name: 'CONCACAF Champions Cup', country: 'North America', flag: '🏆', currentSeasonId: 26750, isCup: true },
  { id: 1741, name: 'CONCACAF Nations League', country: 'North America', flag: '🏆', currentSeasonId: 27491, isCup: true },
  { id: 1107, name: 'CAF Champions League',   country: 'Africa',      flag: '🏆', currentSeasonId: 26228, isCup: true },
  { id: 1108, name: 'CAF Confederation Cup', country: 'Africa',      flag: '🏆', currentSeasonId: 26264, isCup: true },

  // ── Otros ─────────────────────────────────────────────────────────────────
  { id: 732,  name: 'Fútbol 2026', country: 'World',    flag: '🌍', currentSeasonId: 26618, isCup: true, hasPlayoffs: true, playoffsLabel: 'Eliminatoria',
    // Hidden search aliases — let users find the tournament with common
    // queries without displaying any FIFA-trademarked term in the UI.
    searchAliases: [
      'copa del mundo', 'copa mundial', 'mundial de futbol', 'mundial de fútbol',
      'world cup', 'wc 2026', 'wc26', 'wc2026', 'fifa', 'usa canada mexico',
      'usa canadá méxico', 'norteamerica 2026', 'norteamérica 2026',
    ],
  },
  { id: 1082, name: 'Amistosos Internacionales', country: 'World',    flag: '🌍', currentSeasonId: 26758 },

  // ── Femenil ───────────────────────────────────────────────────────────────
  { id: 1579, name: 'Liga MX Femenil',        country: 'Mexico',      flag: '🇲🇽', currentSeasonId: 25595,
    hasPlayoffs: true, playoffsLabel: 'Liguilla',
    zones: [
      { label: 'Liguilla',           color: PO,  from: 1,  to: 8  },
    ] },
  { id: 1568, name: 'Primera División Femenil', country: 'Spain',     flag: '🇪🇸', currentSeasonId: 25801,
    zones: [
      { label: 'Champions League',   color: CL,  from: 1,  to: 4  },
      { label: 'Europa League',      color: EL,  from: 5,  to: 6  },
      { label: 'Descenso',           color: REL, from: 15, to: 16 },
    ] },
  { id: 1419, name: 'UEFA Women\'s Champions League', country: 'Europe', flag: '🏆', currentSeasonId: 25515, isCup: true },

  // ── Additional leagues added May 2026 (SportMonks Pro coverage expansion) ──
  // High-value tournaments + niche but covered leagues. All IDs + currentSeasonId
  // verified live against SportMonks /football/leagues/{id}.
  { id: 3211, name: 'Leagues Cup',              country: 'North America', flag: '🏆', currentSeasonId: 27500, isCup: true },
  { id: 1328, name: 'UEFA Super Cup',           country: 'Europe',        flag: '⭐', currentSeasonId: 25488, isCup: true },
  { id: 1452, name: 'Copa Intercontinental',    country: 'World',        flag: '🌍', currentSeasonId: 27741, isCup: true },
  { id: 1085, name: 'AFC Champions League Elite', country: 'Asia',        flag: '🏆', currentSeasonId: 25585, isCup: true },
  { id: 642,  name: 'Copa Argentina',           country: 'Argentina',     flag: '🇦🇷', currentSeasonId: 26830, isCup: true },
  { id: 1798, name: 'Supercopa do Brasil',      country: 'Brazil',        flag: '🇧🇷', currentSeasonId: 27800, isCup: true },
  { id: 3213, name: 'MLS All-Star',             country: 'USA',           flag: '🇺🇸', currentSeasonId: 27751, isCup: true },
  { id: 573,  name: 'Allsvenskan',              country: 'Sweden',        flag: '🇸🇪', currentSeasonId: 26806 },
  { id: 1356, name: 'A-League Men',             country: 'Australia',     flag: '🇦🇺', currentSeasonId: 26529 },
  { id: 325,  name: 'Super League',             country: 'Greece',        flag: '🇬🇷', currentSeasonId: 25759 },
  { id: 474,  name: 'Superliga',                country: 'Romania',       flag: '🇷🇴', currentSeasonId: 25641 },
  { id: 989,  name: 'Super League',             country: 'China',         flag: '🇨🇳', currentSeasonId: 27223 },
  { id: 938,  name: 'Stars League',             country: 'Qatar',         flag: '🇶🇦', currentSeasonId: 25612 },
];

/** Comma-separated league IDs for API filter params */
export const LEAGUE_IDS = AVAILABLE_LEAGUES.map((l) => l.id).join(',');

/** Find a league config by its SportMonks id */
export function getLeagueConfig(id: number): LeagueConfig | undefined {
  return AVAILABLE_LEAGUES.find((l) => l.id === id);
}

/** Find a league config by its name (case-insensitive, for fallback when id is missing) */
export function getLeagueConfigByName(name: string): LeagueConfig | undefined {
  const lower = name.toLowerCase();
  return AVAILABLE_LEAGUES.find((l) => l.name.toLowerCase() === lower);
}

// ── Trademark-sensitive overrides ────────────────────────────────────────────
//
// Some competitions own brand assets we must NOT display: official logo and,
// in some markets, even the official name. The FIFA World Cup is the canonical
// example — we render "Mundial 2026" + a 🌍 emoji instead of "World Cup" +
// the FIFA mark. Add a leagueId here when we acquire (or lose) a sub-license
// for that brand.
export const COPYRIGHT_SENSITIVE_LEAGUE_IDS = new Set<number>([732]); // FIFA World Cup 2026

/** True when the given league should NOT show its remote logo / English name. */
export function isCopyrightSensitiveLeague(id: number | string): boolean {
  const numId = typeof id === 'string' ? Number(id) : id;
  return Number.isFinite(numId) && COPYRIGHT_SENSITIVE_LEAGUE_IDS.has(numId);
}

/**
 * Display name for a league, using our curated `config.name` for
 * trademark-sensitive leagues (and falling back to whatever string the API
 * already produced for everything else). Pass the SportMonks-supplied
 * `fallback` so non-sensitive leagues render exactly as before.
 */
export function getLeagueDisplayName(id: number | string, fallback: string): string {
  if (!isCopyrightSensitiveLeague(id)) return fallback;
  const numId = typeof id === 'string' ? Number(id) : id;
  return getLeagueConfig(numId)?.name ?? fallback;
}

/**
 * Display flag/emoji for a league. For trademark-sensitive leagues, returns
 * the curated emoji from config (e.g. 🌍 for the World Cup). For everything
 * else, returns the SportMonks logo URL (or null when not available — caller
 * can fall back to its own emoji).
 */
export function getLeagueDisplayFlag(id: number | string, fallbackLogo: string): string {
  if (isCopyrightSensitiveLeague(id)) {
    const numId = typeof id === 'string' ? Number(id) : id;
    return getLeagueConfig(numId)?.flag || '🌍';
  }
  return fallbackLogo;
}

// ── "Sugerida" league logic (onboarding) ─────────────────────────────────────
//
// A league is marked as "Sugerida" in the onboarding flow only when one of:
//   (a) It's one of the global top-10 competitions — Premier League, La Liga,
//       Bundesliga, Serie A, Ligue 1, Champions League, Europa League, MLS,
//       Liga MX, Brasileirão Serie A.
//   (b) The league's country matches the device's region (read from
//       expo-localization — no GPS permission required). E.g. a device with
//       region "MX" gets Liga MX + Liga de Expansión MX + Liga MX Femenil
//       suggested. If no region is available, no local suggestions appear.

/** Global top-10 leagues suggested to everyone regardless of location. */
export const SUGGESTED_GLOBAL_LEAGUE_IDS: ReadonlySet<number> = new Set([
  8,    // Premier League (England)
  564,  // La Liga (Spain)
  82,   // Bundesliga (Germany)
  384,  // Serie A (Italy)
  301,  // Ligue 1 (France)
  2,    // UEFA Champions League
  5,    // UEFA Europa League
  779,  // Major League Soccer (USA)
  743,  // Liga MX (Mexico)
  648,  // Brasileirão Serie A (Brazil)
]);

/**
 * Maps ISO 3166-1 alpha-2 country codes to the `country` strings used in
 * `AVAILABLE_LEAGUES`. A country can map to multiple strings (e.g. GB matches
 * both England and Scotland leagues). Extend here as we add new leagues.
 */
const COUNTRY_LEAGUE_NAMES: Record<string, ReadonlyArray<string>> = {
  AR: ['Argentina'],
  BE: ['Belgium'],
  BR: ['Brazil'],
  CL: ['Chile'],
  CO: ['Colombia'],
  DE: ['Germany'],
  DK: ['Denmark'],
  EC: ['Ecuador'],
  EG: ['Egypt'],
  ES: ['Spain'],
  FR: ['France'],
  GB: ['England', 'Scotland'],
  HN: ['Honduras'],
  IR: ['Iran'],
  IT: ['Italy'],
  JP: ['Japan'],
  KR: ['South Korea'],
  MA: ['Morocco'],
  MX: ['Mexico'],
  NL: ['Netherlands'],
  PE: ['Peru'],
  PT: ['Portugal'],
  PY: ['Paraguay'],
  RU: ['Russia'],
  SA: ['Saudi Arabia'],
  TR: ['Turkey'],
  US: ['USA'],
  UY: ['Uruguay'],
};

/**
 * Returns true when a league should be flagged as "Sugerida" in onboarding,
 * given the device's detected country code. Pass `undefined` when the country
 * can't be determined — in that case, only global top-10 leagues qualify.
 */
export function isSuggestedLeague(
  league: { id: number; country: string },
  deviceCountry: string | undefined,
): boolean {
  if (SUGGESTED_GLOBAL_LEAGUE_IDS.has(league.id)) return true;
  if (!deviceCountry) return false;
  const countries = COUNTRY_LEAGUE_NAMES[deviceCountry];
  return !!countries && countries.includes(league.country);
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAGUE POPULARITY RANKING
// ─────────────────────────────────────────────────────────────────────────────
//
// Two-layer system that drives the order of leagues in the picker AFTER the
// user's country preset (Mundial → local league → top European → etc. via
// countryPresets.suggestedLeagueIds and secondaryLeagueIds).
//
//   1. LEAGUE_POPULARITY        — global default score (0-100)
//   2. LEAGUE_POPULARITY_BY_COUNTRY — per-market overrides
//
// Use getLeaguePopularity(leagueId, country) — country override takes
// precedence, falls back to global.
//
// Tiers (subjective, LATAM-MX biased):
//   S (94-100): Mundial 2026, Champions League, Premier, La Liga
//   A (84-92):  Liga MX, Serie A, Bundesliga, Ligue 1, Europa
//   B (75-82):  Brasileirão, Liga Argentina, Libertadores, MLS, Saudi
//   C (65-73):  Leagues Cup, Conference, Liga Portugal, Eredivisie, etc.
//   D (50-62):  National cups, Süper Lig, secondary South American
//   E (35-48):  Scotland, J1, Carabao, K League, Allsvenskan, etc.
//   F (22-32):  2nd divisions of top-5 Europe, Liga de Expansión MX
//   G (5-20):   Femenil, Russia, China, Egypt, Iran, Morocco, CAF
//
// ⚠️ Mundial 2026: set to 100 during the tournament cycle.
//    After Jul 20, 2026 (Final) → manually update to 55 (Tier D).
//    Same for Libertadores final / Champions final / Eurocopa cycles if
//    we want to do that elsewhere.

/** Global popularity score (0-100) per league. Higher = appears earlier. */
export const LEAGUE_POPULARITY: Record<number, number> = {
  // ── Tier S (94-100) ────────────────────────────────────────────────────
  732:  100, // Mundial 2026 — update to 55 after Jul 20, 2026 Final
  2:    98,  // UEFA Champions League
  8:    96,  // Premier League
  564:  95,  // La Liga
  // ── Tier A (84-92) ─────────────────────────────────────────────────────
  743:  92,  // Liga MX
  384:  90,  // Serie A
  82:   85,  // Bundesliga
  301:  84,  // Ligue 1
  5:    84,  // UEFA Europa League
  // ── Tier B (75-82) ─────────────────────────────────────────────────────
  648:  82,  // Brasileirão Serie A
  636:  80,  // Liga Profesional Argentina
  1122: 78,  // Copa Libertadores
  779:  76,  // MLS
  944:  75,  // Saudi Pro League
  // ── Tier C (65-73) ─────────────────────────────────────────────────────
  3211: 73,  // Leagues Cup
  2286: 72,  // UEFA Conference League
  462:  70,  // Liga Portugal
  72:   68,  // Eredivisie
  1111: 67,  // CONCACAF Champions Cup
  1116: 66,  // Copa Sudamericana
  1328: 65,  // UEFA Super Cup
  570:  65,  // Copa del Rey
  24:   65,  // FA Cup
  // ── Tier D (50-62) ─────────────────────────────────────────────────────
  600:  62,  // Süper Lig (Turkey)
  208:  60,  // Pro League (Belgium)
  109:  58,  // DFB Pokal
  390:  58,  // Coppa Italia
  307:  57,  // Coupe de France
  672:  56,  // Liga BetPlay (Colombia)
  663:  55,  // Primera División (Chile)
  770:  54,  // Primera División (Uruguay)
  654:  54,  // Copa do Brasil
  642:  53,  // Copa Argentina
  1798: 52,  // Supercopa do Brasil
  1085: 52,  // AFC Champions League Elite
  1452: 50,  // FIFA Intercontinental Cup
  // ── Tier E (35-48) ─────────────────────────────────────────────────────
  501:  48,  // Premiership (Scotland)
  968:  46,  // J1 League (Japan)
  27:   45,  // Carabao Cup
  1741: 45,  // CONCACAF Nations League
  1034: 43,  // K League 1 (Korea)
  1082: 42,  // Amistosos Internacionales — boost dinámico durante fechas FIFA (TODO)
  764:  41,  // Primera División (Peru)
  696:  40,  // Liga Pro (Ecuador)
  755:  40,  // División 1 (Paraguay)
  3213: 38,  // MLS All-Star
  573:  37,  // Allsvenskan (Sweden)
  1356: 36,  // A-League Men (Australia)
  325:  35,  // Super League (Greece)
  // ── Tier F (22-32) ─────────────────────────────────────────────────────
  9:    32,  // Championship (England)
  567:  30,  // La Liga 2
  85:   28,  // 2. Bundesliga
  387:  28,  // Serie B
  304:  27,  // Ligue 2
  651:  26,  // Brasileirão Serie B
  749:  25,  // Liga de Expansión MX
  645:  25,  // Primera B Nacional (Argentina)
  271:  24,  // Superliga (Denmark)
  474:  22,  // Superliga (Romania)
  // ── Tier G (5-20) ──────────────────────────────────────────────────────
  1579: 20,  // Liga MX Femenil
  1419: 18,  // UEFA Women's Champions League
  1568: 16,  // Primera División Femenil (España)
  734:  15,  // Liga Nacional (Honduras)
  486:  12,  // Premier League (Russia)
  989:  12,  // Super League (China)
  830:  10,  // Premier League (Egypt)
  938:  10,  // Stars League (Qatar)
  860:  8,   // Botola Pro (Morocco)
  902:  8,   // Persian Gulf Pro League (Iran)
  1107: 7,   // CAF Champions League
  1108: 5,   // CAF Confederation Cup
};

/**
 * Per-country popularity overrides.
 * ISO 3166-1 alpha-2 country code → leagueId → popularity (0-100).
 *
 * If a (country, leagueId) pair is missing, falls back to LEAGUE_POPULARITY.
 * Used to bias the ranking for local audiences without rewriting the global
 * scale (e.g. an Argentine sees Liga Profesional at #2 below Mundial, but a
 * Mexican sees it in its global slot at Tier B).
 */
export const LEAGUE_POPULARITY_BY_COUNTRY: Record<string, Record<number, number>> = {
  // 🇲🇽 México — primary audience
  MX: {
    1111: 86,  // CONCACAF Champions Cup ⬆ (was 67) — Liga MX clubs siempre
    1122: 88,  // Copa Libertadores ⬆ (was 78)
    3211: 87,  // Leagues Cup ⬆ (was 73)
    1741: 85,  // CONCACAF Nations League ⬆ (was 45)
    944:  88,  // Saudi Pro League ⬆ (was 75) — efecto Cristiano
    779:  87,  // MLS ⬆ (was 76) — efecto Messi
    1579: 71,  // Liga MX Femenil ⬆ (was 20)
    1419: 69,  // UEFA Women's CL ⬆ (was 18)
    749:  66,  // Liga de Expansión MX ⬆ (was 25)
    24:   78,  // FA Cup ⬆ (was 65) — usuario lo quiso en Tier B
  },
  // 🇦🇷 Argentina — Liga Profesional como #2
  AR: {
    636:  99,  // Liga Profesional ⬆⬆ (was 80) — segunda después de Mundial
    1122: 92,  // Copa Libertadores ⬆ (was 78)
    642:  78,  // Copa Argentina ⬆ (was 53)
    1116: 80,  // Copa Sudamericana ⬆ (was 66)
    779:  84,  // MLS ⬆ (was 76) — efecto Messi
    944:  78,  // Saudi Pro League ⬆ (was 75) — Otamendi/Paredes
  },
  // 🇧🇷 Brasil — Brasileirão como #2
  BR: {
    648:  99,  // Brasileirão Serie A ⬆⬆ (was 82) — segunda después de Mundial
    1122: 92,  // Copa Libertadores ⬆ (was 78)
    654:  80,  // Copa do Brasil ⬆ (was 54)
    1116: 82,  // Copa Sudamericana ⬆ (was 66)
    1798: 70,  // Supercopa do Brasil ⬆ (was 52)
  },
  // 🇺🇸 USA — MLS como #2, Liga MX como #6
  US: {
    779:  99,  // MLS ⬆⬆ (was 76) — segunda después de Mundial
    743:  94,  // Liga MX ⬆ (was 92) — boost LATAM diaspora, #6
    3211: 88,  // Leagues Cup ⬆ (was 73)
    384:  88,  // Serie A ⬆ (was 90, kept) — Pulisic en Milan
    944:  80,  // Saudi Pro League ⬆ (was 75)
    1111: 80,  // CONCACAF Champions Cup ⬆ (was 67)
    1741: 78,  // CONCACAF Nations League ⬆ (was 45)
  },
  // 🇪🇸 España — La Liga como #2
  ES: {
    564:  99,  // La Liga ⬆ (was 95) — segunda después de Mundial
    570:  88,  // Copa del Rey ⬆ (was 65)
    567:  62,  // La Liga 2 ⬆ (was 30)
    1419: 80,  // UEFA Women's CL ⬆ (was 18) — Barça Femení domina
    1568: 65,  // Primera División Femenil España ⬆ (was 16)
  },
  // 🏴 Inglaterra — Premier League como #2
  GB: {
    8:    100, // Premier League ⬆ (was 96) — segunda después de Mundial
    24:   90,  // FA Cup ⬆ (was 65)
    27:   75,  // Carabao Cup ⬆ (was 45)
    9:    72,  // Championship ⬆ (was 32)
  },
};

/**
 * Returns the popularity score for a league, taking country bias into account.
 *
 * @example
 *   getLeaguePopularity(743, 'MX')  // 92 (global) — Liga MX is already top for MX
 *   getLeaguePopularity(743, 'US')  // 94 (US override)
 *   getLeaguePopularity(743, 'AR')  // 92 (no AR override → falls back to global)
 *   getLeaguePopularity(902)        // 8 (Persian Gulf Pro)
 */
export function getLeaguePopularity(leagueId: number, country?: string): number {
  if (country) {
    const v = LEAGUE_POPULARITY_BY_COUNTRY[country]?.[leagueId];
    if (typeof v === 'number') return v;
  }
  return LEAGUE_POPULARITY[leagueId] ?? 0;
}
