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
import * as Families from '../../src/services/football/teamFamilies';
import { readDoc } from '../../src/services/football/onDemand';
import { translateNationalTeam } from '../../src/utils/nationalTeams';
import { leagueShareUrl, SITE_URL } from '../../src/config/site';
import { formatShortDate } from '../../src/utils/formatMatchTime';
import { translateAbsenceReason } from '../../src/utils/absenceReasons';
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
  check('national teams carry FIFA codes (colors + flags)', m.homeTeam.shortName === 'MEX' && m.awayTeam.shortName === 'KOR' && !!teamColor(m.awayTeam.shortName) && teamFlagEmoji(m.awayTeam.shortName) === '🇰🇷' && shortNameFor('Mexico U20') === 'MEX' && shortNameFor('Korea Republic U17') === 'KOR' && shortNameFor('Mexico W') !== 'MEX' && shortNameFor('Arsenal U21', 'ARS') === 'ARS' && shortNameFor('Club America') === 'AME');
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

  // Split season: both halves list the same teams — show the one being played.
  const half = (name: string, played: number) => ({ name, rows: ['1', '2'].map((id, i) => ({ position: i + 1, team: { id, name: 'T' + id, shortName: 'T' + id, logo: '' }, played, won: 0, drawn: played, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: played, form: null, description: null })) });
  const split = (groups: any[]) => standingsFromFb({ leagueId: '262', season: 2026, groups } as any);
  check('standings: Apertura while the Clausura has not started', split([half('Liga MX: Apertura', 17), half('Liga MX: Clausura', 0)])[0].played === 17 && split([half('Liga MX: Clausura', 0), half('Liga MX: Apertura', 17)])[0].played === 17);
  check('standings: Clausura once it is being played, in either order', split([half('Liga MX: Apertura', 17), half('Liga MX: Clausura', 3)])[0].played === 3 && split([half('Liga MX: Clausura', 3), half('Liga MX: Apertura', 17)])[0].played === 3);
  check('standings: one table per split season, not two', split([half('Liga MX: Apertura', 17), half('Liga MX: Clausura', 3)]).length === 2);

  // Best-of-three series: games won decide, not the goals added up.
  const g = (id: string, ts: number, hId: string, aId: string, hs: number, as: number) => ({ id, timestamp: ts, statusShort: 'FT', round: 'Round One', homeId: hId, homeName: 'T' + hId, awayId: aId, awayName: 'T' + aId, homeScore: hs, awayScore: as });
  const series = buildBracket([g('1', 1000, '10', '20', 5, 0), g('2', 2000, '20', '10', 1, 0), g('3', 3000, '10', '20', 0, 1), g('4', 4000, '20', '30', 1, 0)] as any, { leagueId: 253 });
  check('bracket: best-of-three goes to the team with two wins', series[0]?.ties[0]?.winner?.id === '20', JSON.stringify(series[0]?.ties.map(t => [t.homeTeam.id, t.awayTeam.id, t.winner?.id, t.legs.length])));

  // ── push routing (server): who hears about what
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  process.env.ESTADIO_DELAY_ENABLED = 'false';   // no Cloud Tasks from the test process
  const notify = require('../../functions/lib/football/notify.js');
  const ch = (type: string, side?: 'home' | 'away') => ({ type, side, matchId: '77', homeTeam: { id: '2282', name: 'Monterrey' }, awayTeam: { id: '2287', name: 'Club America' }, homeScore: 0, awayScore: 0, league: 'Liga MX', leagueId: '262', popularity: 100 });
  const teamsOf = (type: string, side?: 'home' | 'away') => { const r = notify.route(ch(type, side)); return (r.bucketed ?? r.immediate).teams.join(','); };
  check('push: a red card reaches followers of both teams', teamsOf('redCard', 'home') === '2282,2287' && teamsOf('redCard', 'away') === '2282,2287');
  check('push: goals and match phases reach both teams', teamsOf('goal', 'home') === '2282,2287' && teamsOf('matchEnd') === '2282,2287');
  const topicOf = (type: string) => notify.route(ch(type, 'home')).bucketed.topic('2287', 'd0');
  check('push: yellow cards and substitutions reach both teams on their own topics', teamsOf('yellowCard', 'home') === '2282,2287' && teamsOf('substitution', 'away') === '2282,2287' && topicOf('yellowCard') === 'fb_team_2287_yellow_d0' && topicOf('substitution') === 'fb_team_2287_subs_d0' && topicOf('redCard') === 'fb_team_2287_cards_d0');
  check('push: old builds get no twin for the new topics', notify.legacyTopicFor('fb_team_2287_yellow_d0') === null && notify.legacyTopicFor('fb_team_2287_subs_d0') === null && notify.legacyTopicFor('fb_team_2287_cards_d0') === 'team_2687_cards_d0');

  // ── absences in the app's language
  check('absences: common reasons are translated', translateAbsenceReason('Knee Injury') === 'Lesión de rodilla' && translateAbsenceReason('Red Card') === 'Tarjeta roja' && translateAbsenceReason('Knock') === 'Golpe' && translateAbsenceReason('Muscle Injury') === 'Lesión muscular' && translateAbsenceReason('Achilles Tendon Injury') === 'Lesión del tendón de Aquiles' && translateAbsenceReason('Off the roster') === 'Fuera de la convocatoria');
  check('absences: other wordings fall into their family', translateAbsenceReason('Hamstring') === 'Lesión de isquiotibiales' && translateAbsenceReason('Broken leg') === 'Fractura' && translateAbsenceReason('Knee Surgery') === 'Cirugía' && translateAbsenceReason('Shin Injury') === 'Lesión' && translateAbsenceReason("Coach's decision") === 'Decisión técnica');
  check('absences: unknown text is kept, empty stays empty', translateAbsenceReason('Paternity leave') === 'Paternity leave' && translateAbsenceReason('') === '');

  const rivalCond: string = notify.immediateCondition(ch('rivalRedCard', 'home'), ['fb_team_2282_rival_red_card']);
  check('push: rival red card skips devices that already get the red card through the other team', rivalCond.includes("!('fb_team_2287_cards_d0' in topics)") && rivalCond.includes("!('fb_mute_77' in topics)") && (rivalCond.match(/in topics/g) ?? []).length === 5, rivalCond);
  check('push: other pushes keep the plain condition', notify.immediateCondition(ch('redCard', 'home'), ['a', 'b']) === notify.conditionFor(['a', 'b'], '77'));

  // ── youth national teams count as the senior team (Mexico U17 → Mexico)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const family = require('../../functions/lib/football/team-family.js');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { quotaState } = require('../../functions/lib/football/apisports.js');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const adminInit = require('../../functions/lib/admin-init.js');
  check('family: youth names are recognised', family.youthOf('Mexico U17')?.base === 'Mexico' && family.youthOf('Mexico U17')?.age === 17 && family.youthOf('South Korea U-20')?.base === 'South Korea' && family.youthOf('Mexico') === null && family.youthOf('Mexico W') === null && family.youthOf('Schalke 04') === null);
  await adminInit.db.doc('fb_meta/nationalIds').delete();
  family.resetTeamFamilyForTests();
  const u17 = [{ id: '21213', name: 'Venezuela U17' }, { id: '25551', name: 'Mexico U17' }];
  const callsA = quotaState.callsThisInstance;
  const seniorOf = await family.seniorTeamIds([...u17, { id: '16', name: 'Mexico' }, { id: '9999', name: 'Real Madrid U19' }]);
  const callsB = quotaState.callsThisInstance;
  check('family: Mexico U17 and Venezuela U17 resolve to their senior teams', seniorOf['25551'] === '16' && seniorOf['21213'] === '2379', JSON.stringify(seniorOf));
  check('family: a club academy and a senior team resolve to nothing', !('9999' in seniorOf) && !('16' in seniorOf) && callsB - callsA === 3, `${callsB - callsA} calls`);
  family.resetTeamFamilyForTests();
  const again = await family.seniorTeamIds([...u17, { id: '9999', name: 'Real Madrid U19' }]);
  check('family: answers are remembered (no more provider calls, also for "not a national team")', again['25551'] === '16' && !('9999' in again) && quotaState.callsThisInstance === callsB, `${quotaState.callsThisInstance - callsB} calls`);

  const u17ch = (type: string, side?: 'home' | 'away', country = 'World') => ({ type, side, matchId: '1546210', homeTeam: u17[0], awayTeam: u17[1], homeScore: 0, awayScore: 1, league: 'World Cup - U17', leagueId: '587', leagueCountry: country, popularity: 0, minute: 30, scorerName: 'L. Ortiz' });
  const widened = notify.routeWithFamily(u17ch('goal', 'away'), seniorOf);
  check('family: a Mexico U17 goal also goes to followers of Mexico', widened.bucketed.teams.join(',') === '21213,2379,25551,16', widened.bucketed.teams.join(','));
  check('family: "rival" news is not widened', notify.routeWithFamily(u17ch('rivalLoss', 'away'), seniorOf).immediate.teams.join(',') === '25551');
  check('family: youth teams get their Spanish name', notify.loc('Mexico U17') === 'México Sub-17' && notify.loc('Venezuela U17') === 'Venezuela Sub-17' && notify.loc('Mexico') === 'México' && notify.loc('Club America') === 'Club America', `${notify.loc('Mexico U17')} / ${notify.loc('Venezuela U17')}`);

  // The app's side: names, codes and the widened list of followed teams.
  check('family: the app shows youth names in Spanish', translateNationalTeam('Mexico U17') === 'México Sub-17' && translateNationalTeam('Korea Republic U17') === 'Corea del Sur Sub-17' && translateNationalTeam('Arsenal U21') === 'Arsenal Sub-21' && translateNationalTeam('Mexico') === 'México' && translateNationalTeam('Schalke 04') === 'Schalke 04', `${translateNationalTeam('Mexico U17')} / ${translateNationalTeam('Korea Republic U17')}`);
  check('family: following Mexico adds its youth teams, following a club adds nothing', Families.withYouthTeams(['2287', '16'], seniorOf).join(',') === '2287,16,25551' && Families.withYouthTeams(['2287'], seniorOf).length === 1 && Families.withYouthTeams(['16', '25551'], seniorOf).join(',') === '16,25551' && Families.withYouthTeams([], seniorOf).length === 0);
  const appLinks = await Families.getTeamFamilies();
  check('family: the app reads the published links', appLinks['25551'] === '16' && appLinks['21213'] === '2379', `${Object.keys(appLinks).length} links`);
  let serverOnlyDenied = false;
  try { await readDoc('fb_meta/nationalIds'); } catch { serverOnlyDenied = true; }
  check('family: the lookup cache stays server-only', serverOnlyDenied);

  // Whole dispatch with a recording messenger (nothing leaves this process).
  const sent: any[] = [];
  const realMessaging = Object.getOwnPropertyDescriptor(adminInit.admin, 'messaging');
  Object.defineProperty(adminInit.admin, 'messaging', { configurable: true, value: () => ({ send: async (m: any) => { sent.push(m); return 'ok'; } }) });
  try {
    await notify.dispatchFootballChanges([u17ch('goal', 'away')]);
    const live = sent.find(m => typeof m.condition === 'string' && m.condition.includes('fb_team_25551_goals_d0'));
    check('family: one push covers both U17 sides, both senior teams and the mute guard (FCM allows five topics)',
      !!live && live.condition.includes("'fb_team_16_goals_d0' in topics") && live.condition.includes("'fb_team_2379_goals_d0' in topics") && live.condition.includes("!('fb_mute_1546210' in topics)") && (live.condition.match(/in topics/g) ?? []).length === 5,
      live?.condition ?? `sent ${sent.length}`);
    check('family: the push is written with the Spanish youth names', !!live && `${live.notification.title} ${live.notification.body}`.includes('México Sub-17'), live ? `${live.notification.title} · ${live.notification.body}` : '');
    sent.length = 0;
    await notify.dispatchFootballChanges([u17ch('goal', 'away', 'Mexico')]);
    const plain = sent.find(m => typeof m.condition === 'string' && m.condition.includes('fb_team_25551_goals_d0'));
    check('family: outside national-team competitions nothing is widened', !!plain && !plain.condition.includes('fb_team_16_'), plain?.condition ?? '');
  } finally {
    if (realMessaging) Object.defineProperty(adminInit.admin, 'messaging', realMessaging); else delete adminInit.admin.messaging;
  }

  // ── share links and dates
  check('share: a league with a page on the site links to it', leagueShareUrl(262) === `${SITE_URL}/league/liga-mx` && leagueShareUrl('39') === `${SITE_URL}/league/premier-league`);
  check('share: other leagues link to the leagues list', leagueShareUrl(253) === `${SITE_URL}/ligas` && leagueShareUrl(undefined) === `${SITE_URL}/ligas`);
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  check('dates: head-to-head rows read "25 jul 2026"', formatShortDate('2026-07-25', meses) === '25 jul 2026' && formatShortDate('2025-12-03', meses) === '3 dic 2025' && formatShortDate('', meses) === '' && formatShortDate('ayer', meses) === 'ayer');

  // ── search ordering
  const ranked = Search.rankByQuery(['Cultural Leonesa', 'Sierra Leone', 'León', 'Leones Negros', 'Napoleon FC'], 'leon', x => x);
  check('search: exact name first, word starts next, mid-word last', ranked[0] === 'León' && ranked[ranked.length - 1] === 'Napoleon FC' && ranked[1] === 'Cultural Leonesa', ranked.join(' | '));

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
