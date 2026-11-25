/**
 * football/popular.ts
 *
 * Curated "popular" teams and players: the instant content of onboarding,
 * search and the favorites picker (no network needed to show them). All ids
 * are API-Sports ids; crests and photos come from its media CDN by id.
 *
 * Ordering of players is driven by PLAYER_POPULARITY (+ per-country boosts).
 */

import { fbPlayerPhoto, fbTeamLogo } from '../../../functions/src/shared/football/model';

export interface SearchableTeam {
  id: number;
  name: string;
  shortName: string;
  logo: string;
  leagueName: string;
  /** API-Sports league id of the team's main league (0 for national teams). */
  leagueId: number;
  /** Season key of that league's current season, when already known. */
  seasonId?: number;
  /** Extra search terms (English names, nicknames) for cross-language matching. */
  searchTerms?: string[];
}

export interface SearchablePlayer {
  id: number;
  name: string;
  image?: string;
  teamName?: string;
  teamLogo?: string;
  teamId?: number;
  leagueName?: string;
  position?: string;
  jerseyNumber?: number;
}

export interface SearchableLeague {
  id: number;
  name: string;
  country: string;
  flag: string;
  /** League logo URL ('' when it must not be shown). */
  image: string;
  seasonId?: number;
  /** Hidden search keywords — never displayed, only used to match queries. */
  searchAliases?: string[];
  /** When true, the UI shows the flag emoji instead of the remote logo. */
  suppressLogo?: boolean;
}

/** Label used for national teams where clubs show their league. */
export const NATIONAL_TEAM_LEAGUE_NAME = 'Selección Nacional';

// ── Popular clubs (ordered by popularity for the primary audience) ───────────

export const POPULAR_TEAMS: SearchableTeam[] = [
  { id: 2287, name: 'América', shortName: 'AME', logo: fbTeamLogo(2287), leagueName: 'Liga MX', leagueId: 262 },
  { id: 2278, name: 'Guadalajara', shortName: 'GUA', logo: fbTeamLogo(2278), leagueName: 'Liga MX', leagueId: 262, searchTerms: ['Chivas', 'Chivas de Guadalajara'] },
  { id: 2295, name: 'Cruz Azul', shortName: 'CAZ', logo: fbTeamLogo(2295), leagueName: 'Liga MX', leagueId: 262 },
  { id: 2279, name: 'Tigres UANL', shortName: 'TUA', logo: fbTeamLogo(2279), leagueName: 'Liga MX', leagueId: 262 },
  { id: 2282, name: 'Monterrey', shortName: 'MNT', logo: fbTeamLogo(2282), leagueName: 'Liga MX', leagueId: 262 },
  { id: 2286, name: 'Pumas UNAM', shortName: 'PUM', logo: fbTeamLogo(2286), leagueName: 'Liga MX', leagueId: 262 },
  { id: 2285, name: 'Santos Laguna', shortName: 'SLA', logo: fbTeamLogo(2285), leagueName: 'Liga MX', leagueId: 262 },
  { id: 2281, name: 'Toluca', shortName: 'TOL', logo: fbTeamLogo(2281), leagueName: 'Liga MX', leagueId: 262 },
  { id: 2292, name: 'Pachuca', shortName: 'PCH', logo: fbTeamLogo(2292), leagueName: 'Liga MX', leagueId: 262 },
  { id: 2283, name: 'Atlas', shortName: 'ATS', logo: fbTeamLogo(2283), leagueName: 'Liga MX', leagueId: 262 },
  { id: 541, name: 'Real Madrid', shortName: 'RMA', logo: fbTeamLogo(541), leagueName: 'La Liga', leagueId: 140 },
  { id: 529, name: 'FC Barcelona', shortName: 'BAR', logo: fbTeamLogo(529), leagueName: 'La Liga', leagueId: 140 },
  { id: 50, name: 'Manchester City', shortName: 'MCI', logo: fbTeamLogo(50), leagueName: 'Premier League', leagueId: 39 },
  { id: 33, name: 'Manchester United', shortName: 'MUN', logo: fbTeamLogo(33), leagueName: 'Premier League', leagueId: 39 },
  { id: 40, name: 'Liverpool', shortName: 'LIV', logo: fbTeamLogo(40), leagueName: 'Premier League', leagueId: 39 },
  { id: 42, name: 'Arsenal', shortName: 'ARS', logo: fbTeamLogo(42), leagueName: 'Premier League', leagueId: 39 },
  { id: 49, name: 'Chelsea', shortName: 'CHE', logo: fbTeamLogo(49), leagueName: 'Premier League', leagueId: 39 },
  { id: 157, name: 'Bayern München', shortName: 'BAY', logo: fbTeamLogo(157), leagueName: 'Bundesliga', leagueId: 78 },
  { id: 496, name: 'Juventus', shortName: 'JUV', logo: fbTeamLogo(496), leagueName: 'Serie A', leagueId: 135 },
  { id: 489, name: 'AC Milan', shortName: 'MIL', logo: fbTeamLogo(489), leagueName: 'Serie A', leagueId: 135 },
  { id: 505, name: 'Inter', shortName: 'INT', logo: fbTeamLogo(505), leagueName: 'Serie A', leagueId: 135 },
  { id: 85, name: 'Paris Saint-Germain', shortName: 'PSG', logo: fbTeamLogo(85), leagueName: 'Ligue 1', leagueId: 61 },
  { id: 9568, name: 'Inter Miami', shortName: 'MIA', logo: fbTeamLogo(9568), leagueName: 'MLS', leagueId: 253 },
  { id: 451, name: 'Boca Juniors', shortName: 'BOC', logo: fbTeamLogo(451), leagueName: 'Liga Profesional', leagueId: 128 },
  { id: 435, name: 'River Plate', shortName: 'RIV', logo: fbTeamLogo(435), leagueName: 'Liga Profesional', leagueId: 128 },
  { id: 127, name: 'Flamengo', shortName: 'FLA', logo: fbTeamLogo(127), leagueName: 'Brasileirão', leagueId: 71 },
  { id: 2939, name: 'Al Nassr', shortName: 'ANA', logo: fbTeamLogo(2939), leagueName: 'Saudi Pro League', leagueId: 307 },
  { id: 2932, name: 'Al Hilal', shortName: 'ALH', logo: fbTeamLogo(2932), leagueName: 'Saudi Pro League', leagueId: 307 },
  { id: 530, name: 'Atlético Madrid', shortName: 'ATM', logo: fbTeamLogo(530), leagueName: 'La Liga', leagueId: 140 },
  { id: 536, name: 'Sevilla', shortName: 'SEV', logo: fbTeamLogo(536), leagueName: 'La Liga', leagueId: 140 },
  { id: 531, name: 'Athletic Club', shortName: 'ATH', logo: fbTeamLogo(531), leagueName: 'La Liga', leagueId: 140 },
  { id: 548, name: 'Real Sociedad', shortName: 'RSO', logo: fbTeamLogo(548), leagueName: 'La Liga', leagueId: 140 },
  { id: 532, name: 'Valencia', shortName: 'VAL', logo: fbTeamLogo(532), leagueName: 'La Liga', leagueId: 140 },
  { id: 543, name: 'Real Betis', shortName: 'BET', logo: fbTeamLogo(543), leagueName: 'La Liga', leagueId: 140 },
  { id: 533, name: 'Villarreal', shortName: 'VIL', logo: fbTeamLogo(533), leagueName: 'La Liga', leagueId: 140 },
  { id: 436, name: 'Racing Club', shortName: 'RAC', logo: fbTeamLogo(436), leagueName: 'Liga Profesional', leagueId: 128 },
  { id: 453, name: 'Independiente', shortName: 'IND', logo: fbTeamLogo(453), leagueName: 'Liga Profesional', leagueId: 128 },
  { id: 460, name: 'San Lorenzo', shortName: 'SLO', logo: fbTeamLogo(460), leagueName: 'Liga Profesional', leagueId: 128 },
  { id: 450, name: 'Estudiantes LP', shortName: 'EST', logo: fbTeamLogo(450), leagueName: 'Liga Profesional', leagueId: 128 },
  { id: 438, name: 'Vélez Sarsfield', shortName: 'VEL', logo: fbTeamLogo(438), leagueName: 'Liga Profesional', leagueId: 128 },
  { id: 121, name: 'Palmeiras', shortName: 'PAL', logo: fbTeamLogo(121), leagueName: 'Brasileirão', leagueId: 71 },
  { id: 131, name: 'Corinthians', shortName: 'CTH', logo: fbTeamLogo(131), leagueName: 'Brasileirão', leagueId: 71 },
  { id: 126, name: 'São Paulo', shortName: 'SAO', logo: fbTeamLogo(126), leagueName: 'Brasileirão', leagueId: 71 },
  { id: 124, name: 'Fluminense', shortName: 'FLU', logo: fbTeamLogo(124), leagueName: 'Brasileirão', leagueId: 71 },
  { id: 1062, name: 'Atlético Mineiro', shortName: 'AMN', logo: fbTeamLogo(1062), leagueName: 'Brasileirão', leagueId: 71 },
  { id: 130, name: 'Grêmio', shortName: 'GRE', logo: fbTeamLogo(130), leagueName: 'Brasileirão', leagueId: 71 },
  { id: 128, name: 'Santos', shortName: 'STS', logo: fbTeamLogo(128), leagueName: 'Brasileirão', leagueId: 71 },
  { id: 1616, name: 'Los Angeles FC', shortName: 'LAF', logo: fbTeamLogo(1616), leagueName: 'MLS', leagueId: 253 },
  { id: 1608, name: 'Atlanta United', shortName: 'ATL', logo: fbTeamLogo(1608), leagueName: 'MLS', leagueId: 253 },
  { id: 1595, name: 'Seattle Sounders', shortName: 'SEA', logo: fbTeamLogo(1595), leagueName: 'MLS', leagueId: 253 },
  { id: 1605, name: 'LA Galaxy', shortName: 'LAG', logo: fbTeamLogo(1605), leagueName: 'MLS', leagueId: 253 },
];

// ── Popular national teams ───────────────────────────────────────────────────

export const POPULAR_NATIONAL_TEAMS: SearchableTeam[] = [
  { id: 16, name: 'México', shortName: 'MEX', logo: fbTeamLogo(16), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 2384, name: 'Estados Unidos', shortName: 'USA', logo: fbTeamLogo(2384), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 5529, name: 'Canadá', shortName: 'CAN', logo: fbTeamLogo(5529), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 26, name: 'Argentina', shortName: 'ARG', logo: fbTeamLogo(26), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 6, name: 'Brasil', shortName: 'BRA', logo: fbTeamLogo(6), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 7, name: 'Uruguay', shortName: 'URU', logo: fbTeamLogo(7), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 8, name: 'Colombia', shortName: 'COL', logo: fbTeamLogo(8), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 2382, name: 'Ecuador', shortName: 'ECU', logo: fbTeamLogo(2382), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 2380, name: 'Paraguay', shortName: 'PAR', logo: fbTeamLogo(2380), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 9, name: 'España', shortName: 'ESP', logo: fbTeamLogo(9), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 2, name: 'Francia', shortName: 'FRA', logo: fbTeamLogo(2), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 10, name: 'Inglaterra', shortName: 'ENG', logo: fbTeamLogo(10), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 25, name: 'Alemania', shortName: 'GER', logo: fbTeamLogo(25), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 27, name: 'Portugal', shortName: 'POR', logo: fbTeamLogo(27), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 1118, name: 'Países Bajos', shortName: 'NED', logo: fbTeamLogo(1118), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 1, name: 'Bélgica', shortName: 'BEL', logo: fbTeamLogo(1), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 3, name: 'Croacia', shortName: 'CRO', logo: fbTeamLogo(3), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 31, name: 'Marruecos', shortName: 'MAR', logo: fbTeamLogo(31), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 12, name: 'Japón', shortName: 'JPN', logo: fbTeamLogo(12), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 17, name: 'Corea del Sur', shortName: 'KOR', logo: fbTeamLogo(17), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 23, name: 'Arabia Saudita', shortName: 'KSA', logo: fbTeamLogo(23), leagueName: 'Selección Nacional', leagueId: 0 },
  { id: 20, name: 'Australia', shortName: 'AUS', logo: fbTeamLogo(20), leagueName: 'Selección Nacional', leagueId: 0 },
];

/** Spanish names and search aliases for national teams, by FIFA code. */
export const NATIONAL_TEAM_DISPLAY: Record<string, { name: string; searchTerms: string[] }> = {
  // CONCACAF — Sede del Mundial 2026
  MEX: { name: 'México',          searchTerms: ['mexico', 'seleccion mexicana', 'tri', 'el tri'] },
  USA: { name: 'Estados Unidos',  searchTerms: ['united states', 'usa', 'usmnt', 'estados unidos'] },
  CAN: { name: 'Canadá',          searchTerms: ['canada'] },
  CRC: { name: 'Costa Rica',      searchTerms: ['costa rica', 'ticos'] },
  PAN: { name: 'Panamá',          searchTerms: ['panama'] },
  HON: { name: 'Honduras',        searchTerms: ['honduras', 'catrachos', 'bicolor'] },
  JAM: { name: 'Jamaica',         searchTerms: ['jamaica', 'reggae boyz'] },
  SLV: { name: 'El Salvador',     searchTerms: ['el salvador', 'cuscatlecos'] },
  GUA: { name: 'Guatemala',       searchTerms: ['guatemala'] },
  HAI: { name: 'Haití',           searchTerms: ['haiti', 'grenadiers'] },
  CUB: { name: 'Cuba',            searchTerms: ['cuba'] },
  TRI: { name: 'Trinidad y Tobago', searchTerms: ['trinidad', 'tobago', 'soca warriors'] },
  // América del Sur
  ARG: { name: 'Argentina',       searchTerms: ['argentina', 'albiceleste'] },
  BRA: { name: 'Brasil',          searchTerms: ['brazil', 'brasil', 'canarinha', 'verde amarela'] },
  COL: { name: 'Colombia',        searchTerms: ['colombia', 'cafeteros'] },
  URU: { name: 'Uruguay',         searchTerms: ['uruguay', 'charruas', 'celeste'] },
  CHI: { name: 'Chile',           searchTerms: ['chile', 'roja'] },
  PER: { name: 'Perú',            searchTerms: ['peru'] },
  ECU: { name: 'Ecuador',         searchTerms: ['ecuador'] },
  PAR: { name: 'Paraguay',        searchTerms: ['paraguay', 'albirroja'] },
  BOL: { name: 'Bolivia',         searchTerms: ['bolivia', 'verde'] },
  VEN: { name: 'Venezuela',       searchTerms: ['venezuela', 'vinotinto'] },
  // Europa
  ESP: { name: 'España',          searchTerms: ['spain', 'espana', 'furia roja', 'la roja'] },
  FRA: { name: 'Francia',         searchTerms: ['france', 'les bleus'] },
  GER: { name: 'Alemania',        searchTerms: ['germany', 'alemania', 'deutschland', 'mannschaft'] },
  ENG: { name: 'Inglaterra',      searchTerms: ['england', 'three lions'] },
  POR: { name: 'Portugal',        searchTerms: ['portugal', 'selecao'] },
  NED: { name: 'Países Bajos',    searchTerms: ['netherlands', 'holland', 'holanda', 'oranje'] },
  BEL: { name: 'Bélgica',         searchTerms: ['belgium', 'belgica', 'red devils'] },
  ITA: { name: 'Italia',          searchTerms: ['italy', 'italia', 'azzurri'] },
  SUI: { name: 'Suiza',           searchTerms: ['switzerland', 'suiza', 'suisse'] },
  CRO: { name: 'Croacia',         searchTerms: ['croatia', 'croacia', 'vatreni'] },
  SRB: { name: 'Serbia',          searchTerms: ['serbia'] },
  DEN: { name: 'Dinamarca',       searchTerms: ['denmark', 'dinamarca'] },
  AUT: { name: 'Austria',         searchTerms: ['austria'] },
  SCO: { name: 'Escocia',         searchTerms: ['scotland', 'escocia'] },
  POL: { name: 'Polonia',         searchTerms: ['poland', 'polonia'] },
  UKR: { name: 'Ucrania',         searchTerms: ['ukraine', 'ucrania'] },
  TUR: { name: 'Turquía',         searchTerms: ['turkey', 'turquia'] },
  SWE: { name: 'Suecia',          searchTerms: ['sweden', 'suecia'] },
  NOR: { name: 'Noruega',         searchTerms: ['norway', 'noruega'] },
  GRE: { name: 'Grecia',          searchTerms: ['greece', 'grecia'] },
  // África
  MAR: { name: 'Marruecos',       searchTerms: ['morocco', 'marruecos', 'atlas lions'] },
  SEN: { name: 'Senegal',         searchTerms: ['senegal', 'lions of teranga'] },
  NGA: { name: 'Nigeria',         searchTerms: ['nigeria', 'super eagles'] },
  GHA: { name: 'Ghana',           searchTerms: ['ghana', 'black stars'] },
  CMR: { name: 'Camerún',         searchTerms: ['cameroon', 'camerun', 'lions indomables'] },
  CIV: { name: 'Costa de Marfil', searchTerms: ['ivory coast', 'cote divoire', 'costa marfil'] },
  EGY: { name: 'Egipto',          searchTerms: ['egypt', 'egipto', 'pharaohs'] },
  // Asia
  JPN: { name: 'Japón',           searchTerms: ['japan', 'japon', 'samurai blue'] },
  KOR: { name: 'Corea del Sur',   searchTerms: ['south korea', 'corea', 'taeguk warriors'] },
  SAU: { name: 'Arabia Saudita',  searchTerms: ['saudi arabia', 'arabia saudita', 'saudi', 'arabia'] },
  IRN: { name: 'Irán',            searchTerms: ['iran', 'team melli'] },
  AUS: { name: 'Australia',       searchTerms: ['australia', 'socceroos'] },
  QAT: { name: 'Catar',           searchTerms: ['qatar', 'catar'] },
};

// ── Popular players ──────────────────────────────────────────────────────────

export interface PopularPlayerSpec {
  name: string;
  /** Nationality, in English as the data provider spells it. */
  country: string;
  /** API-Sports player id. */
  id: number;
}

export const POPULAR_PLAYER_NAMES: PopularPlayerSpec[] = [
  { name: 'Lionel Messi', country: 'Argentina', id: 154 },
  { name: 'Cristiano Ronaldo', country: 'Portugal', id: 874 },
  { name: 'Kylian Mbappé', country: 'France', id: 278 },
  { name: 'Erling Haaland', country: 'Norway', id: 1100 },
  { name: 'Vinícius Júnior', country: 'Brazil', id: 762 },
  { name: 'Neymar Jr', country: 'Brazil', id: 276 },
  { name: 'Mohamed Salah', country: 'Egypt', id: 306 },
  { name: 'Robert Lewandowski', country: 'Poland', id: 521 },
  { name: 'Kevin De Bruyne', country: 'Belgium', id: 629 },
  { name: 'Luka Modrić', country: 'Croatia', id: 754 },
  { name: 'Lamine Yamal', country: 'Spain', id: 386828 },
  { name: 'Pedri', country: 'Spain', id: 133609 },
  { name: 'Jude Bellingham', country: 'England', id: 129718 },
  { name: 'Rodri', country: 'Spain', id: 44 },
  { name: 'Karim Benzema', country: 'France', id: 759 },
  { name: 'Phil Foden', country: 'England', id: 631 },
  { name: 'Florian Wirtz', country: 'Germany', id: 203224 },
  { name: 'Raphinha', country: 'Brazil', id: 1496 },
  { name: 'Bernardo Silva', country: 'Portugal', id: 636 },
  { name: 'Bukayo Saka', country: 'England', id: 1460 },
  { name: 'Rúben Dias', country: 'Portugal', id: 567 },
  { name: 'Virgil van Dijk', country: 'Netherlands', id: 290 },
  { name: 'Trent Alexander-Arnold', country: 'England', id: 283 },
  { name: 'Luis Díaz', country: 'Colombia', id: 2489 },
  { name: 'Dušan Vlahović', country: 'Serbia', id: 30415 },
  { name: 'Gavi', country: 'Spain', id: 296667 },
  { name: 'Federico Valverde', country: 'Uruguay', id: 756 },
  { name: 'Marcus Rashford', country: 'England', id: 909 },
  { name: 'Antoine Griezmann', country: 'France', id: 56 },
  { name: 'Harry Kane', country: 'England', id: 184 },
  { name: 'Alejandro Garnacho', country: 'Argentina', id: 284324 },
  { name: 'Nico Williams', country: 'Spain', id: 183799 },
  { name: 'Rúben Neves', country: 'Portugal', id: 2676 },
  { name: 'Vitinha', country: 'Portugal', id: 128384 },
  { name: 'Richarlison', country: 'Brazil', id: 2413 },
  { name: 'Darwin Núñez', country: 'Uruguay', id: 51617 },
  { name: 'Cody Gakpo', country: 'Netherlands', id: 247 },
  { name: 'Khvicha Kvaratskhelia', country: 'Georgia', id: 483 },
  { name: 'Victor Osimhen', country: 'Nigeria', id: 2780 },
  { name: 'Achraf Hakimi', country: 'Morocco', id: 9 },
  { name: 'Ousmane Dembélé', country: 'France', id: 153 },
  { name: 'Serhou Guirassy', country: 'Guinea', id: 21393 },
  { name: 'Jonathan David', country: 'Canada', id: 8489 },
  { name: 'Tijjani Reijnders', country: 'Netherlands', id: 36902 },
  { name: 'Warren Zaïre-Emery', country: 'France', id: 336657 },
  { name: 'Endrick', country: 'Brazil', id: 377122 },
  { name: 'Pau Cubarsí', country: 'Spain', id: 396623 },
  { name: 'Leny Yoro', country: 'France', id: 342970 },
  { name: 'Mathys Tel', country: 'France', id: 270510 },
  { name: 'Alejandro Balde', country: 'Spain', id: 161928 },
  { name: 'Lautaro Martínez', country: 'Argentina', id: 217 },
  { name: 'Julián Álvarez', country: 'Argentina', id: 6009 },
  { name: 'Enzo Fernández', country: 'Argentina', id: 5996 },
  { name: 'Alexis Mac Allister', country: 'Argentina', id: 6716 },
  { name: 'Rodrigo De Paul', country: 'Argentina', id: 2472 },
  { name: 'Paulo Dybala', country: 'Argentina', id: 875 },
  { name: 'Rodrygo', country: 'Brazil', id: 10009 },
  { name: 'Casemiro', country: 'Brazil', id: 747 },
  { name: 'Marquinhos', country: 'Brazil', id: 257 },
  { name: 'Christian Pulisic', country: 'USA', id: 17 },
  { name: 'Weston McKennie', country: 'USA', id: 415 },
  { name: 'Folarin Balogun', country: 'USA', id: 138835 },
  { name: 'Cole Palmer', country: 'England', id: 152982 },
  { name: 'Declan Rice', country: 'England', id: 2937 },
  { name: 'Edson Álvarez', country: 'Mexico', id: 2869 },
  { name: 'Santiago Giménez', country: 'Mexico', id: 94562 },
  { name: 'Raúl Jiménez', country: 'Mexico', id: 2887 },
  { name: 'Julián Quiñones', country: 'Mexico', id: 35532 },
  { name: 'Guillermo Ochoa', country: 'Mexico', id: 2098 },
  { name: 'Hirving Lozano', country: 'Mexico', id: 248 },
];

/** Popular players as ready-to-render search entries (photo by id). */
export const POPULAR_PLAYERS: SearchablePlayer[] = POPULAR_PLAYER_NAMES.map(p => ({
  id: p.id,
  name: p.name,
  image: fbPlayerPhoto(p.id),
}));

// ── Player popularity ranking ────────────────────────────────────────────────
//
//   1. PLAYER_POPULARITY            — global default score (0-100)
//   2. PLAYER_POPULARITY_BY_COUNTRY — per-market overrides
//
// Names missing from the map fall back to a low default so they still appear.

/** Global popularity score (0-100) per player name. Higher = appears earlier. */
export const PLAYER_POPULARITY: Record<string, number> = {
  // ── Tier S: Ballon d'Or class (95-100) ────────────────────────────────────
  'Lionel Messi':            100,
  'Cristiano Ronaldo':        99,
  'Kylian Mbappé':            98,
  'Erling Haaland':           97,
  'Vinícius Júnior':          95,
  // ── Tier A: Global megastars (85-94) ──────────────────────────────────────
  'Jude Bellingham':          92,
  'Lamine Yamal':             90,
  'Harry Kane':               88,
  'Pedri':                    88,
  'Mohamed Salah':            86,
  'Rodri':                    86,
  'Bukayo Saka':              85,
  // ── Tier B: Top continental (75-84) ───────────────────────────────────────
  'Phil Foden':               84,
  'Robert Lewandowski':       83,
  'Raphinha':                 82,
  'Virgil van Dijk':          80,
  'Bernardo Silva':           80,
  'Kevin De Bruyne':          80,
  'Cole Palmer':              79,
  'Lautaro Martínez':         78,
  'Julián Álvarez':           78,
  'Neymar Jr':                78,
  'Florian Wirtz':            77,
  'Khvicha Kvaratskhelia':    76,
  'Victor Osimhen':           75,
  'Rodrygo':                  75,
  // ── Tier C: Big names (65-74) ─────────────────────────────────────────────
  'Rúben Dias':               72,
  'Trent Alexander-Arnold':   72,
  'Casemiro':                 72,
  'Luka Modrić':              70,
  'Paulo Dybala':             70,
  'Karim Benzema':            68,
  'Antoine Griezmann':        68,
  'Endrick':                  68,
  'Federico Valverde':        67,
  'Marcus Rashford':          66,
  'Christian Pulisic':        66,
  'Marquinhos':               66,
  'Nico Williams':            65,
  'Declan Rice':              65,
  // ── Tier D: Recognized (55-64) ────────────────────────────────────────────
  'Pau Cubarsí':              63,
  'Achraf Hakimi':            62,
  'Luis Díaz':                62,
  'Dušan Vlahović':           60,
  'Gavi':                     60,
  'Alexis Mac Allister':      59,
  'Enzo Fernández':           59,
  'Cody Gakpo':               58,
  'Darwin Núñez':             58,
  'Alejandro Garnacho':       57,
  'Ousmane Dembélé':          56,
  'Rúben Neves':              55,
  'Vitinha':                  55,
  'Richarlison':              55,
  'Rodrigo De Paul':          55,
  // ── Tier E: Mid (45-54) ────────────────────────────────────────────────────
  'Jonathan David':           54,
  'Mathys Tel':               53,
  'Tijjani Reijnders':        52,
  'Warren Zaïre-Emery':       52,
  'Leny Yoro':                52,
  'Alejandro Balde':          51,
  'Serhou Guirassy':          50,
  'Santiago Giménez':         48,  // boosted to 95+ in MX
  'Raúl Jiménez':             46,  // boosted in MX
  'Edson Álvarez':            45,  // boosted in MX
  'Weston McKennie':          45,  // boosted in US
  // ── Tier F: Local heroes (20-44) ──────────────────────────────────────────
  'Folarin Balogun':          43,  // US boost
  'Guillermo Ochoa':          40,  // MX boost (legend, retiring)
  'Julián Quiñones':          38,  // MX/COL dual-nat
  'Hirving Lozano':           28,  // bajó por poca actividad
};

/** Per-market boosts (ISO country → name → score). */
export const PLAYER_POPULARITY_BY_COUNTRY: Record<string, Record<string, number>> = {
  // 🇲🇽 México — top local stars before global megastars, then Messi/CR boosted
  MX: {
    'Santiago Giménez':       103, // top scorer Liga MX historia + Milan
    'Raúl Jiménez':           102, // capitán selección
    'Edson Álvarez':           96, // midfield titular MX
    'Guillermo Ochoa':         88, // legend
    'Julián Quiñones':         60,
  },
  // 🇦🇷 Argentina — Messi super-boost, then locals
  AR: {
    'Lionel Messi':           105, // GOAT for AR
    'Julián Álvarez':          98,
    'Lautaro Martínez':        96,
    'Paulo Dybala':            90,
    'Rodrigo De Paul':         85,
    'Alexis Mac Allister':     85,
    'Enzo Fernández':          83,
  },
  // 🇧🇷 Brasil — Vini/Rodrygo top, then locals
  BR: {
    'Vinícius Júnior':        103, // top BR star, Real Madrid
    'Rodrygo':                 95,
    'Raphinha':                94,
    'Neymar Jr':               92,
    'Endrick':                 88,
    'Casemiro':                85,
    'Marquinhos':              80,
  },
  // 🇺🇸 USA — Pulisic top, then locals
  US: {
    'Christian Pulisic':      100, // captain & Milan starter
    'Weston McKennie':         85, // Juventus
    'Folarin Balogun':         78, // Mónaco
  },
  // 🇪🇸 España — Yamal super-boost (above Messi for ES users), then locals
  ES: {
    'Lamine Yamal':           105, // generational
    'Pedri':                  100,
    'Rodri':                   98, // Ballon d'Or 2024
    'Nico Williams':           92,
    'Pau Cubarsí':             85,
    'Gavi':                    82,
    'Alejandro Balde':         78,
  },
  // 🏴 Inglaterra — Bellingham + Kane + Foden + Saka boosted
  GB: {
    'Jude Bellingham':        102, // top english star
    'Harry Kane':             100,
    'Phil Foden':              95,
    'Bukayo Saka':             93,
    'Cole Palmer':             90,
    'Declan Rice':             82,
    'Marcus Rashford':         76,
    'Trent Alexander-Arnold':  82,
  },
};

/** Popularity of a player for a market (country override first, then global, then 10). */
export function getPlayerPopularity(name: string, country?: string): number {
  if (country) {
    const v = PLAYER_POPULARITY_BY_COUNTRY[country]?.[name];
    if (typeof v === 'number') return v;
  }
  return PLAYER_POPULARITY[name] ?? 10;
}
