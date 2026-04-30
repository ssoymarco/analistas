// ── i18n configuration ───────────────────────────────────────────────────────
// Uses expo-localization to auto-detect device language.
// Falls back to Spanish (es) if the device language isn't supported.
//
// Usage in components:
//   import { useTranslation } from 'react-i18next';
//   const { t } = useTranslation();
//   <Text>{t('nav.matches')}</Text>
//   <Text>{t('cup.inProgress', { count: 4 })}</Text>
//
// For arrays (dates, months):
//   import { useTranslation } from 'react-i18next';
//   const { t } = useTranslation();
//   const dayNames = t('dates.daysShort', { returnObjects: true }) as string[];
//
// To change language programmatically:
//   import i18n from '../i18n';
//   i18n.changeLanguage('en');

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import es from './locales/es';
import en from './locales/en';
import pt from './locales/pt';
import fr from './locales/fr';
import de from './locales/de';
import it from './locales/it';
import tr from './locales/tr';

// Get device language (e.g. "es", "en", "pt")
const deviceLanguage = getLocales()[0]?.languageCode ?? 'es';

// Supported languages — add new ones here + create locales/{code}.ts
const SUPPORTED_LANGUAGES = ['es', 'en', 'pt', 'fr', 'de', 'it', 'tr'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
export const LANGUAGE_STORAGE_KEY = 'analistas_language';

// Resolve device language to a supported one (fallback to 'es')
function resolveLanguage(lang: string): SupportedLanguage {
  if (SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
    return lang as SupportedLanguage;
  }
  return 'es'; // Default fallback
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      pt: { translation: pt },
      fr: { translation: fr },
      de: { translation: de },
      it: { translation: it },
      tr: { translation: tr },
    },
    lng: resolveLanguage(deviceLanguage),
    fallbackLng: 'es',
    interpolation: {
      escapeValue: false, // React already escapes
    },
    // Return key path if translation is missing (helps catch missing keys)
    returnNull: false,
    returnEmptyString: false,
  });

/**
 * Call once at app startup (after i18n.init) to restore the user's saved
 * language preference from AsyncStorage, overriding the device default.
 */
export async function applyStoredLanguage(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.includes(saved as SupportedLanguage)) {
      await i18n.changeLanguage(saved);
    }
  } catch {
    // Silent — device language remains active
  }
}

export default i18n;

// Re-export for convenience
export { useTranslation } from 'react-i18next';
