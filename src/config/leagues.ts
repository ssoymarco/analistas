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
   * Colored zones for the standings legend.
   * If omitted, a generic European fallback is used (Champion / CL / EL / Descenso).
   */
  zones?: LeagueZone[];
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
  { id: 806,  name: 'Premier League',         country: 'Egypt',       flag: '🇪🇬', currentSeasonId: 26173,
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
    zones: [
      // Top 8 qualify for Liguilla. Relegation is by cociente (average), not by position.
      { label: 'Liguilla',  color: PO, from: 1,  to: 8 },
    ] },
  { id: 779,  name: 'Major League Soccer', country: 'USA',       flag: '🇺🇸', currentSeasonId: 26720,
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
    zones: [
      { label: 'Cuadrangulares',     color: PO,  from: 1,  to: 8  },
      { label: 'Descenso',           color: REL, from: 19, to: 20 },
    ] },
  { id: 663,  name: 'Primera División',   country: 'Chile',     flag: '🇨🇱', currentSeasonId: 26873,
    zones: [
      { label: 'Playoffs',           color: PO,  from: 1,  to: 8  },
      { label: 'Descenso',           color: REL, from: 15, to: 16 },
    ] },
  { id: 687,  name: 'Primera División',   country: 'Uruguay',   flag: '🇺🇾', currentSeasonId: 25761,
    zones: [
      { label: 'Copa Libertadores',  color: CL,  from: 1,  to: 4  },
      { label: 'Copa Sudamericana',  color: EL,  from: 5,  to: 8  },
      { label: 'Descenso',           color: REL, from: 15, to: 16 },
    ] },
  { id: 702,  name: 'Primera División',   country: 'Paraguay',  flag: '🇵🇾', currentSeasonId: 25889,
    zones: [
      { label: 'Copa Libertadores',  color: CL,  from: 1,  to: 4  },
      { label: 'Copa Sudamericana',  color: EL,  from: 5,  to: 8  },
      { label: 'Descenso',           color: REL, from: 11, to: 12 },
    ] },
  { id: 708,  name: 'Primera División',   country: 'Peru',      flag: '🇵🇪', currentSeasonId: 25594,
    zones: [
      { label: 'Copa Libertadores',  color: CL,  from: 1,  to: 2  },
      { label: 'Copa Sudamericana',  color: EL,  from: 3,  to: 4  },
      { label: 'Playoffs',           color: PO,  from: 5,  to: 8  },
      { label: 'Descenso',           color: REL, from: 17, to: 18 },
    ] },
  { id: 696,  name: 'Liga Pro',           country: 'Ecuador',   flag: '🇪🇨', currentSeasonId: 27249,
    zones: [
      { label: 'Copa Libertadores',  color: CL,  from: 1,  to: 2  },
      { label: 'Copa Sudamericana',  color: EL,  from: 3,  to: 4  },
      { label: 'Playoffs',           color: PO,  from: 5,  to: 8  },
      { label: 'Descenso',           color: REL, from: 15, to: 16 },
    ] },
  { id: 734,  name: 'Liga Nacional',      country: 'Honduras',  flag: '🇭🇳', currentSeasonId: 25763,
    zones: [
      { label: 'Playoffs',           color: PO,  from: 1,  to: 8  },
      { label: 'Descenso',           color: REL, from: 17, to: 18 },
    ] },

  // ── Américas — Segundas divisiones + copas ────────────────────────────────
  { id: 749,  name: 'Liga de Expansión MX',   country: 'Mexico',      flag: '🇲🇽', currentSeasonId: 25886,
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
  { id: 1082, name: 'Amistosos Internacionales', country: 'World',    flag: '🌍', currentSeasonId: 26758 },

  // ── Femenil ───────────────────────────────────────────────────────────────
  { id: 1579, name: 'Liga MX Femenil',        country: 'Mexico',      flag: '🇲🇽', currentSeasonId: 25595,
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
