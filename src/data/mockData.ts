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

export const matches: Match[] = [
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
    image: 'https://images.unsplash.com/photo-1551388749-6b3478890d58?w=800',
    source: 'ESPN', time: 'Hace 2h', timeAgo: 120,
    category: 'Premier League', sections: ['para-ti', 'ultimas'],
  },
  {
    id: 'n2',
    title: 'Barcelona logra importante victoria ante Real Madrid',
    summary: 'Los azulgranas dominaron el clásico español en el Santiago Bernabéu',
    image: 'https://images.unsplash.com/photo-1517927033932-b3d18e61fb3a?w=800',
    source: 'Marca', time: 'Hace 1h', timeAgo: 60,
    category: 'La Liga', sections: ['para-ti', 'ultimas'],
  },
  {
    id: 'n3',
    title: 'Bayern Munich aplasta al Dortmund en el clásico alemán',
    summary: 'Los bávaros mostraron su poderío goleando 3-1 en casa',
    image: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800',
    source: 'Kicker', time: 'Hace 3h', timeAgo: 180,
    category: 'Bundesliga', sections: ['siguiendo', 'ultimas'],
  },
  {
    id: 'n4',
    title: 'Empate emocionante en el derbi de Milán',
    summary: 'Inter y Milan dividieron puntos en San Siro en un partido de ida y vuelta',
    image: 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800',
    source: 'Gazzetta', time: 'Hace 4h', timeAgo: 240,
    category: 'Serie A', sections: ['siguiendo', 'ultimas'],
  },
  {
    id: 'n5',
    title: 'PSG golea a Marseille y afianza su liderato',
    summary: 'Los parisinos no dieron opciones y ganaron con autoridad 4-0',
    image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800',
    source: "L'Équipe", time: 'Hace 5h', timeAgo: 300,
    category: 'Ligue 1', sections: ['siguiendo', 'ultimas'],
  },
  {
    id: 'n6',
    title: 'Preparativos para la próxima jornada de Champions League',
    summary: 'Los mejores equipos de Europa se preparan para los octavos de final',
    image: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=800',
    source: 'UEFA', time: 'Hace 6h', timeAgo: 360,
    category: 'Champions League', sections: ['para-ti', 'siguiendo', 'ultimas'],
  },
  {
    id: 'n7',
    title: 'Haaland firma hat-trick histórico en Champions League',
    summary: 'El delantero noruego del City marcó tres goles en la primera mitad ante el PSG',
    image: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800',
    source: 'Sky Sports', time: 'Hace 45m', timeAgo: 45,
    category: 'Champions League', sections: ['para-ti', 'ultimas'],
  },
  {
    id: 'n8',
    title: 'Mbappé, baja de última hora para el próximo clásico',
    summary: 'El delantero francés sufrió una sobrecarga muscular en el entrenamiento',
    image: 'https://images.unsplash.com/photo-1624526267942-ab0ff8a3e972?w=800',
    source: 'AS', time: 'Hace 30m', timeAgo: 30,
    category: 'La Liga', sections: ['para-ti', 'ultimas'],
  },
  {
    id: 'n9',
    title: 'Vinicius Jr. encabeza el once ideal de la temporada',
    summary: 'El extremo brasileño del Real Madrid lidera la selección de la UEFA',
    image: 'https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=800',
    source: 'UEFA', time: 'Hace 1h', timeAgo: 75,
    category: 'La Liga', sections: ['para-ti', 'siguiendo', 'ultimas'],
  },
  {
    id: 'n10',
    title: 'El VAR sigue generando polémica en la Liga MX',
    summary: 'Directivos y técnicos exigen mayor transparencia tras decisiones cuestionadas',
    image: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=800',
    source: 'Récord', time: 'Hace 2h', timeAgo: 110,
    category: 'Liga MX', sections: ['siguiendo', 'ultimas'],
  },
  {
    id: 'n11',
    title: 'Ancelotti renueva con el Real Madrid hasta 2027',
    summary: 'El técnico italiano firmó su extensión en la Ciudad Deportiva',
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
