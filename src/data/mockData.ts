export type MatchStatus = 'live' | 'finished' | 'upcoming';

export interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  status: MatchStatus;
  time: string;
  leagueId: string;
}

export interface League {
  id: string;
  name: string;
  country: string;
  matches: Match[];
}

// Today's date helpers
const today = new Date();
const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

export const mockLeagues: League[] = [
  {
    id: 'premier',
    name: 'Premier League',
    country: 'Inglaterra',
    matches: [
      {
        id: 'p1',
        homeTeam: 'Manchester City',
        awayTeam: 'Arsenal',
        homeScore: 2,
        awayScore: 1,
        minute: 72,
        status: 'live',
        time: '20:00',
        leagueId: 'premier',
      },
      {
        id: 'p2',
        homeTeam: 'Liverpool',
        awayTeam: 'Chelsea',
        homeScore: 1,
        awayScore: 1,
        minute: 45,
        status: 'live',
        time: '18:30',
        leagueId: 'premier',
      },
      {
        id: 'p3',
        homeTeam: 'Tottenham',
        awayTeam: 'Newcastle',
        homeScore: null,
        awayScore: null,
        minute: null,
        status: 'upcoming',
        time: '22:45',
        leagueId: 'premier',
      },
    ],
  },
  {
    id: 'laliga',
    name: 'La Liga',
    country: 'España',
    matches: [
      {
        id: 'l1',
        homeTeam: 'Real Madrid',
        awayTeam: 'FC Barcelona',
        homeScore: 3,
        awayScore: 2,
        minute: null,
        status: 'finished',
        time: '17:00',
        leagueId: 'laliga',
      },
      {
        id: 'l2',
        homeTeam: 'Atlético Madrid',
        awayTeam: 'Sevilla',
        homeScore: null,
        awayScore: null,
        minute: null,
        status: 'upcoming',
        time: '21:00',
        leagueId: 'laliga',
      },
      {
        id: 'l3',
        homeTeam: 'Villarreal',
        awayTeam: 'Valencia',
        homeScore: 1,
        awayScore: 0,
        minute: null,
        status: 'finished',
        time: '15:15',
        leagueId: 'laliga',
      },
    ],
  },
  {
    id: 'ligamx',
    name: 'Liga MX',
    country: 'México',
    matches: [
      {
        id: 'm1',
        homeTeam: 'Club América',
        awayTeam: 'Chivas Guadalajara',
        homeScore: 2,
        awayScore: 2,
        minute: 88,
        status: 'live',
        time: '21:00',
        leagueId: 'ligamx',
      },
      {
        id: 'm2',
        homeTeam: 'Tigres UANL',
        awayTeam: 'Monterrey',
        homeScore: null,
        awayScore: null,
        minute: null,
        status: 'upcoming',
        time: '23:00',
        leagueId: 'ligamx',
      },
      {
        id: 'm3',
        homeTeam: 'Cruz Azul',
        awayTeam: 'Pumas UNAM',
        homeScore: 0,
        awayScore: 1,
        minute: null,
        status: 'finished',
        time: '19:00',
        leagueId: 'ligamx',
      },
    ],
  },
  {
    id: 'ucl',
    name: 'Champions League',
    country: 'Europa',
    matches: [
      {
        id: 'c1',
        homeTeam: 'Bayern München',
        awayTeam: 'PSG',
        homeScore: null,
        awayScore: null,
        minute: null,
        status: 'upcoming',
        time: '21:00',
        leagueId: 'ucl',
      },
      {
        id: 'c2',
        homeTeam: 'Inter Milán',
        awayTeam: 'Borussia Dortmund',
        homeScore: 2,
        awayScore: 0,
        minute: null,
        status: 'finished',
        time: '18:45',
        leagueId: 'ucl',
      },
    ],
  },
];

export interface DateItem {
  date: Date;
  label: string;
  dayName: string;
}

export const generateDates = (): DateItem[] => {
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const result: DateItem[] = [];
  for (let i = -3; i <= 4; i++) {
    const d = addDays(today, i);
    result.push({
      date: d,
      label: i === 0 ? 'Hoy' : String(d.getDate()),
      dayName: days[d.getDay()],
    });
  }
  return result;
};
