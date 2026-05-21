// ── Team logo overrides ──────────────────────────────────────────────────────
// SportMonks' team CDN occasionally lags behind a rebrand (e.g. Cruz Azul
// shipped a new crest in 2024-25 but cdn.sportmonks.com still serves the
// classic "DEPORTIVO CRUZ AZUL MEXICO" badge). This map lets us substitute
// any team's logo at the data layer without touching SportMonks at all —
// new logos take effect on the next app build / OTA.
//
// Adding a logo:
//   1. Drop the PNG (or SVG-as-PNG export) at:
//        assets/team-logos/<sportmonks_team_id>.png
//      Recommended size: 256×256, transparent background, square crop.
//   2. Add a `require()` line to OVERRIDE_ASSETS below, keyed by team_id.
//   3. Done. The override applies everywhere a Team object is constructed
//      (matches, standings, top scorers, team detail page).
//
// Important: `require()` paths are resolved by Metro at bundle time, so
// they must be string literals (cannot be dynamic). Keep one require per
// team. The map intentionally lives in this file (not generated) so the
// commit history is grep-able.

import { Image } from 'react-native';

// ── Raw override map ────────────────────────────────────────────────────────
// Keys are SportMonks team_id strings (NOT numbers — Match.homeTeam.id is a
// string). Values come from `require(...)` for bundled assets, or can be
// plain URL strings for remote-hosted overrides if that's ever preferred.
//
// To add Cruz Azul (id 2626): drop the file at assets/team-logos/2626.png
// then uncomment the line below. (Left commented so the bundle doesn't fail
// before the file is present.)
const OVERRIDE_ASSETS: Record<string, number | string> = {
  // '2626': require('../../assets/team-logos/2626.png'), // Cruz Azul — new crest 2024
};

// ── Resolved URI cache ──────────────────────────────────────────────────────
// `Image.resolveAssetSource` turns a require'd asset into an { uri, ... } the
// rest of the app can use as `<Image source={{ uri }} />` without any code
// changes. We resolve once at module load and cache the strings.
const RESOLVED: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [id, asset] of Object.entries(OVERRIDE_ASSETS)) {
    if (typeof asset === 'string') {
      // Plain URL — pass through.
      out[id] = asset;
      continue;
    }
    try {
      const resolved = Image.resolveAssetSource(asset);
      if (resolved?.uri) out[id] = resolved.uri;
    } catch {
      // Asset resolution can fail in some test environments — silently skip
      // so we just fall back to SportMonks in that case.
    }
  }
  return out;
})();

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns the override URL for `teamId` if present, otherwise the fallback
 * (typically the SportMonks CDN URL). Always safe to call — if the team
 * has no override, the fallback comes back unchanged.
 *
 * Accepts both string and number IDs for caller convenience.
 */
export function resolveTeamLogo(
  teamId: string | number | null | undefined,
  fallback: string | null | undefined,
): string {
  if (teamId == null) return fallback ?? '';
  const override = RESOLVED[String(teamId)];
  return override ?? fallback ?? '';
}

/** Quick existence check — useful for debug screens and test assertions. */
export function hasTeamLogoOverride(teamId: string | number): boolean {
  return String(teamId) in RESOLVED;
}
