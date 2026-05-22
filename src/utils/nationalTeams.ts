// ── National team / country name translations ────────────────────────────────
// SportMonks always returns team and country names in English.
// We translate to the user's current app language using i18n.
//
// Supported languages: es (default), en (no-op), fr, de, it, tr, ar
// For English the name is returned as-is (SportMonks already uses English).
// For unsupported locales we fall back to the SportMonks English name.

import i18n from '../i18n';

// ── Per-language dictionaries ─────────────────────────────────────────────────
// key = SportMonks English name, value = localized name

const TEAMS_ES: Record<string, string> = {
  'Afghanistan': 'Afganistán', 'Albania': 'Albania', 'Algeria': 'Argelia',
  'Angola': 'Angola', 'Argentina': 'Argentina', 'Armenia': 'Armenia',
  'Australia': 'Australia', 'Austria': 'Austria', 'Azerbaijan': 'Azerbaiyán',
  'Bahrain': 'Baréin', 'Belgium': 'Bélgica', 'Bolivia': 'Bolivia',
  'Bosnia and Herzegovina': 'Bosnia y Herzegovina', 'Brazil': 'Brasil',
  'Bulgaria': 'Bulgaria', 'Cameroon': 'Camerún', 'Canada': 'Canadá',
  'Chile': 'Chile', 'China PR': 'China', 'Colombia': 'Colombia',
  'Congo DR': 'Congo RD', 'Costa Rica': 'Costa Rica', 'Croatia': 'Croacia',
  'Czech Republic': 'República Checa', 'Czechia': 'República Checa',
  'Denmark': 'Dinamarca', 'Ecuador': 'Ecuador', 'Egypt': 'Egipto',
  'England': 'Inglaterra', 'Finland': 'Finlandia', 'France': 'Francia',
  'Germany': 'Alemania', 'Ghana': 'Ghana', 'Greece': 'Grecia',
  'Guatemala': 'Guatemala', 'Honduras': 'Honduras', 'Hungary': 'Hungría',
  'India': 'India', 'Indonesia': 'Indonesia', 'Iran': 'Irán',
  'Iraq': 'Irak', 'Ireland': 'Irlanda', 'Israel': 'Israel',
  'Italy': 'Italia', 'Ivory Coast': 'Costa de Marfil', 'Jamaica': 'Jamaica',
  'Japan': 'Japón', 'Jordan': 'Jordania', 'Kenya': 'Kenia',
  'Korea DPR': 'Corea del Norte', 'Korea Republic': 'Corea del Sur',
  'Kosovo': 'Kosovo', 'Kuwait': 'Kuwait', 'Mali': 'Malí',
  'Mexico': 'México', 'Morocco': 'Marruecos', 'Netherlands': 'Países Bajos',
  'New Zealand': 'Nueva Zelanda', 'Nigeria': 'Nigeria', 'Norway': 'Noruega',
  'Oman': 'Omán', 'Panama': 'Panamá', 'Paraguay': 'Paraguay',
  'Peru': 'Perú', 'Poland': 'Polonia', 'Portugal': 'Portugal',
  'Qatar': 'Catar', 'Romania': 'Rumanía', 'Russia': 'Rusia',
  'Saudi Arabia': 'Arabia Saudita', 'Scotland': 'Escocia',
  'Senegal': 'Senegal', 'Serbia': 'Serbia', 'Slovakia': 'Eslovaquia',
  'Slovenia': 'Eslovenia', 'South Africa': 'Sudáfrica',
  'South Korea': 'Corea del Sur', 'Spain': 'España', 'Sweden': 'Suecia',
  'Switzerland': 'Suiza', 'Thailand': 'Tailandia', 'Tunisia': 'Túnez',
  'Turkey': 'Türkiye', 'Türkiye': 'Türkiye', 'Ukraine': 'Ucrania',
  'United Arab Emirates': 'Emiratos Árabes', 'United States': 'Estados Unidos',
  'USA': 'Estados Unidos', 'Uruguay': 'Uruguay', 'Venezuela': 'Venezuela',
  'Wales': 'Gales', 'Zimbabwe': 'Zimbabue',
};

const TEAMS_FR: Record<string, string> = {
  'Algeria': 'Algérie', 'Argentina': 'Argentine', 'Australia': 'Australie',
  'Austria': 'Autriche', 'Belgium': 'Belgique', 'Bolivia': 'Bolivie',
  'Bosnia and Herzegovina': 'Bosnie-Herzégovine', 'Brazil': 'Brésil',
  'Cameroon': 'Cameroun', 'Canada': 'Canada', 'Chile': 'Chili',
  'China PR': 'Chine', 'Croatia': 'Croatie', 'Czech Republic': 'Tchéquie',
  'Czechia': 'Tchéquie', 'Denmark': 'Danemark', 'Egypt': 'Égypte',
  'England': 'Angleterre', 'France': 'France', 'Germany': 'Allemagne',
  'Greece': 'Grèce', 'Hungary': 'Hongrie', 'Indonesia': 'Indonésie',
  'Iran': 'Iran', 'Ireland': 'Irlande', 'Israel': 'Israël',
  'Italy': 'Italie', 'Ivory Coast': 'Côte d\'Ivoire', 'Japan': 'Japon',
  'Jordan': 'Jordanie', 'Korea DPR': 'Corée du Nord',
  'Korea Republic': 'Corée du Sud', 'Mexico': 'Mexique',
  'Morocco': 'Maroc', 'Netherlands': 'Pays-Bas', 'New Zealand': 'Nouvelle-Zélande',
  'Norway': 'Norvège', 'Panama': 'Panama', 'Peru': 'Pérou',
  'Poland': 'Pologne', 'Portugal': 'Portugal', 'Qatar': 'Qatar',
  'Romania': 'Roumanie', 'Russia': 'Russie', 'Saudi Arabia': 'Arabie Saoudite',
  'Scotland': 'Écosse', 'Serbia': 'Serbie', 'Slovakia': 'Slovaquie',
  'Slovenia': 'Slovénie', 'South Africa': 'Afrique du Sud',
  'Spain': 'Espagne', 'Sweden': 'Suède', 'Switzerland': 'Suisse',
  'Tunisia': 'Tunisie', 'Turkey': 'Turquie', 'Türkiye': 'Turquie',
  'Ukraine': 'Ukraine', 'United Arab Emirates': 'Émirats arabes unis',
  'United States': 'États-Unis', 'USA': 'États-Unis', 'Uruguay': 'Uruguay',
  'Wales': 'Pays de Galles',
};

const TEAMS_DE: Record<string, string> = {
  'Algeria': 'Algerien', 'Argentina': 'Argentinien', 'Australia': 'Australien',
  'Austria': 'Österreich', 'Belgium': 'Belgien', 'Brazil': 'Brasilien',
  'Canada': 'Kanada', 'China PR': 'China', 'Croatia': 'Kroatien',
  'Czech Republic': 'Tschechien', 'Czechia': 'Tschechien',
  'Denmark': 'Dänemark', 'Egypt': 'Ägypten', 'England': 'England',
  'France': 'Frankreich', 'Germany': 'Deutschland', 'Greece': 'Griechenland',
  'Hungary': 'Ungarn', 'Iran': 'Iran', 'Ireland': 'Irland',
  'Italy': 'Italien', 'Japan': 'Japan', 'Korea DPR': 'Nordkorea',
  'Korea Republic': 'Südkorea', 'Mexico': 'Mexiko',
  'Morocco': 'Marokko', 'Netherlands': 'Niederlande',
  'New Zealand': 'Neuseeland', 'Norway': 'Norwegen', 'Peru': 'Peru',
  'Poland': 'Polen', 'Portugal': 'Portugal', 'Romania': 'Rumänien',
  'Russia': 'Russland', 'Saudi Arabia': 'Saudi-Arabien',
  'Scotland': 'Schottland', 'Serbia': 'Serbien', 'Slovakia': 'Slowakei',
  'Slovenia': 'Slowenien', 'South Africa': 'Südafrika', 'Spain': 'Spanien',
  'Sweden': 'Schweden', 'Switzerland': 'Schweiz', 'Tunisia': 'Tunesien',
  'Turkey': 'Türkei', 'Türkiye': 'Türkei', 'Ukraine': 'Ukraine',
  'United Arab Emirates': 'Vereinigte Arabische Emirate',
  'United States': 'Vereinigte Staaten', 'USA': 'USA', 'Wales': 'Wales',
};

const TEAMS_IT: Record<string, string> = {
  'Algeria': 'Algeria', 'Argentina': 'Argentina', 'Australia': 'Australia',
  'Belgium': 'Belgio', 'Brazil': 'Brasile', 'Canada': 'Canada',
  'China PR': 'Cina', 'Croatia': 'Croazia', 'Czech Republic': 'Repubblica Ceca',
  'Czechia': 'Repubblica Ceca', 'Denmark': 'Danimarca', 'Egypt': 'Egitto',
  'England': 'Inghilterra', 'France': 'Francia', 'Germany': 'Germania',
  'Greece': 'Grecia', 'Hungary': 'Ungheria', 'Iran': 'Iran',
  'Ireland': 'Irlanda', 'Italy': 'Italia', 'Japan': 'Giappone',
  'Korea DPR': 'Corea del Nord', 'Korea Republic': 'Corea del Sud',
  'Mexico': 'Messico', 'Morocco': 'Marocco', 'Netherlands': 'Paesi Bassi',
  'New Zealand': 'Nuova Zelanda', 'Norway': 'Norvegia', 'Poland': 'Polonia',
  'Portugal': 'Portogallo', 'Romania': 'Romania', 'Russia': 'Russia',
  'Saudi Arabia': 'Arabia Saudita', 'Scotland': 'Scozia', 'Spain': 'Spagna',
  'Sweden': 'Svezia', 'Switzerland': 'Svizzera', 'Tunisia': 'Tunisia',
  'Turkey': 'Turchia', 'Türkiye': 'Turchia', 'Ukraine': 'Ucraina',
  'United States': 'Stati Uniti', 'USA': 'USA',
};

const TEAMS_TR: Record<string, string> = {
  'Argentina': 'Arjantin', 'Australia': 'Avustralya', 'Austria': 'Avusturya',
  'Belgium': 'Belçika', 'Brazil': 'Brezilya', 'Canada': 'Kanada',
  'China PR': 'Çin', 'Croatia': 'Hırvatistan', 'Czech Republic': 'Çekya',
  'Czechia': 'Çekya', 'Denmark': 'Danimarka', 'Egypt': 'Mısır',
  'England': 'İngiltere', 'France': 'Fransa', 'Germany': 'Almanya',
  'Greece': 'Yunanistan', 'Hungary': 'Macaristan', 'Iran': 'İran',
  'Ireland': 'İrlanda', 'Italy': 'İtalya', 'Japan': 'Japonya',
  'Korea DPR': 'Kuzey Kore', 'Korea Republic': 'Güney Kore',
  'Mexico': 'Meksika', 'Morocco': 'Fas', 'Netherlands': 'Hollanda',
  'Norway': 'Norveç', 'Poland': 'Polonya', 'Portugal': 'Portekiz',
  'Romania': 'Romanya', 'Russia': 'Rusya', 'Saudi Arabia': 'Suudi Arabistan',
  'Scotland': 'İskoçya', 'South Africa': 'Güney Afrika', 'Spain': 'İspanya',
  'Sweden': 'İsveç', 'Switzerland': 'İsviçre', 'Tunisia': 'Tunus',
  'Turkey': 'Türkiye', 'Türkiye': 'Türkiye', 'Ukraine': 'Ukrayna',
  'United States': 'Amerika Birleşik Devletleri', 'USA': 'ABD',
};

const LANG_MAP: Record<string, Record<string, string>> = {
  es: TEAMS_ES,
  fr: TEAMS_FR,
  de: TEAMS_DE,
  it: TEAMS_IT,
  tr: TEAMS_TR,
  // en: identity (SportMonks names are already English)
  // ar: TODO — Arabic RTL names (future phase)
};

/**
 * Translate a national team name to the user's current app language.
 * Falls back to the English name from SportMonks for unsupported locales
 * or unknown team names.
 *
 * Safe to call on club names (Real Madrid, América, etc.) — they won't
 * be in any dictionary and are returned unchanged.
 */
export function translateNationalTeam(name: string): string {
  const lang = (i18n.language || 'es').slice(0, 2);
  return LANG_MAP[lang]?.[name] ?? name;
}

// ── League country labels ─────────────────────────────────────────────────────

const COUNTRY_ES: Record<string, string> = {
  'World': 'Internacional', 'Europe': 'Europa',
  'South America': 'Sudamérica', 'North America': 'Norteamérica',
  'Africa': 'África', 'Asia': 'Asia', 'Oceania': 'Oceanía',
  ...TEAMS_ES,
};
const COUNTRY_FR: Record<string, string> = {
  'World': 'International', 'Europe': 'Europe',
  'South America': 'Amérique du Sud', 'North America': 'Amérique du Nord',
  'Africa': 'Afrique', 'Asia': 'Asie', 'Oceania': 'Océanie',
  ...TEAMS_FR,
};
const COUNTRY_DE: Record<string, string> = {
  'World': 'International', 'Europe': 'Europa',
  'South America': 'Südamerika', 'North America': 'Nordamerika',
  'Africa': 'Afrika', 'Asia': 'Asien', 'Oceania': 'Ozeanien',
  ...TEAMS_DE,
};
const COUNTRY_IT: Record<string, string> = {
  'World': 'Internazionale', 'Europe': 'Europa',
  'South America': 'Sud America', 'North America': 'Nord America',
  'Africa': 'Africa', 'Asia': 'Asia', 'Oceania': 'Oceania',
  ...TEAMS_IT,
};
const COUNTRY_TR: Record<string, string> = {
  'World': 'Uluslararası', 'Europe': 'Avrupa',
  'South America': 'Güney Amerika', 'North America': 'Kuzey Amerika',
  'Africa': 'Afrika', 'Asia': 'Asya', 'Oceania': 'Okyanusya',
  ...TEAMS_TR,
};

const COUNTRY_LANG_MAP: Record<string, Record<string, string>> = {
  es: COUNTRY_ES, fr: COUNTRY_FR, de: COUNTRY_DE,
  it: COUNTRY_IT, tr: COUNTRY_TR,
};

/** Translate a league country string to the current app language. */
export function translateLeagueCountry(country: string): string {
  const lang = (i18n.language || 'es').slice(0, 2);
  return COUNTRY_LANG_MAP[lang]?.[country] ?? country;
}
