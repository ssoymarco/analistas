// ── Country name translations by ISO2 code ───────────────────────────────────
// SportMonks returns country names in English. This module localizes them to
// the user's language. Falls back to the original English name if the code
// is unknown.
//
// Usage:
//   import { translateCountry } from '../../i18n/countries';
//   translateCountry('ES', i18n.language) // → "España" / "Spain" / "Espagne"
//
// Coverage: ~80 countries — every nation where football coaches commonly
// originate from. Add more as needed.

import i18n from './index';

type CountryMap = Record<string, string>;

const ES: CountryMap = {
  AD: 'Andorra', AE: 'Emiratos Árabes Unidos', AF: 'Afganistán', AG: 'Antigua y Barbuda',
  AL: 'Albania', AM: 'Armenia', AO: 'Angola', AR: 'Argentina', AT: 'Austria', AU: 'Australia',
  AZ: 'Azerbaiyán',
  BA: 'Bosnia y Herzegovina', BB: 'Barbados', BD: 'Bangladés', BE: 'Bélgica', BF: 'Burkina Faso',
  BG: 'Bulgaria', BH: 'Baréin', BI: 'Burundi', BJ: 'Benín', BO: 'Bolivia', BR: 'Brasil',
  BS: 'Bahamas', BT: 'Bután', BW: 'Botsuana', BY: 'Bielorrusia', BZ: 'Belice',
  CA: 'Canadá', CD: 'República Democrática del Congo', CF: 'República Centroafricana',
  CG: 'Congo', CH: 'Suiza', CI: 'Costa de Marfil', CL: 'Chile', CM: 'Camerún', CN: 'China',
  CO: 'Colombia', CR: 'Costa Rica', CU: 'Cuba', CV: 'Cabo Verde', CY: 'Chipre', CZ: 'República Checa',
  DE: 'Alemania', DJ: 'Yibuti', DK: 'Dinamarca', DM: 'Dominica', DO: 'República Dominicana', DZ: 'Argelia',
  EC: 'Ecuador', EE: 'Estonia', EG: 'Egipto', ER: 'Eritrea', ES: 'España', ET: 'Etiopía',
  FI: 'Finlandia', FJ: 'Fiyi', FR: 'Francia',
  GA: 'Gabón', GB: 'Reino Unido', GD: 'Granada', GE: 'Georgia', GH: 'Ghana', GM: 'Gambia',
  GN: 'Guinea', GQ: 'Guinea Ecuatorial', GR: 'Grecia', GT: 'Guatemala', GW: 'Guinea-Bisáu',
  GY: 'Guyana',
  HK: 'Hong Kong', HN: 'Honduras', HR: 'Croacia', HT: 'Haití', HU: 'Hungría',
  ID: 'Indonesia', IE: 'Irlanda', IL: 'Israel', IN: 'India', IQ: 'Irak', IR: 'Irán',
  IS: 'Islandia', IT: 'Italia',
  JM: 'Jamaica', JO: 'Jordania', JP: 'Japón',
  KE: 'Kenia', KG: 'Kirguistán', KH: 'Camboya', KP: 'Corea del Norte', KR: 'Corea del Sur',
  KW: 'Kuwait', KZ: 'Kazajistán',
  LA: 'Laos', LB: 'Líbano', LI: 'Liechtenstein', LK: 'Sri Lanka', LR: 'Liberia', LS: 'Lesoto',
  LT: 'Lituania', LU: 'Luxemburgo', LV: 'Letonia', LY: 'Libia',
  MA: 'Marruecos', MC: 'Mónaco', MD: 'Moldavia', ME: 'Montenegro', MG: 'Madagascar', MK: 'Macedonia del Norte',
  ML: 'Malí', MM: 'Birmania', MN: 'Mongolia', MR: 'Mauritania', MT: 'Malta', MU: 'Mauricio',
  MV: 'Maldivas', MW: 'Malaui', MX: 'México', MY: 'Malasia', MZ: 'Mozambique',
  NA: 'Namibia', NE: 'Níger', NG: 'Nigeria', NI: 'Nicaragua', NL: 'Países Bajos', NO: 'Noruega',
  NP: 'Nepal', NZ: 'Nueva Zelanda',
  OM: 'Omán',
  PA: 'Panamá', PE: 'Perú', PG: 'Papúa Nueva Guinea', PH: 'Filipinas', PK: 'Pakistán',
  PL: 'Polonia', PT: 'Portugal', PY: 'Paraguay',
  QA: 'Catar',
  RO: 'Rumania', RS: 'Serbia', RU: 'Rusia', RW: 'Ruanda',
  SA: 'Arabia Saudita', SC: 'Seychelles', SD: 'Sudán', SE: 'Suecia', SG: 'Singapur',
  SI: 'Eslovenia', SK: 'Eslovaquia', SL: 'Sierra Leona', SM: 'San Marino', SN: 'Senegal',
  SO: 'Somalia', SR: 'Surinam', SS: 'Sudán del Sur', SV: 'El Salvador', SY: 'Siria', SZ: 'Esuatini',
  TD: 'Chad', TG: 'Togo', TH: 'Tailandia', TJ: 'Tayikistán', TM: 'Turkmenistán', TN: 'Túnez',
  TR: 'Turquía', TT: 'Trinidad y Tobago', TW: 'Taiwán', TZ: 'Tanzania',
  UA: 'Ucrania', UG: 'Uganda', US: 'Estados Unidos', UY: 'Uruguay', UZ: 'Uzbekistán',
  VC: 'San Vicente y las Granadinas', VE: 'Venezuela', VN: 'Vietnam',
  YE: 'Yemen', ZA: 'Sudáfrica', ZM: 'Zambia', ZW: 'Zimbabue',
  // FIFA-specific codes for UK nations
  EN: 'Inglaterra', SCT: 'Escocia', WAL: 'Gales', NIR: 'Irlanda del Norte',
};

const PT: CountryMap = {
  AR: 'Argentina', AT: 'Áustria', AU: 'Austrália', BE: 'Bélgica', BR: 'Brasil', CA: 'Canadá',
  CH: 'Suíça', CL: 'Chile', CN: 'China', CO: 'Colômbia', CR: 'Costa Rica', DE: 'Alemanha',
  DK: 'Dinamarca', EC: 'Equador', EG: 'Egito', ES: 'Espanha', FR: 'França', GB: 'Reino Unido',
  GR: 'Grécia', HR: 'Croácia', HU: 'Hungria', IT: 'Itália', JP: 'Japão', KR: 'Coreia do Sul',
  MA: 'Marrocos', MX: 'México', NG: 'Nigéria', NL: 'Países Baixos', NO: 'Noruega', PE: 'Peru',
  PL: 'Polônia', PT: 'Portugal', PY: 'Paraguai', RO: 'Romênia', RS: 'Sérvia', RU: 'Rússia',
  SA: 'Arábia Saudita', SE: 'Suécia', SN: 'Senegal', TR: 'Turquia', UA: 'Ucrânia', US: 'Estados Unidos',
  UY: 'Uruguai', VE: 'Venezuela',
  EN: 'Inglaterra', SCT: 'Escócia', WAL: 'País de Gales', NIR: 'Irlanda do Norte',
};

const FR: CountryMap = {
  AR: 'Argentine', AT: 'Autriche', BE: 'Belgique', BR: 'Brésil', CA: 'Canada', CH: 'Suisse',
  CL: 'Chili', CO: 'Colombie', DE: 'Allemagne', DK: 'Danemark', ES: 'Espagne', FR: 'France',
  GB: 'Royaume-Uni', GR: 'Grèce', HR: 'Croatie', IT: 'Italie', JP: 'Japon', MX: 'Mexique',
  NL: 'Pays-Bas', NO: 'Norvège', PL: 'Pologne', PT: 'Portugal', RU: 'Russie', SE: 'Suède',
  TR: 'Turquie', US: 'États-Unis', UY: 'Uruguay',
  EN: 'Angleterre', SCT: 'Écosse', WAL: 'Pays de Galles', NIR: 'Irlande du Nord',
};

const DE: CountryMap = {
  AR: 'Argentinien', AT: 'Österreich', BE: 'Belgien', BR: 'Brasilien', CH: 'Schweiz',
  DE: 'Deutschland', DK: 'Dänemark', ES: 'Spanien', FR: 'Frankreich', GB: 'Vereinigtes Königreich',
  IT: 'Italien', JP: 'Japan', MX: 'Mexiko', NL: 'Niederlande', NO: 'Norwegen', PL: 'Polen',
  PT: 'Portugal', RU: 'Russland', SE: 'Schweden', TR: 'Türkei', US: 'Vereinigte Staaten',
  EN: 'England', SCT: 'Schottland', WAL: 'Wales', NIR: 'Nordirland',
};

const IT: CountryMap = {
  AR: 'Argentina', AT: 'Austria', BE: 'Belgio', BR: 'Brasile', CH: 'Svizzera', DE: 'Germania',
  ES: 'Spagna', FR: 'Francia', GB: 'Regno Unito', IT: 'Italia', JP: 'Giappone', MX: 'Messico',
  NL: 'Paesi Bassi', PT: 'Portogallo', RU: 'Russia', SE: 'Svezia', TR: 'Turchia', US: 'Stati Uniti',
  EN: 'Inghilterra', SCT: 'Scozia', WAL: 'Galles', NIR: 'Irlanda del Nord',
};

const TR: CountryMap = {
  AR: 'Arjantin', BE: 'Belçika', BR: 'Brezilya', CH: 'İsviçre', DE: 'Almanya', ES: 'İspanya',
  FR: 'Fransa', GB: 'Birleşik Krallık', IT: 'İtalya', JP: 'Japonya', MX: 'Meksika',
  NL: 'Hollanda', PL: 'Polonya', PT: 'Portekiz', RU: 'Rusya', TR: 'Türkiye', US: 'ABD',
  EN: 'İngiltere', SCT: 'İskoçya', WAL: 'Galler', NIR: 'Kuzey İrlanda',
};

const TABLES: Record<string, CountryMap> = { es: ES, pt: PT, fr: FR, de: DE, it: IT, tr: TR };

/**
 * Translate a country code to the user's current language.
 * Falls back to fallbackName (the English name from SportMonks) if the
 * code is unknown or the language has no translation for it.
 */
export function translateCountry(iso2: string | undefined | null, fallbackName: string): string {
  if (!iso2) return fallbackName;
  const lang = (i18n.language || 'es').slice(0, 2).toLowerCase();
  if (lang === 'en') return fallbackName; // English is the source
  const table = TABLES[lang];
  return table?.[iso2.toUpperCase()] ?? fallbackName;
}
