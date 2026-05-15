/**
 * League popularity tiers — used by PartidosScreen to order the progressive "Ver más" feed.
 *
 * Tier 1 → Top global leagues (shown first after user's personalized content, or immediately
 *           if the user has no personalization)
 * Tier 2 → Important regional leagues (second reveal)
 * Tier 3 → Niche / women's / lower-division leagues (third and final reveal)
 *
 * IDs match SportMonks league IDs defined in src/config/leagues.ts
 */

// ── Tier 1: Elite global leagues ──────────────────────────────────────────────
export const LEAGUE_TIER_1 = new Set<number>([
  2,    // UEFA Champions League
  5,    // UEFA Europa League
  2286, // UEFA Europa Conference League
  8,    // Premier League (England)
  564,  // La Liga (Spain)
  82,   // Bundesliga (Germany)
  384,  // Serie A (Italy)
  301,  // Ligue 1 (France)
  1122, // Copa Libertadores (South America)
  743,  // Liga MX (Mexico)
  779,  // Major League Soccer (USA)
  648,  // Brasileirão Serie A (Brazil)
  636,  // Liga Profesional (Argentina)
  944,  // Saudi Pro League
  72,   // Eredivisie (Netherlands)
  1082, // International Friendlies
]);

// ── Tier 2: Important regional leagues ────────────────────────────────────────
export const LEAGUE_TIER_2 = new Set<number>([
  9,    // Championship (England)
  567,  // La Liga 2 (Spain)
  85,   // 2. Bundesliga (Germany)
  387,  // Serie B (Italy)
  304,  // Ligue 2 (France)
  24,   // FA Cup (England)
  570,  // Copa del Rey (Spain)
  109,  // DFB Pokal (Germany)
  390,  // Coppa Italia (Italy)
  307,  // Coupe de France (France)
  27,   // Carabao Cup (England)
  462,  // Liga Portugal (Portugal)
  208,  // Pro League (Belgium)
  600,  // Süper Lig (Turkey)
  501,  // Premiership (Scotland)
  271,  // Superliga (Denmark)
  486,  // Premier League (Russia)
  1116, // Copa Sudamericana
  1111, // CONCACAF Champions Cup
  1741, // CONCACAF Nations League
  645,  // Primera B Nacional (Argentina)
  651,  // Brasileirão Serie B (Brazil)
  654,  // Copa do Brasil (Brazil)
  672,  // Liga BetPlay (Colombia)
  663,  // Primera División (Chile)
  687,  // Primera División (Uruguay)
  968,  // J1 League (Japan)
  1107, // CAF Champions League
  1108, // CAF Confederation Cup
]);

// ── Tier 3: Niche / women's / lower divisions ─────────────────────────────────
// Anything NOT in Tier 1 or 2 falls here automatically.
// Examples: K League 1 (1034), Persian Gulf Pro (902), Paraguay (702),
// Peru (708), Ecuador (696), Honduras (734), Liga Expansión MX (749),
// Egypt PL (806), Morocco Botola (860), women's leagues (1419, 1568, 1579).

/** Returns the tier (1 | 2 | 3) for a given numeric league ID. */
export function getLeagueTier(leagueId: number): 1 | 2 | 3 {
  if (LEAGUE_TIER_1.has(leagueId)) return 1;
  if (LEAGUE_TIER_2.has(leagueId)) return 2;
  return 3;
}
