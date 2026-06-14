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
 * Player suggestions are by NAME (resolved to SportMonks IDs at runtime via
 * resolvePlayerByName). Names match exactly what's in POPULAR_PLAYER_NAMES
 * in sportsApi.ts; if you list a name here that isn't in that resolver list,
 * it will be silently ignored.
 */
export interface CountryPreset {
  /** Display label for QA/logs */
  label: string;
  /** SportMonks team ID of the national team. Must exist in POPULAR_NATIONAL_TEAMS. */
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

// League ID reference (verified against /src/config/leagues.ts):
//   732  = Mundial 2026 (FIFA World Cup)
//   2    = UEFA Champions League
//   5    = UEFA Europa League
//   2286 = UEFA Conference League
//   8    = Premier League (England)
//   564  = La Liga (España)
//   82   = Bundesliga (Alemania)
//   384  = Serie A (Italia)
//   301  = Ligue 1 (Francia)
//   743  = Liga MX (México)
//   779  = MLS (USA)
//   636  = Liga Profesional Argentina
//   648  = Brasileirão Série A
//   462  = Primeira Liga Portugal      ← NOT Champions League!
//   1111 = CONCACAF Champions Cup
//   1122 = Copa Libertadores (CONMEBOL)
//   1116 = Copa Sudamericana

export const COUNTRY_PRESETS: Record<string, CountryPreset> = {
  // 🇲🇽 México
  MX: {
    label: 'México',
    nationalTeamId: 18576,
    localClubIds: [2687, 427, 2626, 2989, 609, 2662, 967, 10036, 2844, 680], // AME, GUA, CAZ, PUM, TUA, MNT, TOL, PCH, SLA, ATS
    // Removed: Chicharito (apenas juega), Luis Romo, Hirving Lozano (poca actividad).
    // Si quieres recuperarlos: vienen vía search del repertorio global.
    localPlayerNames: ['Santiago Giménez', 'Raúl Jiménez', 'Edson Álvarez', 'Guillermo Ochoa'],
    suggestedLeagueIds:  [732, 743, 2, 8, 564, 779],     // Mundial, Liga MX, Champions, Premier, La Liga, MLS
    secondaryLeagueIds:  [5, 1111, 82, 384, 301, 462, 2286], // Europa, CCC, Bundes, Serie A, Ligue 1, Liga Portugal, Conference
  },

  // 🇦🇷 Argentina
  AR: {
    label: 'Argentina',
    nationalTeamId: 18644,
    localClubIds: [587, 10002, 3608, 10840, 520, 9335, 9904], // Boca, River, Racing, Independiente, San Lorenzo, Estudiantes, Vélez
    localPlayerNames: ['Lionel Messi', 'Lautaro Martínez', 'Julián Álvarez', 'Enzo Fernández', 'Rodrigo De Paul', 'Paulo Dybala', 'Alexis Mac Allister'],
    suggestedLeagueIds:  [732, 636, 564, 2, 8],          // Mundial, Liga Pro Arg, La Liga, Champions, Premier
    secondaryLeagueIds:  [1122, 5, 384, 779, 462, 2286],    // Libertadores, Europa, Serie A, MLS, Liga Portugal, Conference
  },

  // 🇧🇷 Brasil
  BR: {
    label: 'Brasil',
    nationalTeamId: 18704,
    localClubIds: [1024, 3422, 303, 3496, 1095, 3427, 3371, 2925, 3684], // Flamengo, Palmeiras, Corinthians, São Paulo, Fluminense, Atl. Mineiro, Cruzeiro, Grêmio, Santos
    localPlayerNames: ['Vinícius Júnior', 'Rodrygo', 'Raphinha', 'Neymar', 'Casemiro', 'Endrick'],
    suggestedLeagueIds:  [732, 648, 564, 2, 8],          // Mundial, Brasileirão, La Liga, Champions, Premier
    secondaryLeagueIds:  [1122, 5, 384, 779, 462, 2286],
  },

  // 🇺🇸 USA
  US: {
    label: 'United States',
    nationalTeamId: 18571,
    localClubIds: [239235, 147671, 3645, 2649, 413], // Inter Miami, LAFC, Atlanta United, Seattle, LA Galaxy
    localPlayerNames: ['Christian Pulisic', 'Weston McKennie', 'Folarin Balogun', 'Tim Weah', 'Gio Reyna'],
    suggestedLeagueIds:  [732, 779, 8, 2, 564],          // Mundial (co-host!), MLS, Premier, Champions, La Liga
    secondaryLeagueIds:  [5, 1111, 743, 82, 384, 2286],   // Europa, CCC, Liga MX, Bundes, Serie A, Conference
  },

  // 🇪🇸 España
  ES: {
    label: 'España',
    nationalTeamId: 18710,
    localClubIds: [3468, 83, 7980, 676, 594, 13258, 214, 485, 3477], // Madrid, Barça, Atlético, Sevilla, Real Sociedad, Athletic, Valencia, Betis, Villarreal
    localPlayerNames: ['Lamine Yamal', 'Pedri', 'Rodri', 'Nico Williams', 'Ferran Torres', 'Álvaro Morata', 'Dani Olmo'],
    suggestedLeagueIds:  [732, 564, 2, 8, 82, 384],      // Mundial, La Liga, Champions, Premier, Bundes, Serie A
    secondaryLeagueIds:  [5, 301, 462, 2286, 779],         // Europa, Ligue 1, Liga Portugal, Conference, MLS
  },

  // 🇨🇴 Colombia
  CO: {
    label: 'Colombia',
    nationalTeamId: 18720,
    localClubIds: [], // No local clubs in POPULAR_TEAMS yet — falls back to globals
    localPlayerNames: ['James Rodríguez', 'Luis Díaz', 'Falcao', 'Davinson Sánchez'],
    suggestedLeagueIds:  [732, 564, 2, 8, 779],          // Mundial, La Liga, Champions, Premier, MLS
    secondaryLeagueIds:  [1122, 5, 743, 636, 648, 384],
  },

  // 🇨🇱 Chile (no clasificó al Mundial 2026, sin selección hardcoded)
  CL: {
    label: 'Chile',
    nationalTeamId: 0,
    localClubIds: [],
    localPlayerNames: ['Alexis Sánchez', 'Arturo Vidal'],
    suggestedLeagueIds:  [732, 564, 2, 8, 636],          // Mundial, La Liga, Champions, Premier, Liga Pro Arg
    secondaryLeagueIds:  [1122, 5, 648, 779, 384],
  },

  // 🇵🇪 Perú (mismo caso que Chile)
  PE: {
    label: 'Perú',
    nationalTeamId: 0,
    localClubIds: [],
    localPlayerNames: [],
    suggestedLeagueIds:  [732, 564, 2, 8, 636],
    secondaryLeagueIds:  [1122, 5, 648, 779, 384],
  },

  // Default fallback when country is unknown or not in the map.
  // Tilts toward the primary audience (mexicano) since that's the majority.
  DEFAULT: {
    label: 'Default (LATAM tilt)',
    nationalTeamId: 0,
    localClubIds: [3468, 83, 9, 14, 8, 591, 503], // Madrid, Barça, City, ManU, Liverpool, PSG, Bayern
    localPlayerNames: ['Lionel Messi', 'Cristiano Ronaldo', 'Kylian Mbappé', 'Erling Haaland', 'Vinícius Júnior', 'Jude Bellingham', 'Lamine Yamal'],
    suggestedLeagueIds:  [732, 2, 8, 564, 82, 384],      // Mundial, Champions, Premier, La Liga, Bundes, Serie A
    secondaryLeagueIds:  [5, 301, 779, 743, 462, 2286],
  },
};

// ── Globals (mixed in for every country, deduped against the user's preset) ──

/**
 * Top-6 most-followed national teams worldwide. These get intercalated in the
 * grid AFTER the user's local clubs (positions ~8, 10, 12, 14, 16, 18).
 * Excludes the user's own national team to avoid duplicates.
 */
export const GLOBAL_NATIONAL_TEAMS_TOP_6: number[] = [
  18644, // Argentina (campeón Mundial 2022, Messi)
  18704, // Brasil
  18647, // Francia
  18710, // España
  18645, // Inglaterra
  18660, // Alemania
];

/**
 * Top-8 most-followed clubs worldwide. Intercalated with national teams in
 * the grid mix. The user may already have some of these in localClubIds
 * (e.g. a Spanish user has Madrid + Barça locally) — the build function
 * dedupes.
 */
export const GLOBAL_CLUBS_TOP_8: number[] = [
  3468,   // Real Madrid
  83,     // FC Barcelona
  9,      // Manchester City
  14,     // Manchester United
  8,      // Liverpool
  591,    // PSG
  503,    // Bayern München
  239235, // Inter Miami (Messi effect)
];

/**
 * @deprecated Use PLAYER_POPULARITY in services/sportsApi.ts instead.
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
      localClubIds: [...COUNTRY_PRESETS.MX.localClubIds.slice(0, 6), 239235, 147671],
      suggestedLeagueIds:  [732, 743, 779, 2, 564, 8], // Mundial, Liga MX, MLS, Champions, La Liga, Premier
      secondaryLeagueIds:  [5, 1111, 82, 384, 301, 462, 2286],
    };
  }
  return COUNTRY_PRESETS[country] ?? COUNTRY_PRESETS.DEFAULT;
}
