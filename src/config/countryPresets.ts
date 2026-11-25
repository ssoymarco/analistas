/**
 * countryPresets — per-country onboarding personalization.
 *
 * What this controls:
 *   1. Which national team appears FIRST in the team-picker grid
 *   2. Which 5-7 local clubs appear after the national team
 *   3. Which player names get pre-suggested in the player-picker
 *   4. Which leagues get the "Sugerida" badge + appear at the top of the
 *      league-picker
 *
 * IMPORTANT — Product rule:
 *   • Selecting TEAMS subscribes the user to notifications (goals, kickoff,
 *     finals, cards, etc.) for ONLY those teams.
 *   • Selecting LEAGUES is FEED-DISPLAY ORDERING ONLY — it makes the league
 *     appear first in the Partidos screen. It does NOT trigger notifications
 *     for matches of teams the user hasn't subscribed to.
 *   • This prevents notification spam (e.g. picking MLS doesn't mean 30 alerts
 *     a night when 5 matches play simultaneously).
 *
 * Detection: see hooks/useUserCountry.ts
 * Mixing logic: see services/onboardingGrid.ts (buildOnboardingTeamGrid)
 */

/**
 * Player suggestions are by NAME. Names must match POPULAR_PLAYER_NAMES in
 * services/football/popular.ts exactly; a name that isn't in that list is
 * silently ignored.
 */
export interface CountryPreset {
  /** Display label for QA/logs */
  label: string;
  /** Team id of the national team (0 = none). Must exist in POPULAR_NATIONAL_TEAMS. */
  nationalTeamId: number;
  /** Local club IDs in popularity order. Must exist in POPULAR_TEAMS. */
  localClubIds: number[];
  /** Local player names to pre-suggest. Names resolved via POPULAR_PLAYER_NAMES. */
  localPlayerNames: string[];
  /**
   * League IDs in priority order. These get the "Sugerida" badge and appear
   * at the top of the league picker (positions 1-6). The user's main feed
   * preferences derive from this list.
   */
  suggestedLeagueIds: number[];
  /**
   * Second-tier leagues that aren't "Sugerida" but ARE relevant to the user.
   * Examples: Europa League, Conference League, Copa Libertadores for LATAM
   * users. These appear AFTER the suggested ones but BEFORE niche leagues
   * (Iran, Bolivia, etc.). No "Sugerida" badge.
   */
  secondaryLeagueIds: number[];
}

// ── Country presets ─────────────────────────────────────────────────────────

// League ID reference (API-Sports ids — see functions/src/shared/football/leagues.ts):
//   1   = Mundial (FIFA World Cup)
//   2   = UEFA Champions League
//   3   = UEFA Europa League
//   848 = UEFA Conference League
//   39  = Premier League (England)
//   140 = LaLiga (España)
//   78  = Bundesliga (Alemania)
//   135 = Serie A (Italia)
//   61  = Ligue 1 (Francia)
//   262 = Liga MX (México)
//   253 = MLS (USA)
//   128 = Liga Profesional Argentina
//   71  = Brasileirão Série A
//   94  = Liga Portugal
//   16  = CONCACAF Champions Cup
//   13  = Copa Libertadores (CONMEBOL)
//   11  = Copa Sudamericana

export const COUNTRY_PRESETS: Record<string, CountryPreset> = {
  // 🇲🇽 México
  MX: {
    label: 'México',
    nationalTeamId: 16,
    localClubIds: [2287, 2278, 2295, 2286, 2279, 2282, 2281, 2292, 2285, 2283], // AME, GUA, CAZ, PUM, TUA, MNT, TOL, PCH, SLA, ATS
    // Removed: Chicharito (apenas juega), Luis Romo, Hirving Lozano (poca actividad).
    // Si quieres recuperarlos: vienen vía search del repertorio global.
    localPlayerNames: ['Santiago Giménez', 'Raúl Jiménez', 'Edson Álvarez', 'Guillermo Ochoa'],
    suggestedLeagueIds:  [1, 262, 2, 39, 140, 253],     // Mundial, Liga MX, Champions, Premier, La Liga, MLS
    secondaryLeagueIds:  [3, 16, 78, 135, 61, 94, 848], // Europa, CCC, Bundes, Serie A, Ligue 1, Liga Portugal, Conference
  },

  // 🇦🇷 Argentina
  AR: {
    label: 'Argentina',
    nationalTeamId: 26,
    localClubIds: [451, 435, 436, 453, 460, 450, 438], // Boca, River, Racing, Independiente, San Lorenzo, Estudiantes, Vélez
    localPlayerNames: ['Lionel Messi', 'Lautaro Martínez', 'Julián Álvarez', 'Enzo Fernández', 'Rodrigo De Paul', 'Paulo Dybala', 'Alexis Mac Allister'],
    suggestedLeagueIds:  [1, 128, 140, 2, 39],          // Mundial, Liga Pro Arg, La Liga, Champions, Premier
    secondaryLeagueIds:  [13, 3, 135, 253, 94, 848],    // Libertadores, Europa, Serie A, MLS, Liga Portugal, Conference
  },

  // 🇧🇷 Brasil
  BR: {
    label: 'Brasil',
    nationalTeamId: 6,
    localClubIds: [127, 121, 131, 126, 124, 1062, 135, 130, 128], // Flamengo, Palmeiras, Corinthians, São Paulo, Fluminense, Atl. Mineiro, Cruzeiro, Grêmio, Santos
    localPlayerNames: ['Vinícius Júnior', 'Rodrygo', 'Raphinha', 'Neymar', 'Casemiro', 'Endrick'],
    suggestedLeagueIds:  [1, 71, 140, 2, 39],          // Mundial, Brasileirão, La Liga, Champions, Premier
    secondaryLeagueIds:  [13, 3, 135, 253, 94, 848],
  },

  // 🇺🇸 USA
  US: {
    label: 'United States',
    nationalTeamId: 2384,
    localClubIds: [9568, 1616, 1608, 1595, 1605], // Inter Miami, LAFC, Atlanta United, Seattle, LA Galaxy
    localPlayerNames: ['Christian Pulisic', 'Weston McKennie', 'Folarin Balogun', 'Tim Weah', 'Gio Reyna'],
    suggestedLeagueIds:  [1, 253, 39, 2, 140],          // Mundial (co-host!), MLS, Premier, Champions, La Liga
    secondaryLeagueIds:  [3, 16, 262, 78, 135, 848],   // Europa, CCC, Liga MX, Bundes, Serie A, Conference
  },

  // 🇪🇸 España
  ES: {
    label: 'España',
    nationalTeamId: 9,
    localClubIds: [541, 529, 530, 536, 548, 531, 532, 543, 533], // Madrid, Barça, Atlético, Sevilla, Real Sociedad, Athletic, Valencia, Betis, Villarreal
    localPlayerNames: ['Lamine Yamal', 'Pedri', 'Rodri', 'Nico Williams', 'Ferran Torres', 'Álvaro Morata', 'Dani Olmo'],
    suggestedLeagueIds:  [1, 140, 2, 39, 78, 135],      // Mundial, La Liga, Champions, Premier, Bundes, Serie A
    secondaryLeagueIds:  [3, 61, 94, 848, 253],         // Europa, Ligue 1, Liga Portugal, Conference, MLS
  },

  // 🇨🇴 Colombia
  CO: {
    label: 'Colombia',
    nationalTeamId: 8,
    localClubIds: [], // No local clubs in POPULAR_TEAMS yet — falls back to globals
    localPlayerNames: ['James Rodríguez', 'Luis Díaz', 'Falcao', 'Davinson Sánchez'],
    suggestedLeagueIds:  [1, 140, 2, 39, 253],          // Mundial, La Liga, Champions, Premier, MLS
    secondaryLeagueIds:  [13, 3, 262, 128, 71, 135],
  },

  // 🇨🇱 Chile (no clasificó al Mundial 2026, sin selección hardcoded)
  CL: {
    label: 'Chile',
    nationalTeamId: 0,
    localClubIds: [],
    localPlayerNames: ['Alexis Sánchez', 'Arturo Vidal'],
    suggestedLeagueIds:  [1, 140, 2, 39, 128],          // Mundial, La Liga, Champions, Premier, Liga Pro Arg
    secondaryLeagueIds:  [13, 3, 71, 253, 135],
  },

  // 🇵🇪 Perú (mismo caso que Chile)
  PE: {
    label: 'Perú',
    nationalTeamId: 0,
    localClubIds: [],
    localPlayerNames: [],
    suggestedLeagueIds:  [1, 140, 2, 39, 128],
    secondaryLeagueIds:  [13, 3, 71, 253, 135],
  },

  // Default fallback when country is unknown or not in the map.
  // Tilts toward the primary audience (mexicano) since that's the majority.
  DEFAULT: {
    label: 'Default (LATAM tilt)',
    nationalTeamId: 0,
    localClubIds: [541, 529, 50, 33, 40, 85, 157], // Madrid, Barça, City, ManU, Liverpool, PSG, Bayern
    localPlayerNames: ['Lionel Messi', 'Cristiano Ronaldo', 'Kylian Mbappé', 'Erling Haaland', 'Vinícius Júnior', 'Jude Bellingham', 'Lamine Yamal'],
    suggestedLeagueIds:  [1, 2, 39, 140, 78, 135],      // Mundial, Champions, Premier, La Liga, Bundes, Serie A
    secondaryLeagueIds:  [3, 61, 253, 262, 94, 848],
  },
};

// ── Globals (mixed in for every country, deduped against the user's preset) ──

/**
 * Top-6 most-followed national teams worldwide. These get intercalated in the
 * grid AFTER the user's local clubs (positions ~8, 10, 12, 14, 16, 18).
 * Excludes the user's own national team to avoid duplicates.
 */
export const GLOBAL_NATIONAL_TEAMS_TOP_6: number[] = [
  26, // Argentina (campeón Mundial 2022, Messi)
  6, // Brasil
  2, // Francia
  9, // España
  10, // Inglaterra
  25, // Alemania
];

/**
 * Top-8 most-followed clubs worldwide. Intercalated with national teams in
 * the grid mix. The user may already have some of these in localClubIds
 * (e.g. a Spanish user has Madrid + Barça locally) — the build function
 * dedupes.
 */
export const GLOBAL_CLUBS_TOP_8: number[] = [
  541,   // Real Madrid
  529,     // FC Barcelona
  50,      // Manchester City
  33,     // Manchester United
  40,      // Liverpool
  85,    // PSG
  157,    // Bayern München
  9568, // Inter Miami (Messi effect)
];

/**
 * @deprecated Use PLAYER_POPULARITY in services/football/popular.ts instead.
 *
 * Globally famous players (Ballon d'Or candidates / megastars). Previously
 * used by buildOnboardingPlayerNames to intercalate stars after the country
 * locals. Replaced by the popularity-based ranking system which handles both
 * globals and locals via per-country boosts.
 *
 * Kept exported for backward compatibility in case some future feature wants
 * a "curated global stars" list (e.g. a "Trending players" widget).
 */
export const GLOBAL_STAR_PLAYERS: string[] = [
  'Lionel Messi',
  'Cristiano Ronaldo',
  'Kylian Mbappé',
  'Erling Haaland',
  'Vinícius Júnior',
  'Jude Bellingham',
  'Lamine Yamal',
  'Pedri',
];

/**
 * Get the preset for a country, with intelligent fallback.
 *
 * Special case: hispanic users in the US (regionCode=US AND language=es)
 * default to the MX preset since they overwhelmingly want Liga MX content
 * + MLS, not pure US/Premier-League content.
 */
export function getCountryPreset(country: string, language?: string): CountryPreset {
  // Mexican-American (latino in US) heuristic
  if (country === 'US' && language === 'es') {
    return {
      ...COUNTRY_PRESETS.MX,
      label: 'Hispanic-USA (MX + MLS hybrid)',
      // Add Inter Miami + LAFC after the Mexican clubs since user lives in US
      localClubIds: [...COUNTRY_PRESETS.MX.localClubIds.slice(0, 6), 9568, 1616],
      suggestedLeagueIds:  [1, 262, 253, 2, 140, 39], // Mundial, Liga MX, MLS, Champions, La Liga, Premier
      secondaryLeagueIds:  [3, 16, 78, 135, 61, 94, 848],
    };
  }
  return COUNTRY_PRESETS[country] ?? COUNTRY_PRESETS.DEFAULT;
}
