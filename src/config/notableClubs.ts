// ── Clubes notables — ranking de importancia para amistosos ──────────────────
//
// Los amistosos de clubes llegan de SM como una sopa sin jerarquía: 100+
// partidos el mismo día mezclando al América con equipos de cuarta división
// europea. Este ranking decide qué se muestra PRIMERO cuando la sección de
// amistosos se corta por partes (reporte del dueño, 4 jul 2026: "no podemos
// mostrar primero un amistoso de la liga de Honduras sobre uno de Liga MX,
// Brasil, Argentina o Europa").
//
// Matching por SUBSTRING del nombre normalizado (minúsculas, sin acentos) —
// deliberadamente laxo: "américa" matchea Club América y América de Cali
// (ambos notables), "santos" matchea Santos Laguna y Santos FC (ídem). Los
// falsos positivos elevan un partido menor de vez en cuando; aceptable — el
// costo de un falso negativo (América enterrado bajo 80 amistosos) es peor.

const normalize = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Tier 1 — audiencia MX primero: Liga MX completa + gigantes de América y Europa.
const TIER_1: string[] = [
  // Liga MX (18)
  'america', 'guadalajara', 'chivas', 'cruz azul', 'pumas', 'monterrey',
  'tigres', 'santos laguna', 'toluca', 'atlas', 'pachuca', 'leon', 'necaxa',
  'puebla', 'queretaro', 'mazatlan', 'juarez', 'tijuana', 'atletico san luis',
  // Expansión MX con arrastre
  'tampico', 'jaiba',
  // Argentina / Brasil / Sudamérica grandes
  'boca juniors', 'river plate', 'racing club', 'independiente', 'san lorenzo',
  'flamengo', 'palmeiras', 'corinthians', 'sao paulo', 'santos fc', 'gremio',
  'internacional', 'fluminense', 'botafogo', 'vasco', 'atletico mineiro',
  'cruzeiro', 'penarol', 'nacional', 'colo-colo', 'colo colo',
  'america de cali', 'millonarios', 'atletico nacional',
  // Europa élite
  'real madrid', 'barcelona', 'atletico madrid', 'atletico de madrid',
  'manchester united', 'manchester city', 'liverpool', 'arsenal', 'chelsea',
  'tottenham', 'bayern', 'borussia dortmund', 'paris saint', 'psg',
  'juventus', 'ac milan', 'inter miami', 'inter milan', 'internazionale',
  'napoli', 'roma', 'porto', 'benfica', 'sporting cp', 'ajax',
  // MLS con arrastre MX
  'la galaxy', 'lafc',
];

// Tier 2 — clubes grandes de ligas seguidas (no élite absoluta).
const TIER_2: string[] = [
  'sevilla', 'valencia', 'real betis', 'athletic', 'real sociedad', 'villarreal',
  'newcastle', 'aston villa', 'west ham', 'everton', 'leeds',
  'leverkusen', 'leipzig', 'eintracht', 'stuttgart',
  'marseille', 'lyon', 'monaco', 'lille',
  'lazio', 'atalanta', 'fiorentina',
  'psv', 'feyenoord', 'celtic', 'rangers',
  'galatasaray', 'fenerbahce', 'besiktas',
  'salzburg', 'slavia praha', 'sparta praha', 'crvena zvezda', 'estrella roja',
  'olympiacos', 'basel', 'anderlecht', 'club brugge',
];

/** Score de notabilidad de UN equipo: 2 (tier 1) · 1 (tier 2) · 0 (resto). */
export function clubNotability(teamName: string | null | undefined): number {
  if (!teamName) return 0;
  const n = normalize(teamName);
  for (const token of TIER_1) if (n.includes(token)) return 2;
  for (const token of TIER_2) if (n.includes(token)) return 1;
  return 0;
}

/** Score de un PARTIDO (para ordenar amistosos): el mejor de sus dos equipos
 *  pesa doble para que "América vs equipo chico" gane a "dos medianos". */
export function matchNotability(homeName: string, awayName: string): number {
  const h = clubNotability(homeName);
  const a = clubNotability(awayName);
  return Math.max(h, a) * 2 + Math.min(h, a);
}
