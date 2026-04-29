// ── Device country detection ────────────────────────────────────────────────
// Reads the device's current region (ISO 3166-1 alpha-2) from expo-localization.
// Used by onboarding to flag the user's local league(s) as "Sugerida" without
// asking for geolocation permission.
import { getLocales } from 'expo-localization';

/**
 * Returns the device's current region code (e.g. "MX", "US", "ES"), or
 * `undefined` if it can't be determined. Never throws.
 *
 * Note: this reads from device locale settings, NOT from GPS / IP geolocation,
 * so it reflects the phone's configured region rather than the user's current
 * physical location. For onboarding suggestions that's exactly what we want.
 */
export function getDeviceCountry(): string | undefined {
  try {
    const locales = getLocales();
    const region = locales[0]?.regionCode;
    if (!region) return undefined;
    const upper = region.toUpperCase();
    return /^[A-Z]{2}$/.test(upper) ? upper : undefined;
  } catch {
    return undefined;
  }
}
