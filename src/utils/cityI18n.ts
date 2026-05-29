/**
 * cityI18n — localize SportMonks venue city names to Spanish.
 *
 * SportMonks returns city names in canonical English ("Mexico City", "New
 * York", "London", "Munich"). Since Analistas is Spanish-default for its
 * LATAM-MX audience, we map the most common offenders to their Spanish
 * equivalents. Any city not in the map passes through unchanged — preserves
 * names that are already Spanish ("Madrid", "Barcelona", "Buenos Aires")
 * and avoids guessing for less common cities.
 *
 * To extend: add an entry to CITY_NAME_ES below. Keys MUST match SportMonks'
 * casing exactly. If a city has multiple common English spellings, add both.
 */

const CITY_NAME_ES: Readonly<Record<string, string>> = {
  // North America
  'Mexico City':       'Ciudad de México',
  'New York':          'Nueva York',
  'New York City':     'Nueva York',
  'Los Angeles':       'Los Ángeles',
  'Philadelphia':      'Filadelfia',
  'Montreal':          'Montreal', // same; placeholder to make set discoverable
  'Vancouver':         'Vancouver',
  // South America (mostly already Spanish, but a few English spellings exist)
  'Buenos Aires':      'Buenos Aires',
  'Rio de Janeiro':    'Río de Janeiro',
  'Sao Paulo':         'São Paulo',
  // Europe — most-cited cities in English
  'London':            'Londres',
  'Munich':            'Múnich',
  'Cologne':           'Colonia',
  'Geneva':            'Ginebra',
  'Vienna':            'Viena',
  'Florence':          'Florencia',
  'Naples':            'Nápoles',
  'Rome':              'Roma',
  'Milan':             'Milán',
  'Turin':             'Turín',
  'Prague':            'Praga',
  'Warsaw':            'Varsovia',
  'Lisbon':            'Lisboa',
  'Brussels':          'Bruselas',
  'Antwerp':           'Amberes',
  'Copenhagen':        'Copenhague',
  'Stockholm':         'Estocolmo',
  'Athens':            'Atenas',
  'Istanbul':          'Estambul',
  'Moscow':            'Moscú',
  'Belgrade':          'Belgrado',
  'Zagreb':            'Zagreb', // same
  'Edinburgh':         'Edimburgo',
  // Asia / Africa
  'Tokyo':             'Tokio',
  'Beijing':           'Pekín',
  'Seoul':             'Seúl',
  'Cairo':             'El Cairo',
  'Casablanca':        'Casablanca',
  'Tehran':            'Teherán',
  'Riyadh':            'Riad',
  'Jeddah':            'Yeda',
  'Doha':              'Doha',
};

/**
 * Returns the Spanish localization of a city name, or the original string
 * if no mapping exists. Pure function — safe to call on any string.
 */
export function localizeCityName(city: string): string {
  if (!city) return city;
  return CITY_NAME_ES[city] ?? city;
}
