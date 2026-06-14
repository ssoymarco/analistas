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
  'Cape Verde Islands': 'Cabo Verde', 'Cape Verde': 'Cabo Verde',
  'Congo DR': 'Congo RD', 'Costa Rica': 'Costa Rica', 'Croatia': 'Croacia',
  'Curacao': 'Curazao', 'Curaçao': 'Curazao',
  'Czech Republic': 'República Checa', 'Czechia': 'República Checa',
  'Denmark': 'Dinamarca', 'Ecuador': 'Ecuador', 'Egypt': 'Egipto',
  'England': 'Inglaterra', 'Finland': 'Finlandia', 'France': 'Francia',
  'Germany': 'Alemania', 'Ghana': 'Ghana', 'Greece': 'Grecia',
  'Guatemala': 'Guatemala', 'Honduras': 'Honduras', 'Hungary': 'Hungría',
  'India': 'India', 'Indonesia': 'Indonesia', 'Iran': 'Irán',
  'Iraq': 'Irak', 'Ireland': 'Irlanda', 'Israel': 'Israel',
  'Italy': 'Italia', 'Ivory Coast': 'Costa de Marfil', "Côte d'Ivoire": 'Costa de Marfil', 'Jamaica': 'Jamaica',
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
  'Turkey': 'Turquía', 'Türkiye': 'Turquía', 'Ukraine': 'Ucrania',
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
  'Cape Verde Islands': 'Cap-Vert', 'Cape Verde': 'Cap-Vert',
  'Curacao': 'Curaçao', 'Curaçao': 'Curaçao',
  "Côte d'Ivoire": "Côte d'Ivoire",
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
  'Cape Verde Islands': 'Kap Verde', 'Cape Verde': 'Kap Verde',
  'Curacao': 'Curaçao', 'Curaçao': 'Curaçao',
  "Côte d'Ivoire": 'Elfenbeinküste', 'Ivory Coast': 'Elfenbeinküste',
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
  'Cape Verde Islands': 'Capo Verde', 'Cape Verde': 'Capo Verde',
  'Curacao': 'Curaçao', 'Curaçao': 'Curaçao',
  "Côte d'Ivoire": "Costa d'Avorio", 'Ivory Coast': "Costa d'Avorio",
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
  'Cape Verde Islands': 'Yeşil Burun Adaları', 'Cape Verde': 'Yeşil Burun Adaları',
  'Curacao': 'Curaçao', 'Curaçao': 'Curaçao',
  "Côte d'Ivoire": "Fildişi Sahili", 'Ivory Coast': 'Fildişi Sahili',
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

// ── Bracket placeholder translations ────────────────────────────────────────
// SportMonks fills knockout fixtures with placeholder team names while the
// matchups are still TBD:
//   "1st Group A"             — winner of Group A
//   "2nd Group A"             — runner-up of Group A
//   "3rd Group A/B/C/D/F"     — one of the four best third-placed teams
//                                from these groups (Mundial 2026 format)
// We translate these into the user's language so the bracket reads naturally.

interface PlaceholderL10n {
  /** Map English ordinal → localized */
  ord: Record<string, string>;
  /** Localized word for "Group" */
  group: string;
  /** Connector word for the multi-group third-place pattern, e.g. "de" */
  ofConn: string;
  /** Localized word for "Winner" (used in "Winner Match X" / "Winner Group X"). */
  winner: string;
  /** Localized word for "Loser" — used by the Tercer Lugar match
   *  ("Loser Semi-final 1" → "Perdedor Semifinal 1"). */
  loser: string;
  /** Localized phase labels — map English phase → localized.
   *  Keys are lower-case for case-insensitive lookup. */
  phase: Record<string, string>;
}

const PLACEHOLDER_BY_LANG: Record<string, PlaceholderL10n> = {
  es: {
    ord: { '1st': '1°', '2nd': '2°', '3rd': '3°', '4th': '4°' },
    group: 'Grupo', ofConn: 'de', winner: 'Ganador', loser: 'Perdedor',
    phase: { 'semi-final': 'Semifinal', 'semifinal': 'Semifinal', 'quarter-final': 'Cuartos', 'quarterfinal': 'Cuartos', 'final': 'Final', 'match': 'Partido' },
  },
  en: {
    ord: { '1st': '1st', '2nd': '2nd', '3rd': '3rd', '4th': '4th' },
    group: 'Group', ofConn: 'of', winner: 'Winner', loser: 'Loser',
    phase: { 'semi-final': 'Semi-final', 'semifinal': 'Semi-final', 'quarter-final': 'Quarter-final', 'quarterfinal': 'Quarter-final', 'final': 'Final', 'match': 'Match' },
  },
  fr: {
    ord: { '1st': '1er', '2nd': '2e', '3rd': '3e', '4th': '4e' },
    group: 'Groupe', ofConn: 'du', winner: 'Vainqueur', loser: 'Perdant',
    phase: { 'semi-final': 'Demi-finale', 'semifinal': 'Demi-finale', 'quarter-final': 'Quart de finale', 'quarterfinal': 'Quart de finale', 'final': 'Finale', 'match': 'Match' },
  },
  de: {
    ord: { '1st': '1.', '2nd': '2.', '3rd': '3.', '4th': '4.' },
    group: 'Gruppe', ofConn: 'der', winner: 'Sieger', loser: 'Verlierer',
    phase: { 'semi-final': 'Halbfinale', 'semifinal': 'Halbfinale', 'quarter-final': 'Viertelfinale', 'quarterfinal': 'Viertelfinale', 'final': 'Finale', 'match': 'Spiel' },
  },
  it: {
    ord: { '1st': '1°', '2nd': '2°', '3rd': '3°', '4th': '4°' },
    group: 'Girone', ofConn: 'di', winner: 'Vincitore', loser: 'Perdente',
    phase: { 'semi-final': 'Semifinale', 'semifinal': 'Semifinale', 'quarter-final': 'Quarti di finale', 'quarterfinal': 'Quarti di finale', 'final': 'Finale', 'match': 'Partita' },
  },
  pt: {
    ord: { '1st': '1°', '2nd': '2°', '3rd': '3°', '4th': '4°' },
    group: 'Grupo', ofConn: 'do', winner: 'Vencedor', loser: 'Perdedor',
    phase: { 'semi-final': 'Semifinal', 'semifinal': 'Semifinal', 'quarter-final': 'Quartas de final', 'quarterfinal': 'Quartas de final', 'final': 'Final', 'match': 'Partida' },
  },
  tr: {
    ord: { '1st': '1.', '2nd': '2.', '3rd': '3.', '4th': '4.' },
    group: 'Grup', ofConn: '-', winner: 'Galip', loser: 'Mağlup',
    phase: { 'semi-final': 'Yarı Final', 'semifinal': 'Yarı Final', 'quarter-final': 'Çeyrek Final', 'quarterfinal': 'Çeyrek Final', 'final': 'Final', 'match': 'Maç' },
  },
};

// Pattern 1: "1st Group A", "2nd Group D", "3rd Group A/B/C/D/F"
const GROUP_RE = /^(1st|2nd|3rd|4th)\s+Group\s+([A-Z](?:\/[A-Z])*)$/i;
// Pattern 2: "Loser Semi-final 1", "Loser Quarter-final 3", "Loser Final"
const LOSER_RE = /^Loser\s+([A-Za-z-]+)\s*(\d*)$/i;
// Pattern 3: "Winner Semi-final 1", "Winner Match 12", "Winner Group A"
//   - "Winner Group A" matches a more specific case; treat as group-winner
const WINNER_RE = /^Winner\s+([A-Za-z-]+)\s*(\d*)$/i;

/**
 * Translate a SportMonks knockout-placeholder team name to the current app
 * language. Recognised patterns (es examples):
 *
 *   "1st Group A"           → "1° Grupo A"            (group winner)
 *   "2nd Group D"           → "2° Grupo D"            (group runner-up)
 *   "3rd Group A/B/C/D/F"   → "3° de Grupos A/B/C/D/F"  (best third places)
 *   "Loser Semi-final 1"    → "Perdedor Semifinal 1"   (3rd-place feeders)
 *   "Loser Semi-final 2"    → "Perdedor Semifinal 2"
 *   "Winner Semi-final 1"   → "Ganador Semifinal 1"    (Final feeders)
 *   "Winner Match 12"       → "Ganador Partido 12"     (custom feeders)
 *
 * Returns the original string if it doesn't match a known placeholder
 * pattern. Safe to call on real team names — they're returned unchanged.
 *
 * Note: this only translates FIFA-style placeholders. For real country
 * names ("Mexico", "South Africa") use `translateNationalTeam` or the
 * combined `translateTeamName` helper.
 */
export function translateBracketPlaceholder(name: string): string {
  if (!name) return name;
  const lang = (i18n.language || 'es').slice(0, 2);
  const l10n = PLACEHOLDER_BY_LANG[lang] ?? PLACEHOLDER_BY_LANG.en;

  // ── Pattern: "Nth Group X" ──
  const gm = name.match(GROUP_RE);
  if (gm) {
    const [, ordEn, groupId] = gm;
    const ord = l10n.ord[ordEn.toLowerCase()] ?? ordEn;
    if (groupId.includes('/')) {
      // Multi-group third-place pattern → "3° de Grupos A/B/C/D/F"
      const groupWord = (lang === 'en' || lang === 'es' || lang === 'it' || lang === 'pt')
        ? `${l10n.group}s`
        : l10n.group;
      return `${ord} ${l10n.ofConn} ${groupWord} ${groupId}`;
    }
    return `${ord} ${l10n.group} ${groupId}`;
  }

  // ── Pattern: "Loser <phase> N" or "Winner <phase> N" ──
  const lm = name.match(LOSER_RE);
  if (lm) {
    const [, phaseEn, num] = lm;
    const phase = l10n.phase[phaseEn.toLowerCase()] ?? phaseEn;
    return num ? `${l10n.loser} ${phase} ${num}` : `${l10n.loser} ${phase}`;
  }
  const wm = name.match(WINNER_RE);
  if (wm) {
    const [, phaseEn, num] = wm;
    // Special case: "Winner Group A" — translate as group winner ordinal
    if (/^group$/i.test(phaseEn) && num) {
      const ord = l10n.ord['1st'] ?? '1st';
      return `${ord} ${l10n.group} ${num}`;
    }
    const phase = l10n.phase[phaseEn.toLowerCase()] ?? phaseEn;
    return num ? `${l10n.winner} ${phase} ${num}` : `${l10n.winner} ${phase}`;
  }

  return name;
}

/**
 * Combined translator: applies bracket-placeholder translation first
 * (matches "Nth Group X" patterns) and falls back to national-team
 * translation for real country names. This is the right call for any
 * "team name" rendered in bracket/standings contexts where both kinds
 * of name can appear.
 */
export function translateTeamName(name: string): string {
  const translated = translateBracketPlaceholder(name);
  if (translated !== name) return translated;
  return translateNationalTeam(name);
}
