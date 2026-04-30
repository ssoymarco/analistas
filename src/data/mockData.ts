// Mock data for Analistas app
// NOTE: This data is a placeholder while the SportMonks API integration is built.
// When connecting SportMonks, update src/services/sportsApi.ts — no component
// changes should be required as long as the returned types stay the same.

import type { Match as MatchType, League as LeagueType, NewsArticle, MatchStatus, MatchDetail } from './types';

// ── Re-exports for UI components ──────────────────────────────────────────────
export type { Match, MatchStatus, MatchDetail } from './types';

// ── DateNavigator type ────────────────────────────────────────────────────────
export interface DateItem {
  label: string;   // 'Hoy' or day-of-month number
  dayName: string; // 'Lun', 'Mar', etc.
  date: string;    // ISO 'YYYY-MM-DD'
}

// ── League with grouped matches (UI type) ─────────────────────────────────────
export interface League extends LeagueType {
  matches: MatchType[];
}

// ── Date helpers ──────────────────────────────────────────────────────────────
export function generateDates(): DateItem[] {
  const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const today = new Date();
  const result: DateItem[] = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    result.push({
      date: d.toISOString().split('T')[0],
      dayName: DAY_NAMES[d.getDay()],
      label: i === 0 ? 'Hoy' : String(d.getDate()),
    });
  }
  return result;
}

// Internal base leagues (no matches)
type BaseLeague = LeagueType;

export const leagues: BaseLeague[] = [
  { id: 'premier-league',   name: 'Premier League', country: 'England', logo: '🇬🇧' },
  { id: 'la-liga',          name: 'La Liga',         country: 'Spain',   logo: '🇪🇸' },
  { id: 'bundesliga',       name: 'Bundesliga',      country: 'Germany', logo: '🇩🇪' },
  { id: 'serie-a',          name: 'Serie A',         country: 'Italy',   logo: '🇮🇹' },
  { id: 'ligue-1',          name: 'Ligue 1',         country: 'France',  logo: '🇫🇷' },
  { id: 'liga-mx',          name: 'Liga MX',         country: 'Mexico',  logo: '🇲🇽' },
  { id: 'brasileirao',      name: 'Brasileirão',     country: 'Brazil',  logo: '🇧🇷' },
  { id: 'champions-league', name: 'Champions League',country: 'Europe',  logo: '⭐' },
];

export const matches: MatchType[] = [
  // ── Premier League ────────────────────────────────────────────────────────
  {
    id: '1',
    homeTeam: { id: 't1', name: 'Manchester City',   shortName: 'MCI', logo: '🔵' },
    awayTeam: { id: 't2', name: 'Liverpool',          shortName: 'LIV', logo: '🔴' },
    homeScore: 2, awayScore: 2, status: 'live',      time: "78'", minute: 78,
    league: 'Premier League', leagueId: 'premier-league', date: '2026-02-26', isFavorite: true,
  },
  {
    id: '2',
    homeTeam: { id: 't3', name: 'Arsenal',  shortName: 'ARS', logo: '🔴' },
    awayTeam: { id: 't4', name: 'Chelsea',  shortName: 'CHE', logo: '🔵' },
    homeScore: 1, awayScore: 0, status: 'live',      time: "65'", minute: 65,
    league: 'Premier League', leagueId: 'premier-league', date: '2026-02-26', isFavorite: false,
  },
  {
    id: '7',
    homeTeam: { id: 't13', name: 'Manchester United', shortName: 'MUN', logo: '🔴' },
    awayTeam: { id: 't14', name: 'Tottenham',          shortName: 'TOT', logo: '⚪' },
    homeScore: 0, awayScore: 0, status: 'scheduled', time: '20:00',
    league: 'Premier League', leagueId: 'premier-league', date: '2026-02-26', isFavorite: true,
  },

  // ── La Liga ───────────────────────────────────────────────────────────────
  {
    id: '3',
    homeTeam: { id: 't5', name: 'Real Madrid', shortName: 'RMA', logo: '⚪' },
    awayTeam: { id: 't6', name: 'Barcelona',   shortName: 'BAR', logo: '🔵' },
    homeScore: 0, awayScore: 1, status: 'live',      time: "45+2'", minute: 47,
    league: 'La Liga', leagueId: 'la-liga', date: '2026-02-26', isFavorite: true,
  },
  {
    id: '8',
    homeTeam: { id: 't15', name: 'Atletico Madrid', shortName: 'ATM', logo: '🔴' },
    awayTeam: { id: 't16', name: 'Sevilla',          shortName: 'SEV', logo: '⚪' },
    homeScore: 0, awayScore: 0, status: 'scheduled', time: '21:00',
    league: 'La Liga', leagueId: 'la-liga', date: '2026-02-26', isFavorite: false,
  },
  {
    id: '15',
    homeTeam: { id: 't29', name: 'Valencia',  shortName: 'VAL', logo: '🦇' },
    awayTeam: { id: 't30', name: 'Villarreal', shortName: 'VIL', logo: '🟡' },
    homeScore: 0, awayScore: 0, status: 'scheduled', time: '19:00',
    league: 'La Liga', leagueId: 'la-liga', date: '2026-02-26', isFavorite: false,
  },

  // ── Bundesliga ────────────────────────────────────────────────────────────
  {
    id: '4',
    homeTeam: { id: 't7', name: 'Bayern Munich',      shortName: 'BAY', logo: '🔴' },
    awayTeam: { id: 't8', name: 'Borussia Dortmund',  shortName: 'BVB', logo: '🟡' },
    homeScore: 3, awayScore: 1, status: 'finished',   time: 'FT',
    league: 'Bundesliga', leagueId: 'bundesliga', date: '2026-02-26', isFavorite: false,
  },
  {
    id: '10',
    homeTeam: { id: 't19', name: 'RB Leipzig',  shortName: 'RBL', logo: '🔴' },
    awayTeam: { id: 't20', name: 'Leverkusen',  shortName: 'LEV', logo: '🔴' },
    homeScore: 0, awayScore: 0, status: 'scheduled',  time: '18:30',
    league: 'Bundesliga', leagueId: 'bundesliga', date: '2026-02-27', isFavorite: false,
  },

  // ── Serie A ───────────────────────────────────────────────────────────────
  {
    id: '5',
    homeTeam: { id: 't9',  name: 'Inter Milan', shortName: 'INT', logo: '🔵' },
    awayTeam: { id: 't10', name: 'AC Milan',    shortName: 'ACM', logo: '🔴' },
    homeScore: 2, awayScore: 2, status: 'finished',   time: 'FT',
    league: 'Serie A', leagueId: 'serie-a', date: '2026-02-26', isFavorite: true,
  },
  {
    id: '9',
    homeTeam: { id: 't17', name: 'Juventus', shortName: 'JUV', logo: '⚪' },
    awayTeam: { id: 't18', name: 'Napoli',   shortName: 'NAP', logo: '🔵' },
    homeScore: 0, awayScore: 0, status: 'scheduled',  time: '19:45',
    league: 'Serie A', leagueId: 'serie-a', date: '2026-02-27', isFavorite: true,
  },
  {
    id: '18',
    homeTeam: { id: 't35', name: 'Roma',  shortName: 'ROM', logo: '🟡' },
    awayTeam: { id: 't36', name: 'Lazio', shortName: 'LAZ', logo: '🔵' },
    homeScore: 0, awayScore: 1, status: 'live',        time: "55'", minute: 55,
    league: 'Serie A', leagueId: 'serie-a', date: '2026-02-26', isFavorite: false,
  },

  // ── Ligue 1 ───────────────────────────────────────────────────────────────
  {
    id: '6',
    homeTeam: { id: 't11', name: 'PSG',       shortName: 'PSG', logo: '🔵' },
    awayTeam: { id: 't12', name: 'Marseille', shortName: 'MAR', logo: '⚪' },
    homeScore: 4, awayScore: 0, status: 'finished',   time: 'FT',
    league: 'Ligue 1', leagueId: 'ligue-1', date: '2026-02-26', isFavorite: false,
  },
  {
    id: '16',
    homeTeam: { id: 't31', name: 'Lyon',   shortName: 'OL',  logo: '🔴' },
    awayTeam: { id: 't32', name: 'Monaco', shortName: 'MON', logo: '🔴' },
    homeScore: 1, awayScore: 2, status: 'live',        time: "71'", minute: 71,
    league: 'Ligue 1', leagueId: 'ligue-1', date: '2026-02-26', isFavorite: false,
  },
  {
    id: '17',
    homeTeam: { id: 't33', name: 'Nice', shortName: 'NIC', logo: '🔴' },
    awayTeam: { id: 't34', name: 'Lens', shortName: 'LEN', logo: '🟡' },
    homeScore: 0, awayScore: 0, status: 'scheduled',  time: '20:45',
    league: 'Ligue 1', leagueId: 'ligue-1', date: '2026-02-26', isFavorite: false,
  },

  // ── Liga MX ───────────────────────────────────────────────────────────────
  {
    id: '11',
    homeTeam: { id: 'tmx1', name: 'América', shortName: 'AME', logo: '🦅' },
    awayTeam: { id: 'tmx2', name: 'Chivas',  shortName: 'CHI', logo: '🐐' },
    homeScore: 1, awayScore: 1, status: 'live',        time: "62'", minute: 62,
    league: 'Liga MX', leagueId: 'liga-mx', date: '2026-02-26', isFavorite: true,
  },
  {
    id: '12',
    homeTeam: { id: 'tmx3', name: 'Tigres',    shortName: 'TIG', logo: '🐯' },
    awayTeam: { id: 'tmx4', name: 'Cruz Azul', shortName: 'CRU', logo: '🔵' },
    homeScore: 2, awayScore: 0, status: 'live',        time: "80'", minute: 80,
    league: 'Liga MX', leagueId: 'liga-mx', date: '2026-02-26', isFavorite: false,
  },
  {
    id: '13',
    homeTeam: { id: 'tmx5', name: 'Pumas UNAM', shortName: 'PUM', logo: '🐱' },
    awayTeam: { id: 'tmx6', name: 'Monterrey',  shortName: 'MTY', logo: '⚫' },
    homeScore: 0, awayScore: 0, status: 'scheduled',  time: '21:00',
    league: 'Liga MX', leagueId: 'liga-mx', date: '2026-02-26', isFavorite: false,
  },
  {
    id: '14',
    homeTeam: { id: 'tmx7',  name: 'Santos Laguna', shortName: 'SAN', logo: '🟢' },
    awayTeam: { id: 'tmx19', name: 'Toluca',         shortName: 'TOL', logo: '🔴' },
    homeScore: 0, awayScore: 0, status: 'scheduled',  time: '19:00',
    league: 'Liga MX', leagueId: 'liga-mx', date: '2026-02-26', isFavorite: false,
  },

  // ── Brasileirão ───────────────────────────────────────────────────────────
  {
    id: '19',
    homeTeam: { id: 'tbr1', name: 'Flamengo',  shortName: 'FLA', logo: '🔴' },
    awayTeam: { id: 'tbr2', name: 'Palmeiras', shortName: 'PAL', logo: '🟢' },
    homeScore: 1, awayScore: 0, status: 'live',        time: "34'", minute: 34,
    league: 'Brasileirão', leagueId: 'brasileirao', date: '2026-02-26', isFavorite: false,
  },
  {
    id: '20',
    homeTeam: { id: 'tbr3', name: 'Corinthians', shortName: 'COR', logo: '⚫' },
    awayTeam: { id: 'tbr4', name: 'São Paulo',   shortName: 'SAO', logo: '🔴' },
    homeScore: 2, awayScore: 2, status: 'finished',   time: 'FT',
    league: 'Brasileirão', leagueId: 'brasileirao', date: '2026-02-26', isFavorite: false,
  },
  {
    id: '21',
    homeTeam: { id: 'tbr5', name: 'Atlético MG', shortName: 'ATG', logo: '⚫' },
    awayTeam: { id: 'tbr6', name: 'Fluminense',  shortName: 'FLU', logo: '🔴' },
    homeScore: 0, awayScore: 0, status: 'scheduled',  time: '21:30',
    league: 'Brasileirão', leagueId: 'brasileirao', date: '2026-02-26', isFavorite: false,
  },
];

export const news: NewsArticle[] = [
  {
    id: 'n1',
    title: 'Manchester City y Liverpool empatan en un emocionante encuentro',
    summary: 'Ambos equipos mostraron un gran nivel en un partido que tuvo de todo',
    content: 'El Etihad Stadium fue escenario de uno de los mejores partidos de la temporada. Manchester City y Liverpool ofrecieron un espectáculo de fútbol de primer nivel, con jugadas de alta intensidad desde el pitido inicial hasta los últimos minutos del encuentro.\n\nErling Haaland abrió el marcador al minuto 23 con un remate de cabeza inapelable tras un centro perfecto de Kevin De Bruyne. Sin embargo, Liverpool respondió con carácter: Darwin Núñez igualó al 41\' y Mohamed Salah puso en ventaja a los reds al borde del descanso con un golazo desde fuera del área.\n\nEn la segunda mitad, el City apretó sin descanso. Phil Foden estrelló un disparo en el poste y Haaland vio cómo el VAR le anulaba un gol por fuera de juego milimétrico. Cuando todo parecía decidido, Bernardo Silva apareció con un disparo raso que batió a Alisson al minuto 87.\n\nEl empate 2-2 deja a ambos equipos separados por apenas un punto en la tabla, con el título de la Premier League aún por decidir. Guardiola reconoció el mérito de Liverpool, mientras que Klopp destacó la mentalidad ganadora de sus jugadores.',
    image: 'https://images.unsplash.com/photo-1551388749-6b3478890d58?w=800',
    source: 'ESPN', time: 'Hace 2h', timeAgo: 120,
    category: 'Premier League', sections: ['para-ti', 'ultimas'],
  },
  {
    id: 'n2',
    title: 'Barcelona logra importante victoria ante Real Madrid',
    summary: 'Los azulgranas dominaron el clásico español en el Santiago Bernabéu',
    content: 'En un clásico que pasará a la historia, el FC Barcelona se impuso 3-1 al Real Madrid en el Santiago Bernabéu, en un partido donde los azulgranas mostraron una superioridad táctica abrumadora desde el primer minuto.\n\nLamine Yamal fue la gran figura del encuentro. El joven extremo desbordó una y otra vez por la banda derecha, asistiendo a Lewandowski para el primer gol a los 18 minutos y anotando él mismo un golazo desde fuera del área al 52\'. Raphinha cerró la cuenta al 78\' con una contra letal.\n\nEl Madrid recortó distancias por medio de Vinícius Jr. al 65\', pero nunca logró imponer su ritmo. La presión alta del Barcelona desactivó las transiciones rápidas del equipo local, y Ter Stegen realizó tres paradas decisivas en los últimos 15 minutos.\n\n"Hoy jugamos al nivel que queríamos", declaró Xavi en la rueda de prensa posterior. "Los jugadores ejecutaron el plan a la perfección". Con esta victoria, el Barcelona amplía su ventaja en la cima de La Liga a cinco puntos.',
    image: 'https://images.unsplash.com/photo-1517927033932-b3d18e61fb3a?w=800',
    source: 'Marca', time: 'Hace 1h', timeAgo: 60,
    category: 'La Liga', sections: ['para-ti', 'ultimas'],
  },
  {
    id: 'n3',
    title: 'Bayern Munich aplasta al Dortmund en el clásico alemán',
    summary: 'Los bávaros mostraron su poderío goleando 3-1 en casa',
    content: 'El Allianz Arena vivió una noche mágica para el Bayern Munich, que goleó 3-1 al Borussia Dortmund en el siempre emocionante Der Klassiker. El equipo bávaro exhibió su mejor fútbol de la temporada.\n\nHarry Kane fue imparable con un doblete en la primera mitad. Su primer gol llegó de penalti al minuto 15, y el segundo fue una obra de arte: control orientado de espaldas al arco y disparo cruzado al palo largo que dejó sin opciones al portero.\n\nJamal Musiala amplió la ventaja al 58\' con una jugada individual sensacional, recortando a tres defensores antes de definir con sutileza. Dortmund maquilló el resultado con un gol de Marco Reus al 73\', pero nunca estuvo en el partido.\n\n"Hoy el equipo mostró por qué somos el Bayern", señaló Thomas Tuchel. Con esta goleada, los bávaros se consolidan como líderes solitarios de la Bundesliga con 8 puntos de ventaja.',
    image: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800',
    source: 'Kicker', time: 'Hace 3h', timeAgo: 180,
    category: 'Bundesliga', sections: ['siguiendo', 'ultimas'],
  },
  {
    id: 'n4',
    title: 'Empate emocionante en el derbi de Milán',
    summary: 'Inter y Milan dividieron puntos en San Siro en un partido de ida y vuelta',
    content: 'San Siro se vistió de gala para recibir el Derby della Madonnina, y el espectáculo estuvo a la altura. Inter y Milan empataron 2-2 en un partido vibrante que mantuvo a los 75.000 espectadores al borde de sus asientos.\n\nEl Milan se adelantó temprano con un gol de Rafael Leão al minuto 8, aprovechando un error en la salida del Inter. Sin embargo, los nerazzurri respondieron con contundencia: Lautaro Martínez igualó al 25\' y Marcus Thuram puso en ventaja al equipo de Simone Inzaghi justo antes del descanso.\n\nEn la segunda parte, Olivier Giroud aprovechó un rebote en el área para empatar de nuevo al 67\'. Ambos equipos tuvieron ocasiones claras para ganar, pero las defensas y los porteros estuvieron a gran nivel.\n\nEl empate beneficia al Napoli, que lidera la Serie A con dos puntos de ventaja sobre el Inter. "Un punto en el derbi siempre es valioso", resumió Inzaghi tras el encuentro.',
    image: 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800',
    source: 'Gazzetta', time: 'Hace 4h', timeAgo: 240,
    category: 'Serie A', sections: ['siguiendo', 'ultimas'],
  },
  {
    id: 'n5',
    title: 'PSG golea a Marseille y afianza su liderato',
    summary: 'Los parisinos no dieron opciones y ganaron con autoridad 4-0',
    content: 'El Paris Saint-Germain ofreció una exhibición ofensiva ante el Olympique de Marseille, goleando 4-0 en el Parque de los Príncipes en el siempre candente Le Classique francés.\n\nOusmane Dembélé fue el protagonista absoluto con dos goles y una asistencia. Su velocidad y desborde por la banda derecha fueron un dolor de cabeza constante para la defensa marsellesa. Bradley Barcola y Achraf Hakimi completaron la goleada.\n\nEl dominio del PSG fue total desde el inicio. Con el 72% de posesión y 22 remates, el equipo de Luis Enrique no dio respiro a un Marseille que se vio superado en todas las líneas del campo.\n\n"Es el tipo de partido que queremos jugar siempre", afirmó Luis Enrique. "La intensidad sin balón fue clave". Con esta victoria, el PSG se afianza en lo más alto de la Ligue 1 con 10 puntos de ventaja sobre el Mónaco.',
    image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800',
    source: "L'Équipe", time: 'Hace 5h', timeAgo: 300,
    category: 'Ligue 1', sections: ['siguiendo', 'ultimas'],
  },
  {
    id: 'n6',
    title: 'Preparativos para la próxima jornada de Champions League',
    summary: 'Los mejores equipos de Europa se preparan para los octavos de final',
    content: 'La Champions League entra en su fase más emocionante con los octavos de final a la vuelta de la esquina. Los 16 mejores equipos de Europa afinan los últimos detalles tácticos para unos enfrentamientos que prometen ser históricos.\n\nEl sorteo deparó cruces explosivos: Real Madrid-Manchester City, Barcelona-PSG, Bayern Munich-Arsenal y Napoli-Inter son los platos fuertes. Los entrenadores ya trabajan en planes específicos para neutralizar las fortalezas de sus rivales.\n\nLa UEFA confirmó que se implementará la nueva regla del fuera de juego semiautomático en todos los partidos, lo que promete reducir la controversia en las decisiones arbitrales. Además, el balón oficial para las eliminatorias fue presentado con un diseño que rinde homenaje a las sedes de las futuras finales.\n\nLos equipos tienen hasta el lunes para inscribir nuevos fichajes en sus listas, y varios clubes ya han completado incorporaciones clave durante el mercado invernal. La fase eliminatoria arranca la próxima semana con cuatro partidos de ida.',
    image: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=800',
    source: 'UEFA', time: 'Hace 6h', timeAgo: 360,
    category: 'Champions League', sections: ['para-ti', 'siguiendo', 'ultimas'],
  },
  {
    id: 'n7',
    title: 'Haaland firma hat-trick histórico en Champions League',
    summary: 'El delantero noruego del City marcó tres goles en la primera mitad ante el PSG',
    content: 'Erling Haaland volvió a demostrar por qué es considerado el mejor delantero del mundo. El noruego firmó un hat-trick descomunal en apenas 38 minutos para darle al Manchester City una victoria aplastante sobre el PSG en los octavos de final de la Champions League.\n\nSu primer gol llegó al minuto 7 con un remate acrobático de volea que dejó sin reacción a Donnarumma. El segundo fue un cabezazo inapelable al 23\' tras un centro milimétrico de De Bruyne. Y el tercero, quizás el más espectacular, fue una carrera de 40 metros donde dejó atrás a tres defensores antes de definir con clase.\n\nCon estos tres goles, Haaland alcanza los 47 tantos en Champions League con apenas 23 años, igualando registros que parecían inalcanzables. Pep Guardiola no ocultó su admiración: "Es un jugador de otra galaxia. Lo que hace no es normal".\n\nEl Manchester City se clasificó con un global de 6-2 y se perfila como el gran favorito para conquistar su segunda Champions League consecutiva. El sorteo de cuartos de final se celebrará la próxima semana.',
    image: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800',
    source: 'Sky Sports', time: 'Hace 45m', timeAgo: 45,
    category: 'Champions League', sections: ['para-ti', 'ultimas'],
  },
  {
    id: 'n8',
    title: 'Mbappé, baja de última hora para el próximo clásico',
    summary: 'El delantero francés sufrió una sobrecarga muscular en el entrenamiento',
    content: 'Kylian Mbappé será baja para el próximo clásico ante el Barcelona. El delantero francés sufrió una sobrecarga muscular en el cuádriceps derecho durante la sesión de entrenamiento de este viernes y no podrá estar disponible para el partido del domingo.\n\nLas pruebas médicas realizadas en la Ciudad Deportiva de Valdebebas revelaron una lesión de grado 1 que le mantendrá alejado de los terrenos de juego entre 10 y 15 días. Se trata de la tercera lesión muscular de Mbappé en lo que va de temporada, lo que ha encendido las alarmas en el cuerpo técnico.\n\nCarlo Ancelotti tendrá que replantear su plan ofensivo sin su principal referencia en ataque. Rodrygo y Brahim Díaz son los principales candidatos para ocupar su puesto. "Es una baja importante, pero tenemos plantilla para competir", señaló el técnico italiano.\n\nLa ausencia de Mbappé es un golpe duro para el Madrid, que necesita los tres puntos para no perder terreno en la lucha por el título de La Liga. El francés acumula 22 goles y 8 asistencias en la temporada.',
    image: 'https://images.unsplash.com/photo-1624526267942-ab0ff8a3e972?w=800',
    source: 'AS', time: 'Hace 30m', timeAgo: 30,
    category: 'La Liga', sections: ['para-ti', 'ultimas'],
  },
  {
    id: 'n9',
    title: 'Vinicius Jr. encabeza el once ideal de la temporada',
    summary: 'El extremo brasileño del Real Madrid lidera la selección de la UEFA',
    content: 'La UEFA ha revelado su once ideal de la temporada, con Vinícius Jr. como la estrella indiscutible de la selección. El extremo brasileño del Real Madrid ha sido elegido por unanimidad tras una temporada excepcional donde ha combinado goles, asistencias y jugadas espectaculares.\n\nEl once lo completan figuras como Erling Haaland, Jude Bellingham, Rodri y Lamine Yamal, formando un equipo de ensueño que representa lo mejor del fútbol europeo actual. Curiosamente, el Real Madrid es el club más representado con tres jugadores.\n\nVinícius Jr. ha acumulado números impresionantes: 28 goles, 14 asistencias y el mejor promedio de regates completados por partido en las cinco grandes ligas. Su evolución en la toma de decisiones ha sido destacada por todos los analistas.\n\n"Es un honor estar en esta lista con jugadores tan increíbles", declaró Vinícius a los medios de la UEFA. "Pero lo más importante son los títulos con el equipo". El brasileño es uno de los principales candidatos al Balón de Oro de este año.',
    image: 'https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=800',
    source: 'UEFA', time: 'Hace 1h', timeAgo: 75,
    category: 'La Liga', sections: ['para-ti', 'siguiendo', 'ultimas'],
  },
  {
    id: 'n10',
    title: 'El VAR sigue generando polémica en la Liga MX',
    summary: 'Directivos y técnicos exigen mayor transparencia tras decisiones cuestionadas',
    content: 'La polémica sobre el VAR en la Liga MX no cesa. Tras una jornada marcada por al menos cuatro decisiones controvertidas, directivos y entrenadores de múltiples clubes han exigido públicamente mayor transparencia en el uso de la tecnología.\n\nEl caso más sonado ocurrió en el partido entre América y Guadalajara, donde un posible penalti sobre Henry Martín no fue revisado por el VAR a pesar de las repeticiones que mostraban un claro contacto. El técnico del América, André Jardine, calificó la situación como "inaceptable".\n\nLa Federación Mexicana de Fútbol convocó una reunión extraordinaria para revisar los protocolos de actuación del VAR. Entre las propuestas discutidas está la publicación de las comunicaciones entre el árbitro central y la sala de video, tal como se hace ya en la Premier League.\n\n"No pedimos que el VAR sea perfecto, pedimos consistencia", declaró Amaury Vergara, presidente de Chivas. "Si la tecnología existe para ayudar, debe usarse correctamente". La próxima jornada contará con un sistema de supervisión adicional como medida temporal.',
    image: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=800',
    source: 'Récord', time: 'Hace 2h', timeAgo: 110,
    category: 'Liga MX', sections: ['siguiendo', 'ultimas'],
  },
  {
    id: 'n11',
    title: 'Ancelotti renueva con el Real Madrid hasta 2027',
    summary: 'El técnico italiano firmó su extensión en la Ciudad Deportiva',
    content: 'Carlo Ancelotti ha renovado su contrato con el Real Madrid hasta junio de 2027, poniendo fin a semanas de especulación sobre su futuro. El acuerdo fue firmado este viernes en la Ciudad Deportiva de Valdebebas, con Florentino Pérez presente en la ceremonia.\n\nEl técnico italiano, de 65 años, se ha convertido en una figura fundamental del proyecto merengue. Desde su regreso al banquillo en 2021, ha conquistado dos Champions League, dos Ligas y una Copa del Rey, consolidándose como uno de los entrenadores más exitosos en la historia del club.\n\n"Madrid es mi casa", declaró Ancelotti visiblemente emocionado. "Mientras tenga la energía y la ilusión de estos jugadores, quiero seguir aquí. Este club me da todo lo que necesito para ser feliz".\n\nFlorentino Pérez destacó la "estabilidad y sabiduría" que Ancelotti aporta al vestuario, especialmente en la gestión de egos y en los momentos de presión. La renovación incluye una mejora salarial significativa y cláusulas de rendimiento vinculadas a los títulos.',
    image: 'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?w=800',
    source: 'Marca', time: 'Hace 3h', timeAgo: 150,
    category: 'La Liga', sections: ['para-ti', 'siguiendo', 'ultimas'],
  },
];

// ── Leagues with matches grouped (used by PartidosScreen) ─────────────────────
export const mockLeagues: League[] = leagues
  .map((league) => ({
    ...league,
    matches: matches.filter((m) => m.leagueId === league.id),
  }))
  .filter((l) => l.matches.length > 0);

// ── Match detail mock data ────────────────────────────────────────────────────
export const mockMatchDetails: Record<string, MatchDetail> = {
  '1': {
    matchId: '1',
    venue: { name: 'Etihad Stadium', city: 'Manchester', capacity: 53400, attendance: 52800, surface: 'grass' },
    referee: { name: 'Michael Oliver', nationality: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    weather: { temp: 12, description: 'Nublado', icon: '☁️', wind: 18, humidity: 72 },
    events: [
      { id: 'e1', minute: 23, type: 'goal', team: 'home', player: 'Haaland', relatedPlayer: 'De Bruyne', xG: 0.82 },
      { id: 'e2', minute: 38, type: 'yellow', team: 'away', player: 'Salah' },
      { id: 'e3', minute: 41, type: 'goal', team: 'away', player: 'Núñez', relatedPlayer: 'Alexander-Arnold', xG: 0.61 },
      { id: 'e4', minute: 45, addedTime: 2, type: 'goal', team: 'away', player: 'Salah', xG: 0.74 },
      { id: 'e5', minute: 56, type: 'yellow', team: 'home', player: 'Rodri' },
      { id: 'e6', minute: 63, type: 'sub', team: 'home', player: 'Bernardo Silva', relatedPlayer: 'Doku' },
      { id: 'e7', minute: 71, type: 'goal', team: 'home', player: 'Foden', xG: 0.55 },
      { id: 'e8', minute: 75, type: 'var', team: 'home', player: 'Haaland', description: 'Gol anulado por fuera de juego' },
    ],
    statistics: [
      {
        category: 'Posesión y pases',
        stats: [
          { label: 'Posesión', home: 58, away: 42, unit: '%', type: 'percentage' },
          { label: 'Pases', home: 524, away: 381 },
          { label: 'Precisión de pase', home: 89, away: 83, unit: '%', type: 'percentage' },
        ],
      },
      {
        category: 'Ataque',
        stats: [
          { label: 'Tiros', home: 14, away: 9 },
          { label: 'Tiros a puerta', home: 6, away: 5 },
          { label: 'xG', home: 2.11, away: 1.82 },
          { label: 'Ocasiones claras', home: 4, away: 3 },
        ],
      },
      {
        category: 'Duelos',
        stats: [
          { label: 'Córners', home: 7, away: 4 },
          { label: 'Faltas', home: 11, away: 14 },
          { label: 'Fueras de juego', home: 3, away: 1 },
          { label: 'Tarjetas amarillas', home: 1, away: 1 },
        ],
      },
    ],
    homeLineup: {
      formation: '4-3-3',
      coach: 'Pep Guardiola',
      coachNationality: '🇪🇸',
      starters: [
        { id: 'p1', name: 'Ederson',          shortName: 'Ederson',    number: 31, position: 'Portero',   positionShort: 'POR', x: 50, y: 5 },
        { id: 'p2', name: 'Kyle Walker',       shortName: 'Walker',     number: 2,  position: 'Lateral D', positionShort: 'LD',  x: 85, y: 22 },
        { id: 'p3', name: 'Rúben Dias',        shortName: 'Dias',       number: 3,  position: 'Central',   positionShort: 'CB',  x: 65, y: 22 },
        { id: 'p4', name: 'Manuel Akanji',     shortName: 'Akanji',     number: 25, position: 'Central',   positionShort: 'CB',  x: 35, y: 22 },
        { id: 'p5', name: 'Josko Gvardiol',    shortName: 'Gvardiol',   number: 24, position: 'Lateral I', positionShort: 'LI',  x: 15, y: 22 },
        { id: 'p6', name: 'Rodri',             shortName: 'Rodri',      number: 16, position: 'Mediocent', positionShort: 'MC',  x: 50, y: 42, yellowCard: true },
        { id: 'p7', name: 'Kevin De Bruyne',   shortName: 'De Bruyne',  number: 17, position: 'Mediocent', positionShort: 'MC',  x: 30, y: 42 },
        { id: 'p8', name: 'Phil Foden',        shortName: 'Foden',      number: 47, position: 'Mediocamp', positionShort: 'MC',  x: 70, y: 42, goals: 1 },
        { id: 'p9', name: 'Bernardo Silva',    shortName: 'B.Silva',    number: 20, position: 'Extremo D', positionShort: 'ED',  x: 82, y: 62, isSubstituted: true, substituteMinute: 63 },
        { id: 'p10', name: 'Erling Haaland',   shortName: 'Haaland',    number: 9,  position: 'Delantero', positionShort: 'DC',  x: 50, y: 68, goals: 1, isCaptain: true },
        { id: 'p11', name: 'Jeremy Doku',      shortName: 'Doku',       number: 11, position: 'Extremo I', positionShort: 'EI',  x: 18, y: 62 },
      ],
      bench: [
        { id: 'b1', name: 'Stefan Ortega',     shortName: 'Ortega',     number: 18, position: 'Portero',   positionShort: 'POR', x: 0, y: 0 },
        { id: 'b2', name: 'Matheus Nunes',     shortName: 'M.Nunes',    number: 27, position: 'Centrocent', positionShort: 'MC', x: 0, y: 0 },
        { id: 'b3', name: 'Oscar Bobb',        shortName: 'Bobb',       number: 52, position: 'Extremo',   positionShort: 'EX',  x: 0, y: 0 },
        { id: 'b4', name: 'Savinho',           shortName: 'Savinho',    number: 26, position: 'Extremo',   positionShort: 'EX',  x: 0, y: 0 },
      ],
    },
    awayLineup: {
      formation: '4-3-3',
      coach: 'Arne Slot',
      coachNationality: '🇳🇱',
      starters: [
        { id: 'ap1', name: 'Alisson',             shortName: 'Alisson',    number: 1,  position: 'Portero',   positionShort: 'POR', x: 50, y: 5 },
        { id: 'ap2', name: 'Trent Alexander-Arnold', shortName: 'TAA',     number: 66, position: 'Lateral D', positionShort: 'LD',  x: 85, y: 22 },
        { id: 'ap3', name: 'Virgil van Dijk',      shortName: 'Van Dijk',  number: 4,  position: 'Central',   positionShort: 'CB',  x: 65, y: 22, isCaptain: true },
        { id: 'ap4', name: 'Ibrahima Konaté',      shortName: 'Konaté',    number: 5,  position: 'Central',   positionShort: 'CB',  x: 35, y: 22 },
        { id: 'ap5', name: 'Andy Robertson',       shortName: 'Robertson', number: 26, position: 'Lateral I', positionShort: 'LI',  x: 15, y: 22 },
        { id: 'ap6', name: 'Alexis Mac Allister',  shortName: 'Mac Allister', number: 10, position: 'Mediocent', positionShort: 'MC', x: 50, y: 42 },
        { id: 'ap7', name: 'Dominik Szoboszlai',   shortName: 'Szoboszlai', number: 8, position: 'Mediocent', positionShort: 'MC',  x: 30, y: 42 },
        { id: 'ap8', name: 'Ryan Gravenberch',     shortName: 'Gravenberch', number: 38, position: 'Mediocent', positionShort: 'MC', x: 70, y: 42 },
        { id: 'ap9', name: 'Mohamed Salah',        shortName: 'Salah',     number: 11, position: 'Extremo D', positionShort: 'ED',  x: 82, y: 62, goals: 1, yellowCard: true },
        { id: 'ap10', name: 'Darwin Núñez',        shortName: 'Núñez',     number: 9,  position: 'Delantero', positionShort: 'DC',  x: 50, y: 68, goals: 1 },
        { id: 'ap11', name: 'Luis Díaz',           shortName: 'Díaz',      number: 7,  position: 'Extremo I', positionShort: 'EI',  x: 18, y: 62 },
      ],
      bench: [
        { id: 'ab1', name: 'Caoimhín Kelleher',   shortName: 'Kelleher',  number: 62, position: 'Portero',   positionShort: 'POR', x: 0, y: 0 },
        { id: 'ab2', name: 'Harvey Elliott',       shortName: 'Elliott',   number: 19, position: 'Centrocent', positionShort: 'MC', x: 0, y: 0 },
        { id: 'ab3', name: 'Diogo Jota',           shortName: 'Jota',      number: 20, position: 'Delantero', positionShort: 'DC',  x: 0, y: 0 },
      ],
    },
    homePlayerRatings: [],
    awayPlayerRatings: [],
    odds: [],
    h2h: {
      homeTeam: 'Manchester City',
      awayTeam: 'Liverpool',
      results: [
        { date: '2025-11-23', homeScore: 1, awayScore: 2, competition: 'Premier League', venue: 'Anfield' },
        { date: '2025-04-05', homeScore: 4, awayScore: 1, competition: 'Premier League', venue: 'Etihad' },
        { date: '2025-03-16', homeScore: 1, awayScore: 1, competition: 'FA Cup', venue: 'Wembley' },
        { date: '2024-11-25', homeScore: 0, awayScore: 2, competition: 'Premier League', venue: 'Anfield' },
        { date: '2024-04-10', homeScore: 1, awayScore: 1, competition: 'Premier League', venue: 'Etihad' },
        { date: '2023-10-28', homeScore: 1, awayScore: 0, competition: 'Premier League', venue: 'Etihad' },
      ],
    },
    missingPlayers: {
      home: [
        { name: 'Jack Grealish', reason: 'injury', detail: 'Desgarro muscular' },
        { name: 'John Stones', reason: 'injury', detail: 'Problema en el tobillo' },
      ],
      away: [
        { name: 'Curtis Jones', reason: 'suspension', detail: 'Acumulación de tarjetas' },
      ],
    },
  },
};

export function getMatchDetail(id: string): MatchDetail | undefined {
  return mockMatchDetails[id];
}

// ── Procedural match generation for other dates ──────────────────────────────

const TEAM_POOL = [
  // Premier League
  { name: 'Manchester City', logo: '🔵', league: 'Premier League', leagueId: 'premier-league' },
  { name: 'Liverpool', logo: '🔴', league: 'Premier League', leagueId: 'premier-league' },
  { name: 'Arsenal', logo: '🔴', league: 'Premier League', leagueId: 'premier-league' },
  { name: 'Chelsea', logo: '🔵', league: 'Premier League', leagueId: 'premier-league' },
  { name: 'Tottenham', logo: '⚪', league: 'Premier League', leagueId: 'premier-league' },
  { name: 'Newcastle', logo: '⚫', league: 'Premier League', leagueId: 'premier-league' },
  { name: 'Man United', logo: '🔴', league: 'Premier League', leagueId: 'premier-league' },
  { name: 'Aston Villa', logo: '🟣', league: 'Premier League', leagueId: 'premier-league' },
  // La Liga
  { name: 'Real Madrid', logo: '⚪', league: 'La Liga', leagueId: 'la-liga' },
  { name: 'Barcelona', logo: '🔵', league: 'La Liga', leagueId: 'la-liga' },
  { name: 'Atletico Madrid', logo: '🔴', league: 'La Liga', leagueId: 'la-liga' },
  { name: 'Sevilla', logo: '⚪', league: 'La Liga', leagueId: 'la-liga' },
  { name: 'Real Sociedad', logo: '🔵', league: 'La Liga', leagueId: 'la-liga' },
  { name: 'Villarreal', logo: '🟡', league: 'La Liga', leagueId: 'la-liga' },
  // Liga MX
  { name: 'América', logo: '🦅', league: 'Liga MX', leagueId: 'liga-mx' },
  { name: 'Chivas', logo: '🐐', league: 'Liga MX', leagueId: 'liga-mx' },
  { name: 'Tigres', logo: '🐯', league: 'Liga MX', leagueId: 'liga-mx' },
  { name: 'Cruz Azul', logo: '🔵', league: 'Liga MX', leagueId: 'liga-mx' },
  { name: 'Monterrey', logo: '⚫', league: 'Liga MX', leagueId: 'liga-mx' },
  { name: 'Pumas UNAM', logo: '🐱', league: 'Liga MX', leagueId: 'liga-mx' },
  // Serie A
  { name: 'Inter Milan', logo: '🔵', league: 'Serie A', leagueId: 'serie-a' },
  { name: 'AC Milan', logo: '🔴', league: 'Serie A', leagueId: 'serie-a' },
  { name: 'Juventus', logo: '⚪', league: 'Serie A', leagueId: 'serie-a' },
  { name: 'Napoli', logo: '🔵', league: 'Serie A', leagueId: 'serie-a' },
  // Ligue 1
  { name: 'PSG', logo: '🔵', league: 'Ligue 1', leagueId: 'ligue-1' },
  { name: 'Marseille', logo: '⚪', league: 'Ligue 1', leagueId: 'ligue-1' },
  { name: 'Monaco', logo: '🔴', league: 'Ligue 1', leagueId: 'ligue-1' },
  { name: 'Lyon', logo: '🔴', league: 'Ligue 1', leagueId: 'ligue-1' },
  // Brasileirão
  { name: 'Flamengo', logo: '🔴', league: 'Brasileirão', leagueId: 'brasileirao' },
  { name: 'Palmeiras', logo: '🟢', league: 'Brasileirão', leagueId: 'brasileirao' },
  { name: 'Corinthians', logo: '⚫', league: 'Brasileirão', leagueId: 'brasileirao' },
  { name: 'Santos', logo: '⚪', league: 'Brasileirão', leagueId: 'brasileirao' },
];

const TIMES = ['12:30','14:00','15:00','16:30','17:00','18:00','18:30','19:00','19:45','20:00','20:45','21:00'];

function dateHash(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const copy = [...arr];
  let s = seed;
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 16807 + 1) % 2147483647;
    const j = s % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function mkMatch(
  id: string, hn: string, hl: string, an: string, al: string,
  hs: number, as_: number, status: 'finished' | 'scheduled' | 'live',
  time: string, league: string, leagueId: string, date: string,
  fav = false, minute?: number,
): MatchType {
  return {
    id, date, league, leagueId, status, time,
    homeScore: hs, awayScore: as_, isFavorite: fav,
    homeTeam: { id: `h${id}`, name: hn, shortName: hn.slice(0, 3).toUpperCase(), logo: hl },
    awayTeam: { id: `a${id}`, name: an, shortName: an.slice(0, 3).toUpperCase(), logo: al },
    ...(minute ? { minute } : {}),
  };
}

function generateMatchesForDate(dateStr: string): MatchType[] {
  const h = dateHash(dateStr);
  const count = 3 + (h % 4); // 3–6 matches
  const shuffled = seededShuffle(TEAM_POOL, h);
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const isPast = dateStr < todayStr;
  const results: MatchType[] = [];

  for (let i = 0; i < count && i * 2 + 1 < shuffled.length; i++) {
    const home = shuffled[i * 2];
    const away = shuffled[i * 2 + 1];
    const s = (h * (i + 1) * 16807 + 1) % 2147483647;
    const hs = isPast ? s % 4 : 0;
    const as_ = isPast ? (s >> 4) % 4 : 0;
    const timeIdx = (h + i * 7) % TIMES.length;
    results.push(mkMatch(
      `gen-${dateStr}-${i}`,
      home.name, home.logo,
      away.name, away.logo,
      hs, as_,
      isPast ? 'finished' : 'scheduled',
      isPast ? 'FT' : TIMES[timeIdx],
      home.league, home.leagueId,
      dateStr,
      i === 0 && (h % 5 === 0),
    ));
  }
  return results;
}

// Cache for generated matches
const matchCache = new Map<string, MatchType[]>();

// The date that has our hardcoded "today" matches
const TODAY_DATE = new Date().toISOString().split('T')[0];

/** Get all matches for a given date string (YYYY-MM-DD) */
export function getMatchesForDate(dateStr: string): MatchType[] {
  if (dateStr === TODAY_DATE) return matches;
  if (!matchCache.has(dateStr)) {
    matchCache.set(dateStr, generateMatchesForDate(dateStr));
  }
  return matchCache.get(dateStr)!;
}

/** Get leagues grouped with their matches for a given date */
export function getLeaguesForDate(dateStr: string): League[] {
  const dateMatches = getMatchesForDate(dateStr);
  return leagues
    .map((league) => ({
      ...league,
      matches: dateMatches.filter((m) => m.leagueId === league.id),
    }))
    .filter((l) => l.matches.length > 0);
}

/** Count matches for a given date */
export function matchCountForDate(dateStr: string): number {
  return getMatchesForDate(dateStr).length;
}
