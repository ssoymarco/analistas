// ── League Configuration ─────────────────────────────────────────────────────
// All available leagues on the SportMonks Pro plan.
// Update currentSeasonId each season — it is used for standings, top scorers, etc.
//
// Organized by region for easy navigation. Flags use emoji for cross-platform compat.

export interface LeagueConfig {
  id: number;
  name: string;
  country: string;
  flag: string;
  currentSeasonId: number | null;
}

export const AVAILABLE_LEAGUES: LeagueConfig[] = [
  // ── Europe — Top 5 ────────────────────────────────────────────────────────
  { id: 8,    name: 'Premier League',         country: 'England',     flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', currentSeasonId: 25583 },
  { id: 564,  name: 'La Liga',                country: 'Spain',       flag: '🇪🇸', currentSeasonId: 25659 },
  { id: 82,   name: 'Bundesliga',             country: 'Germany',     flag: '🇩🇪', currentSeasonId: 25646 },
  { id: 384,  name: 'Serie A',                country: 'Italy',       flag: '🇮🇹', currentSeasonId: 25533 },
  { id: 301,  name: 'Ligue 1',                country: 'France',      flag: '🇫🇷', currentSeasonId: 25651 },

  // ── Europe — Segundas divisiones ──────────────────────────────────────────
  { id: 9,    name: 'Championship',           country: 'England',     flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', currentSeasonId: 25648 },
  { id: 567,  name: 'La Liga 2',              country: 'Spain',       flag: '🇪🇸', currentSeasonId: 25673 },
  { id: 85,   name: '2. Bundesliga',          country: 'Germany',     flag: '🇩🇪', currentSeasonId: 25652 },
  { id: 387,  name: 'Serie B',                country: 'Italy',       flag: '🇮🇹', currentSeasonId: 26164 },
  { id: 304,  name: 'Ligue 2',                country: 'France',      flag: '🇫🇷', currentSeasonId: 25658 },

  // ── Europe — Otros ────────────────────────────────────────────────────────
  { id: 462,  name: 'Liga Portugal',          country: 'Portugal',    flag: '🇵🇹', currentSeasonId: 25745 },
  { id: 72,   name: 'Eredivisie',             country: 'Netherlands', flag: '🇳🇱', currentSeasonId: 25597 },
  { id: 208,  name: 'Pro League',             country: 'Belgium',     flag: '🇧🇪', currentSeasonId: 25600 },
  { id: 600,  name: 'Süper Lig',              country: 'Turkey',      flag: '🇹🇷', currentSeasonId: 25682 },
  { id: 501,  name: 'Premiership',            country: 'Scotland',    flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', currentSeasonId: 25598 },
  { id: 271,  name: 'Superliga',              country: 'Denmark',     flag: '🇩🇰', currentSeasonId: 25536 },
  { id: 486,  name: 'Premier League',         country: 'Russia',      flag: '🇷🇺', currentSeasonId: 25599 },
  { id: 806,  name: 'Premier League',         country: 'Egypt',       flag: '🇪🇬', currentSeasonId: 26173 },
  { id: 860,  name: 'Botola Pro',             country: 'Morocco',     flag: '🇲🇦', currentSeasonId: 26027 },

  // ── Europe — Copas ────────────────────────────────────────────────────────
  { id: 24,   name: 'FA Cup',                 country: 'England',     flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', currentSeasonId: 25919 },
  { id: 570,  name: 'Copa del Rey',           country: 'Spain',       flag: '🇪🇸', currentSeasonId: 26557 },
  { id: 109,  name: 'DFB Pokal',              country: 'Germany',     flag: '🇩🇪', currentSeasonId: 25548 },
  { id: 390,  name: 'Coppa Italia',           country: 'Italy',       flag: '🇮🇹', currentSeasonId: 25642 },
  { id: 307,  name: 'Coupe de France',        country: 'France',      flag: '🇫🇷', currentSeasonId: 26654 },
  { id: 27,   name: 'Carabao Cup',            country: 'England',     flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', currentSeasonId: 25654 },

  // ── Américas — Ligas principales ──────────────────────────────────────────
  { id: 743,  name: 'Liga MX',                country: 'Mexico',      flag: '🇲🇽', currentSeasonId: 25539 },
  { id: 779,  name: 'Major League Soccer',    country: 'USA',         flag: '🇺🇸', currentSeasonId: 26720 },
  { id: 636,  name: 'Liga Profesional',       country: 'Argentina',   flag: '🇦🇷', currentSeasonId: 26808 },
  { id: 648,  name: 'Brasileirão Serie A',    country: 'Brazil',      flag: '🇧🇷', currentSeasonId: 26763 },
  { id: 672,  name: 'Liga BetPlay',           country: 'Colombia',    flag: '🇨🇴', currentSeasonId: 26881 },
  { id: 663,  name: 'Primera División',       country: 'Chile',       flag: '🇨🇱', currentSeasonId: 26873 },
  { id: 687,  name: 'Primera División',       country: 'Uruguay',     flag: '🇺🇾', currentSeasonId: 25761 },
  { id: 702,  name: 'Primera División',       country: 'Paraguay',    flag: '🇵🇾', currentSeasonId: 25889 },
  { id: 708,  name: 'Primera División',       country: 'Peru',        flag: '🇵🇪', currentSeasonId: 25594 },
  { id: 696,  name: 'Liga Pro',               country: 'Ecuador',     flag: '🇪🇨', currentSeasonId: 27249 },
  { id: 734,  name: 'Liga Nacional',          country: 'Honduras',    flag: '🇭🇳', currentSeasonId: 25763 },

  // ── Américas — Segundas divisiones + copas ────────────────────────────────
  { id: 749,  name: 'Liga de Expansión MX',   country: 'Mexico',      flag: '🇲🇽', currentSeasonId: 25886 },
  { id: 645,  name: 'Primera B Nacional',     country: 'Argentina',   flag: '🇦🇷', currentSeasonId: 26809 },
  { id: 651,  name: 'Brasileirão Serie B',    country: 'Brazil',      flag: '🇧🇷', currentSeasonId: 27198 },
  { id: 654,  name: 'Copa do Brasil',         country: 'Brazil',      flag: '🇧🇷', currentSeasonId: 27151 },

  // ── Asia + Medio Oriente ──────────────────────────────────────────────────
  { id: 944,  name: 'Saudi Pro League',       country: 'Saudi Arabia', flag: '🇸🇦', currentSeasonId: 26276 },
  { id: 968,  name: 'J1 League',              country: 'Japan',       flag: '🇯🇵', currentSeasonId: 26810 },
  { id: 1034, name: 'K League 1',             country: 'South Korea', flag: '🇰🇷', currentSeasonId: 26894 },
  { id: 902,  name: 'Persian Gulf Pro League', country: 'Iran',       flag: '🇮🇷', currentSeasonId: 26175 },

  // ── Competiciones internacionales ─────────────────────────────────────────
  { id: 1122, name: 'Copa Libertadores',      country: 'South America', flag: '🏆', currentSeasonId: 26784 },
  { id: 1116, name: 'Copa Sudamericana',      country: 'South America', flag: '🏆', currentSeasonId: 26783 },
  { id: 1111, name: 'CONCACAF Champions Cup', country: 'North America', flag: '🏆', currentSeasonId: 26750 },
  { id: 1741, name: 'CONCACAF Nations League', country: 'North America', flag: '🏆', currentSeasonId: 27491 },
  { id: 1107, name: 'CAF Champions League',   country: 'Africa',      flag: '🏆', currentSeasonId: 26228 },

  // ── Otros ─────────────────────────────────────────────────────────────────
  { id: 1082, name: 'Amistosos Internacionales', country: 'World',    flag: '🌍', currentSeasonId: 26758 },

  // ── Femenil ───────────────────────────────────────────────────────────────
  { id: 1579, name: 'Liga MX Femenil',        country: 'Mexico',      flag: '🇲🇽', currentSeasonId: 25595 },
  { id: 1568, name: 'Primera División Femenil', country: 'Spain',     flag: '🇪🇸', currentSeasonId: 25801 },
  { id: 1419, name: 'UEFA Women\'s Champions League', country: 'Europe', flag: '🏆', currentSeasonId: 25515 },
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
