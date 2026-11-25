import { setOnDemandTransport } from '../../src/services/football/onDemand';
import * as Search from '../../src/services/football/search';
import * as Teams from '../../src/services/football/teams';
import * as Pop from '../../src/services/football/popular';
import * as Grid from '../../src/services/onboardingGrid';
import { COUNTRY_PRESETS, GLOBAL_CLUBS_TOP_8, GLOBAL_NATIONAL_TEAMS_TOP_6 } from '../../src/config/countryPresets';
import * as Leagues from '../../src/config/leagues';
import { getDisplayVenueCity, getDisplayVenueName } from '../../src/config/worldCupVenues';
import { buildBracket, parseRound, stageNameOf, translateRoundName } from '../../src/services/football/rounds';
import { aggregateFromH2H, detailFromFb, h2hFromFb, matchFromFb, matchFromLite, standingsFromFb } from '../../src/services/football/mappers';
import { shortNameFor } from '../../src/services/football/base';
import { matchDetailNeedsFetch } from '../../functions/src/shared/football/freshness';
import { teamColor, teamFlagEmoji } from '../../src/utils/teamColors';
import { deadStateLabelKey } from '../../src/utils/deadState';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const server = require('../../functions/lib/football/on-demand.js');
setOnDemandTransport(async req => server.toPlain(await server.handleOnDemand(req)));

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => { if (!ok) failures++; console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`); };

(async () => {
  // ── static tables
  const teamIds = Pop.POPULAR_TEAMS.map(t => t.id);
  const natIds = Pop.POPULAR_NATIONAL_TEAMS.map(t => t.id);
  check('popular tables: ids unique', new Set([...teamIds, ...natIds]).size === teamIds.length + natIds.length, `${teamIds.length} clubs, ${natIds.length} national teams`);
  check('popular tables: crests from the media CDN', Pop.POPULAR_TEAMS.every(t => t.logo === `https://media.api-sports.io/football/teams/${t.id}.png`));
  check('popular players: ids unique', new Set(Pop.POPULAR_PLAYER_NAMES.map(p => p.id)).size === Pop.POPULAR_PLAYER_NAMES.length, `${Pop.POPULAR_PLAYER_NAMES.length}`);
  const all = new Set([...teamIds, ...natIds]);
  const presetIssues: string[] = [];
  for (const [cc, p] of Object.entries(COUNTRY_PRESETS)) {
    if (p.nationalTeamId && !natIds.includes(p.nationalTeamId)) presetIssues.push(`${cc} national ${p.nationalTeamId}`);
    for (const id of [...p.suggestedLeagueIds, ...p.secondaryLeagueIds]) if (!Leagues.getLeagueConfig(id)) presetIssues.push(`${cc} league ${id}`);
  }
  for (const id of [...GLOBAL_CLUBS_TOP_8, ...GLOBAL_NATIONAL_TEAMS_TOP_6]) if (!all.has(id)) presetIssues.push(`global ${id}`);
  check('country presets point at known teams and curated leagues', presetIssues.length === 0, presetIssues.join(', '));
  const grid = Grid.buildOnboardingTeamGrid('MX', 'es');
  check('onboarding grid (MX): México first, then Liga MX clubs', grid[0]?.name === 'México' && grid[1]?.name === 'América', grid.slice(0, 5).map(t => t.name).join(', '));
  const names = Grid.buildOnboardingPlayerNames('AR', 'es');
  check('onboarding players (AR): Messi first', names[0] === 'Lionel Messi');
  check('league order (MX): Mundial, Liga MX', Grid.buildOnboardingLeagueOrder('MX', 'es').order.slice(0, 2).join(',') === '1,262');

  // ── league config
  check('popularity: Liga MX > Premier > LaLiga > MLS', Leagues.getLeaguePopularity(262) > Leagues.getLeaguePopularity(39) && Leagues.getLeaguePopularity(39) > Leagues.getLeaguePopularity(140) && Leagues.getLeaguePopularity(140) > Leagues.getLeaguePopularity(253));
  check('popularity: US puts MLS first', Leagues.getLeaguePopularity(253, 'US') > Leagues.getLeaguePopularity(262, 'US'));
  check('popularity: uncurated leagues always below curated', Leagues.getLeaguePopularity(99999, undefined, { name: 'Liga II', country: 'Romania', type: 'League' }) < 5);
  check('display name: friendlies and World Cup', Leagues.getLeagueDisplayName(667, 'Friendlies Clubs') === 'Amistosos' && Leagues.getLeagueDisplayName(1, 'World Cup') !== 'World Cup', Leagues.getLeagueDisplayName(1, 'World Cup'));
  check('suggested: Liga MX global, Expansión for MX only', Leagues.isSuggestedLeague({ id: 262, country: 'Mexico' }, 'AR') && Leagues.isSuggestedLeague({ id: 263, country: 'Mexico' }, 'MX') && !Leagues.isSuggestedLeague({ id: 263, country: 'Mexico' }, 'AR'));
  check('World Cup venues: sponsor names replaced only in the World Cup', getDisplayVenueName(null, 1, 'MetLife Stadium') === 'Estadio Nueva York Nueva Jersey' && getDisplayVenueName(1069, 262, 'Estadio Banorte') === 'Estadio Banorte' && getDisplayVenueCity(null, 1, 'East Rutherford', 'MetLife Stadium') === 'Nueva York' && getDisplayVenueName(1069, 1, 'Estadio Banorte') === 'Estadio Ciudad de México');

  // ── rounds
  const r1 = parseRound('Apertura - 17'), r2 = parseRound('Apertura - Quarter-finals'), r3 = parseRound('Regular Season - 3'), r4 = parseRound('Group Stage - 2'), r5 = parseRound('1st Qualifying Round'), r6 = parseRound('Clausura - Quadrangular - 3'), r7 = parseRound('Round of 16');
  check('rounds: parsing', r1.kind === 'league' && r1.base === 'Apertura' && r1.number === 17 && r2.kind === 'knockout' && r2.phase === 'Apertura' && r2.base === 'Quarter-finals'
    && r3.kind === 'league' && r4.kind === 'group' && r5.kind === 'qualifying' && r6.kind === 'group' && r6.phase === 'Clausura' && r7.kind === 'knockout' && r7.phase === '');
  check('rounds: stage names', stageNameOf('Apertura - 17') === 'Apertura' && stageNameOf('Apertura - Quarter-finals') === 'Apertura - Quarter-finals' && stageNameOf('Regular Season - 3') === 'Regular Season' && translateRoundName('Semi-finals') === 'Semifinales');
  const fx = (id: string, round: string, ts: number, h: string, a: string, hs: number | null, as: number | null, st = 'FT', extra: object = {}) =>
    ({ id, timestamp: ts, statusShort: st, round, homeId: h, homeName: 'T' + h, awayId: a, awayName: 'T' + a, homeScore: hs, awayScore: as, ...extra });
  const D = 86400;
  const bracket = buildBracket([
    fx('1', 'Apertura - 16', 1 * D, '1', '2', 1, 0), fx('2', 'Apertura - 17', 2 * D, '3', '4', 1, 1),
    // two-legged QF level on aggregate (2-2): the team in the next round went through
    fx('10', 'Apertura - Quarter-finals', 10 * D, '1', '8', 1, 2), fx('11', 'Apertura - Quarter-finals', 13 * D, '8', '1', 0, 1),
    fx('12', 'Apertura - Quarter-finals', 10 * D, '2', '7', 3, 0), fx('13', 'Apertura - Quarter-finals', 13 * D, '7', '2', 1, 1),
    fx('20', 'Apertura - Semi-finals', 17 * D, '1', '2', null, null, 'NS'),
    // a later tournament in the same season
    fx('30', 'Clausura - 1', 60 * D, '1', '2', null, null, 'NS'),
    // qualifying-style knockout before the league stage must stay out
    fx('40', 'Apertura - Play-In Final', 0.5 * D, '5', '6', 2, 1),
  ], { currentFixtureId: '11' });
  const qf = bracket.find(r => r.name === 'Cuartos de Final');
  const tie = qf?.ties.find(t => t.legs.some(l => l.fixtureId === '11'));
  check('bracket: rounds after the league stage, in order', bracket.map(r => r.name).join(' > ') === 'Cuartos de Final > Semifinales', bracket.map(r => r.name).join(' > '));
  check('bracket: two legs, aggregate from first-leg home side', !!tie && tie.legs.length === 2 && tie.legs[0].legLabel === 'IDA' && tie.aggregate?.home === 2 && tie.aggregate?.away === 2);
  check('bracket: level tie decided by who appears in the next round', tie?.winner?.id === '1' && tie?.isCurrentMatch === true);
  check('bracket: current round flagged', qf?.isCurrent === true && qf?.isFinished === true && bracket[1].isFinished === false);

  // ── mappers
  const row = (over: object) => ({ id: '9', sport: 'football', leagueId: '262', league: 'Liga MX', leagueCountry: 'Mexico', leagueLogo: 'x', leagueFlag: null, popularity: 100, season: 2026, round: 'Apertura - Quarter-finals',
    homeTeam: { id: '16', name: 'Mexico', shortName: 'MEX', logo: '' }, awayTeam: { id: '17', name: 'South Korea', shortName: 'SKO', logo: '' }, homeScore: 0, awayScore: 0, homeScoreHT: null, awayScoreHT: null,
    homePenScore: null, awayPenScore: null, homeRedCards: 0, awayRedCards: 0, status: 'scheduled', statusShort: 'NS', stateLabel: null, minute: null, extraMinute: null, liveClock: null,
    timestamp: 1795899600, startingAtUtc: '', date: '', venueId: null, venueName: null, venueCity: null, referee: 'César Ramos, Mexico', winner: null, ...over }) as any;
  const pst = matchFromFb(row({ statusShort: 'PST' })), canc = matchFromFb(row({ statusShort: 'CANC' })), pens = matchFromFb(row({ status: 'live', statusShort: 'P', minute: 120, homePenScore: 3, awayPenScore: 2 }));
  check('status: postponed / cancelled are terminal with the honest label', pst.status === 'finished' && deadStateLabelKey(pst.stateId) === 'matchStatus.postponed' && deadStateLabelKey(canc.stateId) === 'matchStatus.cancelled');
  check('status: shootout shows PEN, no running minute', pens.time === 'PEN' && pens.minute === undefined && pens.stateLabel === 'PEN' && pens.homePenScore === 3);
  check('status: break before extra time', matchFromFb(row({ status: 'live', statusShort: 'BT', minute: 90 })).stateLabel === 'ETB');
  check('status: suspended match is "interrupted"', matchFromFb(row({ status: 'interrupted', statusShort: 'SUSP' })).status === 'interrupted');
  const m = matchFromFb(row({}));
  check('national teams carry FIFA codes (colors + flags)', m.homeTeam.shortName === 'MEX' && m.awayTeam.shortName === 'KOR' && !!teamColor(m.awayTeam.shortName) && teamFlagEmoji(m.awayTeam.shortName) === '🇰🇷' && shortNameFor('Mexico U20') !== 'MEX' && shortNameFor('Club America') === 'AME');
  check('startingAtUtc keeps the "YYYY-MM-DD HH:MM:SS" contract', m.startingAtUtc === '2026-11-28 21:00:00' && new Date(m.startingAtUtc!.replace(' ', 'T') + 'Z').getTime() / 1000 === 1795899600);
  const h2hRows = [{ matchId: '1', timestamp: 1795899600 - 3 * D, homeTeam: { id: '17', name: 'South Korea', shortName: '', logo: '' }, awayTeam: { id: '16', name: 'Mexico', shortName: '', logo: '' }, homeScore: 0, awayScore: 2, leagueId: '262', league: 'Liga MX', round: 'Apertura - Quarter-finals', venueName: null }];
  const h2h = h2hFromFb(h2hRows as any, '16');
  check('h2h: scored from today\'s home team perspective', h2h[0].homeScore === 2 && h2h[0].awayScore === 0);
  const second = matchFromFb(row({ status: 'finished', statusShort: 'FT', homeScore: 1, awayScore: 1 }));
  const agg = aggregateFromH2H(second, h2hRows as any);
  check('aggregate: return leg adds the first leg', agg?.home === 3 && agg?.away === 1, JSON.stringify(agg));
  const det = detailFromFb(m, row({}), null, null);
  check('detail: referee name split from its country, empty until data arrives', det.referee.name === 'César Ramos' && det.referee.nationality === 'Mexico' && det.events.length === 0 && det.statistics.length === 0 && det.weather === undefined && det.tvStations === undefined);
  const lite = matchFromLite({ id: '5', timestamp: 1795899600, statusShort: 'FT', round: 'Final', homeId: '2287', homeName: 'Club America', awayId: '2278', awayName: 'Guadalajara Chivas', homeScore: 2, awayScore: 1 }, { leagueId: '262', league: 'Liga MX', season: 2026 });
  check('calendar rows rebuild crest and season key', lite.homeTeam.logo.endsWith('/teams/2287.png') && lite.seasonId === 2622026 && lite.status === 'finished');
  const overall = standingsFromFb({ leagueId: '1', season: 2026, groups: [
    { name: 'Eastern Conference', rows: [{ position: 1, team: { id: '1', name: 'A', shortName: 'A', logo: '' }, played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 1, goalsAgainst: 0, goalDifference: 1, points: 3, form: null, description: null }] },
    { name: 'Western Conference', rows: [{ position: 1, team: { id: '2', name: 'B', shortName: 'B', logo: '' }, played: 1, won: 0, drawn: 0, lost: 1, goalsFor: 0, goalsAgainst: 1, goalDifference: -1, points: 0, form: null, description: null }] },
    { name: 'Overall', rows: [{ position: 1, team: { id: '1', name: 'A', shortName: 'A', logo: '' }, played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 1, goalsAgainst: 0, goalDifference: 1, points: 3, form: null, description: null }] },
  ] } as any);
  check('standings: conference tables kept, repeated overall table skipped', overall.length === 2 && overall[0].groupName === 'Conferencia Este' && overall[1].groupName === 'Conferencia Oeste');

  // ── freshness rules shared with the server
  const now = Date.now(), nowSec = Math.floor(now / 1000);
  check('freshness: far-future match needs no fetch; lineups window does', !matchDetailNeedsFetch({ statusShort: 'NS', timestamp: nowSec + 6 * 3600, popularity: 100 }, null, now) && matchDetailNeedsFetch({ statusShort: 'NS', timestamp: nowSec + 1800, popularity: 100 }, null, now));
  check('freshness: live big-league match is the poller\'s job', !matchDetailNeedsFetch({ statusShort: '2H', timestamp: nowSec - 4000, popularity: 100 }, { fetchedAt: now - 120000, statusShort: '2H' }, now) && matchDetailNeedsFetch({ statusShort: '2H', timestamp: nowSec - 4000, popularity: 2 }, { fetchedAt: now - 120000, statusShort: '2H' }, now));
  check('freshness: a final detail is never refetched', !matchDetailNeedsFetch({ statusShort: 'FT', timestamp: nowSec - 5 * 86400, popularity: 2 }, { fetchedAt: now - 86400000, statusShort: 'FT' }, now) && matchDetailNeedsFetch({ statusShort: 'FT', timestamp: nowSec - 5 * 86400, popularity: 2 }, null, now));

  // ── remote search / leagues / coach / stats (real data through the function)
  const s1 = await Search.searchRemote('Chivas');
  check('search: "Chivas" finds Guadalajara', s1.teams.some(t => t.id === 2278), s1.teams.slice(0, 3).map(t => `${t.name} (${t.leagueName})`).join(', '));
  const s2 = await Search.searchRemote('malagón');
  check('search: "malagón" finds the América goalkeeper', s2.players.some(p => p.id === 35930), s2.players.slice(0, 3).map(p => `${p.name} · ${p.teamName}`).join(', '));
  check('search: short queries are not sent', (await Search.searchRemote('ab')).teams.length === 0);
  const leagues = await Search.getAllSearchableLeagues();
  check('leagues: curated first, then the whole catalog', leagues[0].id === 262 && leagues.length > 1000, `${leagues.length} leagues; curated ${Search.getSearchableLeagues().length}`);
  const coach = await Teams.getCoachProfile(985);
  check('coach profile', !!coach && coach.teams.length > 2 && coach.teams[0].name === 'Club America', `${coach?.name}: ${coach?.teams.slice(0, 4).map(t => t.name).join(', ')}`);
  const stats = await Teams.getTeamStats(2287, 262, 2026);
  check('team season stats', !!stats && stats.played.total > 10, `PJ ${stats?.played.total}, GF ${stats?.goalsFor.total}, formations ${stats?.formations.map(f => f.formation).join('/')}`);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' FAILED'}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
