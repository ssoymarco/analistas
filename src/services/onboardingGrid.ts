/**
 * onboardingGrid — builds the ordered list of teams/players shown in the
 * onboarding pickers based on the user's country.
 *
 * The order is deterministic for a given (country, language) pair so the
 * "Mostrar más" pagination is stable across re-renders.
 *
 * Order of teams returned:
 *   1. User's national team (if available)
 *   2. User's local clubs (in preset order)
 *   3. Mixed globals: top-6 national teams (excluding user's own) intercalated
 *      with top-8 global clubs
 *   4. Remaining POPULAR_TEAMS (preserves original popularity ordering)
 *   5. Remaining POPULAR_NATIONAL_TEAMS (other selecciones nacionales)
 *
 * The first 18 entries are shown by default; "Mostrar más" reveals +9 each tap.
 *
 * Order of players returned:
 *   1. Local players from the preset
 *   2. Global star players (Messi, CR7, Mbappé, Haaland, Vini, Bellingham, Yamal)
 *   3. Remaining POPULAR_PLAYER_NAMES
 *
 * IMPORTANT — Product rule (see countryPresets.ts):
 *   • Selecting TEAMS subscribes to notifications.
 *   • Selecting LEAGUES is feed-display ordering only — NOT notifications.
 */

import {
  POPULAR_TEAMS,
  POPULAR_NATIONAL_TEAMS,
  POPULAR_PLAYER_NAMES,
  getPlayerPopularity,
} from './sportsApi';
import type { SearchableTeam } from './sportsApi';
import {
  GLOBAL_NATIONAL_TEAMS_TOP_6,
  GLOBAL_CLUBS_TOP_8,
  getCountryPreset,
} from '../config/countryPresets';

/**
 * Returns the full ordered team list for the user's country.
 * The onboarding screen slices [0..18], then [0..27], [0..36], etc.
 */
export function buildOnboardingTeamGrid(
  country: string,
  language?: string,
): SearchableTeam[] {
  const preset = getCountryPreset(country, language);

  // Build a single lookup map for O(1) ID → team resolution
  const allTeamsById = new Map<number, SearchableTeam>();
  for (const t of POPULAR_TEAMS)          allTeamsById.set(t.id, t);
  for (const t of POPULAR_NATIONAL_TEAMS) allTeamsById.set(t.id, t);

  const result: SearchableTeam[] = [];
  const seen = new Set<number>();
  const push = (id: number) => {
    if (seen.has(id)) return;
    const t = allTeamsById.get(id);
    if (!t) return; // silently skip IDs we don't have hardcoded
    seen.add(id);
    result.push(t);
  };

  // 1. User's national team (if defined in preset and in POPULAR_NATIONAL_TEAMS)
  if (preset.nationalTeamId > 0) push(preset.nationalTeamId);

  // 2. Local clubs (preset order = popularity order)
  for (const id of preset.localClubIds) push(id);

  // 3. Mixed globals — intercalate national teams (excluding user's own)
  //    with global clubs for visual variety
  const globalNats = GLOBAL_NATIONAL_TEAMS_TOP_6.filter(id => id !== preset.nationalTeamId);
  const globalClubs = GLOBAL_CLUBS_TOP_8;
  const mixedLen = Math.max(globalNats.length, globalClubs.length);
  for (let i = 0; i < mixedLen; i++) {
    if (i < globalNats.length)  push(globalNats[i]);
    if (i < globalClubs.length) push(globalClubs[i]);
  }

  // 4. Remaining POPULAR_TEAMS (anything not yet pushed)
  for (const t of POPULAR_TEAMS)          push(t.id);

  // 5. Remaining national teams (other countries' selecciones, for "Mostrar más")
  for (const t of POPULAR_NATIONAL_TEAMS) push(t.id);

  return result;
}

/**
 * Returns the ordered list of player NAMES for the player picker.
 *
 * Order is purely driven by popularity (country-aware), NOT by a
 * "locals-first-then-globals" segmentation. This lets us:
 *   - Pin Messi/CR7/Mbappé/Haaland above all locals for non-AR/non-BR users
 *   - Pin local heroes ABOVE Messi when it makes sense (e.g. Santi Giménez
 *     in MX, Lamine Yamal in ES, Bellingham in GB) via per-country overrides
 *   - Keep niche names (resolvable but uninteresting) at the bottom
 *
 * The candidate pool is:
 *   - All names in POPULAR_PLAYER_NAMES (curated repertoire, ~70 names)
 *   - All names in preset.localPlayerNames (in case any aren't in the
 *     repertoire — defensive)
 *
 * See services/sportsApi.ts → PLAYER_POPULARITY + PLAYER_POPULARITY_BY_COUNTRY.
 */
export function buildOnboardingPlayerNames(
  country: string,
  language?: string,
): string[] {
  const preset = getCountryPreset(country, language);

  // Build de-duped candidate pool. Lowercase key so 'Lionel Messi' from
  // multiple sources collapses to one entry.
  const seen = new Set<string>();
  const candidates: string[] = [];
  const push = (name: string) => {
    const key = name.toLowerCase().trim();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(name);
  };
  preset.localPlayerNames.forEach(push);
  POPULAR_PLAYER_NAMES.forEach(spec => push(spec.name));

  // Sort by popularity DESC, country-aware
  return candidates.sort(
    (a, b) => getPlayerPopularity(b, country) - getPlayerPopularity(a, country),
  );
}

/**
 * Returns the league IDs in display order for the league picker:
 *   1. preset.suggestedLeagueIds in preset order (these get "Sugerida" badge)
 *   2. Remaining leagues from AVAILABLE_LEAGUES (preserves config order)
 *
 * Mundial 2026 (id 732) is always position 1 this season — it's already first
 * in every preset, but if the user's country doesn't have a preset, the
 * DEFAULT preset still pins it.
 */
export function buildOnboardingLeagueOrder(
  country: string,
  language?: string,
): { suggestedIds: Set<number>; order: number[] } {
  const preset = getCountryPreset(country, language);
  const suggestedIds = new Set(preset.suggestedLeagueIds);
  return { suggestedIds, order: preset.suggestedLeagueIds };
}
