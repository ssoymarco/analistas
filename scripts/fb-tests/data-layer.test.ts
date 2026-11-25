import { setOnDemandTransport } from '../../src/services/football/onDemand';
import * as M from '../../src/services/football/matches';
import * as L from '../../src/services/football/leagueData';
import * as T from '../../src/services/football/teams';
import * as C from '../../src/services/football/catalog';
import { localDateOf } from '../../src/services/football/base';

// The "network": call the real server handler in-process (it talks to the emulator + API-Sports).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const server = require('../../functions/lib/football/on-demand.js');
let calls = 0;
setOnDemandTransport(async req => { calls++; return server.toPlain(await server.handleOnDemand(req)); });

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => { if (!ok) failures++; console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`); };
const once = <T,>(sub: (cb: (v: T) => void, err: (e: Error) => void) => () => void, pred: (v: T) => boolean = () => true, ms = 15000) =>
  new Promise<T>((res, rej) => {
    const t = setTimeout(() => { un(); rej(new Error('timeout')); }, ms);
    const un = sub(v => { if (pred(v)) { clearTimeout(t); setTimeout(() => un(), 0); res(v); } }, e => { clearTimeout(t); rej(e); });
  });

(async () => {
  const today = localDateOf(Math.floor(Date.now() / 1000));
  console.log('TZ', process.env.TZ, 'local today', today);

  const curated = await once<any[]>((cb, err) => M.subscribeFixturesByDate(today, cb, err), v => v.length > 0);
  const other = await once<any[]>((cb, err) => M.subscribeOtherFixturesByDate(today, cb, err), v => v.length > 0);
  const all = await M.getFixturesByDate(today);
  const count = (await M.countFixturesByDate(today)) - curated.length;
  check('day: curated + other = all', curated.length + other.length === all.length, `${curated.length} + ${other.length} = ${all.length}`);
  check('day: aggregate count matches the other tier', count === other.length, `${count}`);
  check('day: every match is on the local day', all.every(m => m.date === today));
  check('day: curated are popularity >= 5', curated.every(m => (m.popularity ?? 0) >= 5) && other.every(m => (m.popularity ?? 0) < 5));
  const groups = M.groupMatchesByLeague([...curated, ...other]);
  check('day: grouped by league', groups.length > 5, `${groups.length} leagues; e.g. ${groups.slice(0, 4).map(g => g.name + ' (' + g.matches.length + ')').join(', ')}`);
  const sample = curated.find(m => m.status === 'scheduled') ?? curated[0];
  console.log('   sample row:', JSON.stringify({ id: sample.id, time: sample.time, date: sample.date, startingAtUtc: sample.startingAtUtc, league: sample.league, seasonId: sample.seasonId, status: sample.status, statusShort: sample.statusShort, round: sample.roundLabel }));

  const live = await M.getLivescores();
  check('live: one-shot works', Array.isArray(live), `${live.length} live`);
  if (live[0]) console.log('   live row:', JSON.stringify({ id: live[0].id, time: live[0].time, minute: live[0].minute, stateLabel: live[0].stateLabel, liveClock: live[0].liveClock, score: `${live[0].homeScore}-${live[0].awayScore}` }));

  // match detail of a finished, non-priority match (never enriched by the poller)
  const minor = all.find(m => m.status === 'finished' && (m.popularity ?? 0) < 5) ?? all.find(m => m.status === 'finished')!;
  calls = 0;
  const sub = await once<M.MatchDetailSubscription>((cb, err) => M.subscribeMatchDetail(minor.id, cb, err),
    v => !!v.detail && (v.detail.events.length > 0 || v.detail.statistics.length > 0 || v.detail.h2h.results.length > 0), 30000);
  check('detail: filled in on demand for a minor league', !!sub.detail, `${minor.league}: ${minor.homeTeam.name} ${minor.homeScore}-${minor.awayScore} ${minor.awayTeam.name}; events ${sub.detail!.events.length}, stats cats ${sub.detail!.statistics.length}, h2h ${sub.detail!.h2h.results.length}; calls ${calls}`);

  // upcoming curated match: preview
  const up = curated.filter(m => m.status === 'scheduled').sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0];
  if (up) {
    const s2 = await once<M.MatchDetailSubscription>((cb, err) => M.subscribeMatchDetail(up.id, cb, err), v => !!v.detail && v.detail.h2h.results.length > 0, 30000);
    const d = s2.detail!;
    check('detail: preview for an upcoming match', d.h2h.results.length > 0, `${up.homeTeam.name} vs ${up.awayTeam.name}: h2h ${d.h2h.results.length}, form ${d.homeForm?.length ?? 0}/${d.awayForm?.length ?? 0}, absences ${d.missingPlayers.home.length}/${d.missingPlayers.away.length}, predictions ${JSON.stringify(d.predictions)}, venue ${d.venue.name} (${d.venue.capacity}), referee "${d.referee.name}"`);
  }

  // league data
  await C.ensureCatalog();
  const ligaMx = C.peekCurrentSeasonId(262)!;
  check('catalog: Liga MX current season key', ligaMx === 2622026, String(ligaMx));
  const table = await L.getStandings(ligaMx);
  check('standings: Liga MX table', table.length === 18, `${table.length} rows; leader ${table[0]?.team.name} ${table[0]?.points} pts`);
  const mls = await L.getStandings(C.peekCurrentSeasonId(253)!);
  check('standings: MLS two conferences', new Set(mls.map(r => r.groupId)).size === 2, `${mls.length} rows`);
  const subTable = await once<any>((cb, err) => L.subscribeStandings(ligaMx, (rows) => cb(rows), err), v => v.length > 0);
  check('standings: subscription', subTable.length === 18);
  const top = await L.getTopPlayers(ligaMx);
  check('top players: Liga MX', top.goals.length > 0, `${top.goals[0]?.playerName} ${top.goals[0]?.goals}; assists ${top.assists.length}; cards ${top.cards.length}`);
  const fixtures = await L.getSeasonFixtures(ligaMx);
  check('season fixtures: Liga MX', fixtures.length > 100, `${fixtures.length}`);
  const bracket = await L.getCupBracket(ligaMx);
  check('bracket: Liguilla', bracket.length > 0, bracket.map(r => `${r.name}${r.isCurrent ? '*' : ''}: ${r.ties.map(t => `${t.homeTeam.shortName}-${t.awayTeam.shortName}(${t.legs.length})`).join(' ')}`).join(' | '));
  const wc = await L.getCupGroupStandings(C.peekCurrentSeasonId(1) ?? 12026);
  check('cup groups: World Cup', wc.hasGroups, `${wc.groups.length} groups; ${wc.groups[0]?.name}: ${wc.groups[0]?.standings.map((s: any) => s.team.name).join(', ')}`);
  const wcBracket = await L.getCupBracket(C.peekCurrentSeasonId(1) ?? 12026);
  check('bracket: World Cup', wcBracket.length >= 5, wcBracket.map(r => `${r.name}(${r.ties.length})`).join(' → ') + ` · final: ${wcBracket[wcBracket.length - 1]?.ties[0]?.homeTeam.name} vs ${wcBracket[wcBracket.length - 1]?.ties[0]?.awayTeam.name}, winner ${wcBracket[wcBracket.length - 1]?.ties[0]?.winner?.name}`);
  const seasons = await L.getAvailableSeasons(262);
  check('seasons: Liga MX', seasons.length > 5 && seasons[0].year >= 2026, seasons.slice(0, 3).map(s => `${s.name}${s.current ? '*' : ''}`).join(', '));

  // team
  const team = await T.getTeam(2287);
  check('team: América', team.name.includes('America'), `${team.name}; ${team.primaryLeagueName} ${team.season}; coach ${team.coach?.name}; squad ${team.squad.length}`);
  const tf = await T.getTeamFixtures(2287, team.season!);
  check('team fixtures', tf.length > 20, `${tf.length}; next: ${tf.find(m => m.status === 'scheduled')?.homeTeam.name} vs ${tf.find(m => m.status === 'scheduled')?.awayTeam.name}`);
  const player = await T.getPlayer(team.squad[5].id);
  check('player', !!player.name, `${player.name}, ${player.nationality}, ${player.stats.length} rows, club ${player.currentTeam?.name}`);

  console.log(`\n${failures === 0 ? 'ALL APP-LAYER CHECKS PASSED' : failures + ' FAILED'}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
