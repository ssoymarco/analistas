/**
 * useUserCountry — detect the user's country for onboarding personalization.
 *
 * Strategy (2 layers):
 *   1. expo-localization regionCode — instant, offline, no network
 *      → reads from device's locale (e.g. "MX" if iPhone is set to Español MX)
 *   2. Cloudflare Worker /geo — verified via edge IP geolocation
 *      → calls https://analistas-proxy.../geo which returns { country }
 *      → ~95% accurate, single network call, cached forever in AsyncStorage
 *
 * The Worker result is the source of truth once we have it. The device locale
 * is shown immediately to avoid waiting on the network — the Worker result
 * supersedes it in the background (and is cached for next launches).
 *
 * Manual override: set AsyncStorage key `analistas_country_override` to any
 * ISO 3166-1 alpha-2 code (e.g. "AR") for QA. Skips network entirely.
 */

import { useState, useEffect } from 'react';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROXY_GEO_URL  = 'https://analistas-proxy.marquitojr92.workers.dev/geo';
const CACHE_KEY      = 'analistas_user_country_v1';
const OVERRIDE_KEY   = 'analistas_country_override';
const DEFAULT_COUNTRY = 'MX'; // sensible default for primary audience

export interface UserCountry {
  /** ISO 3166-1 alpha-2 code (e.g. "MX", "AR", "US"). Never null. */
  country: string;
  /** ISO 639-1 language code (e.g. "es", "en"). Never null. */
  language: string;
  /**
   * Source of the country code:
   *   - 'override' = manual QA override from AsyncStorage
   *   - 'worker'   = verified via Cloudflare /geo (most accurate)
   *   - 'locale'   = device locale (initial, may update to 'worker' shortly)
   *   - 'default'  = fallback when everything else failed
   */
  source: 'override' | 'worker' | 'locale' | 'default';
  /** False during the brief moment before the first layer resolves. */
  ready: boolean;
}

/**
 * Reads device locale synchronously — no network, no permissions.
 * Returns the regionCode (e.g. "MX") and languageCode (e.g. "es").
 */
function readDeviceLocale(): { country: string | null; language: string } {
  try {
    const locales = getLocales();
    const primary = locales[0];
    return {
      country:  primary?.regionCode ?? null,
      language: primary?.languageCode ?? 'es',
    };
  } catch {
    return { country: null, language: 'es' };
  }
}

/**
 * Fetches the country from the Cloudflare Worker. Returns null on failure.
 * Cached aggressively — we only need to call once per install.
 */
async function fetchCountryFromWorker(): Promise<string | null> {
  try {
    // 4-second timeout — if the Worker is slow we stick with the locale
    const ctrl   = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 4000);
    const res    = await fetch(PROXY_GEO_URL, { signal: ctrl.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data   = await res.json() as { country?: string | null };
    return data.country ?? null;
  } catch {
    return null;
  }
}

export function useUserCountry(): UserCountry {
  // Read device locale synchronously so the very first render has a value
  const initialLocale = readDeviceLocale();
  const [country,  setCountry]  = useState<string>(initialLocale.country ?? DEFAULT_COUNTRY);
  const [language] = useState<string>(initialLocale.language);
  const [source,   setSource]   = useState<UserCountry['source']>(
    initialLocale.country ? 'locale' : 'default'
  );
  const [ready,    setReady]    = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // ── 1. Manual override (QA/dev) ───────────────────────────────────────
      try {
        const override = await AsyncStorage.getItem(OVERRIDE_KEY);
        if (override && /^[A-Z]{2}$/.test(override) && !cancelled) {
          setCountry(override);
          setSource('override');
          setReady(true);
          return;
        }
      } catch {/* ignore */}

      // ── 2. Cached Worker result (persists across launches) ────────────────
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached && /^[A-Z]{2}$/.test(cached) && !cancelled) {
          setCountry(cached);
          setSource('worker');
          setReady(true);
          // Still refresh in background in case the user moved countries.
          // But don't block the UI on it.
          fetchCountryFromWorker().then(fresh => {
            if (fresh && fresh !== cached && !cancelled) {
              AsyncStorage.setItem(CACHE_KEY, fresh);
              setCountry(fresh);
            }
          }).catch(() => {});
          return;
        }
      } catch {/* ignore */}

      // ── 3. Fresh Worker call ──────────────────────────────────────────────
      const fresh = await fetchCountryFromWorker();
      if (cancelled) return;

      if (fresh && /^[A-Z]{2}$/.test(fresh)) {
        AsyncStorage.setItem(CACHE_KEY, fresh).catch(() => {});
        setCountry(fresh);
        setSource('worker');
      }
      // else: keep the initial locale value (already in state)
      setReady(true);
    })();

    return () => { cancelled = true; };
  }, []);

  return { country, language, source, ready };
}
