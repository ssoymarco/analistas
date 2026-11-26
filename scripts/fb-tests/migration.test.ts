import AsyncStorage from '@react-native-async-storage/async-storage';
import { setOnDemandTransport } from '../../src/services/football/onDemand';
import * as Mig from '../../src/services/football/legacyMigration';
import * as Topics from '../../src/services/fcmTopics';
import { calls as fcmCalls } from './stubs/messaging';
import { FbTopics } from '../../functions/src/shared/football/model';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const server = require('../../functions/lib/football/on-demand.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db: adminDb } = require('../../functions/lib/admin-init.js');
setOnDemandTransport(async req => server.toPlain(await server.handleOnDemand(req)));

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => { if (!ok) failures++; console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`); };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  // ── 1. Device migration ────────────────────────────────────────────────────
  // A user of the old build: follows América, Chivas, Real Madrid and a team
  // that doesn't exist in the new source; Liga MX, Premier, Mundial; Messi (by
  // id), Cristiano (picked from the favorites screen → slug id) and a squad
  // player; Cruz Azul as rival (+ América wrongly in both lists).
  await AsyncStorage.multiSet([
    ['analistas_team_favorites', JSON.stringify(['2687', '427', '3468', '99999999'])],
    ['analistas_league_favorites', JSON.stringify(['743', '8', '732'])],
    ['analistas_player_favorites', JSON.stringify(['184798', 'pop_cristiano_ronaldo', '777001'])],
    ['analistas_rival_teams', JSON.stringify(['2626', '2687'])],
    ['analistas_match_favorites', JSON.stringify(['19135000'])],
    ['analistas_muted_matches', JSON.stringify(['19135001'])],
    ['analistas_estadio_matches', JSON.stringify(['19135002'])],
    ['analistas_recent_searches', JSON.stringify([{ id: 'team-2687' }])],
    ['analistas_cache_league_meta_v1_28009', '{"data":1}'],
    ['cache:matches:date:2026-11-20', '{"data":[]}'],
    ['analistas_notif_prefs', JSON.stringify({ estadioMode: true })],
  ]);
  const legacyTeamsRaw = await AsyncStorage.getItem('analistas_team_favorites');

  // Storage failing (full disk): nothing half-written, the session still gets
  // the translated lists, and the next launch simply runs again.
  const realMultiSet = AsyncStorage.multiSet;
  (AsyncStorage as any).multiSet = async () => { throw new Error('SQLITE_FULL'); };
  await Mig.ensureLocalMigration();
  const inMemory = await Mig.readLocalFavorites();
  check('storage failure: session served from memory', same(inMemory.teamIds, ['2287', '2278', '541']), JSON.stringify(inMemory.teamIds));
  check('storage failure: nothing recorded', (await AsyncStorage.getItem(Mig.MIGRATION_KEY)) === null
    && (await AsyncStorage.getItem(Mig.FAVORITES_KEYS.teams)) === null);
  (AsyncStorage as any).multiSet = realMultiSet;
  Mig.resetMigrationSessionForTests();

  await Mig.ensureLocalMigration();
  const lists = await Mig.readLocalFavorites();
  check('legacy lists left untouched (an older build still finds its ids)', (await AsyncStorage.getItem('analistas_team_favorites')) === legacyTeamsRaw);
  check('teams → América 2287, Chivas 2278, Real Madrid 541 (unknown team dropped)', same(lists.teamIds, ['2287', '2278', '541']), JSON.stringify(lists.teamIds));
  check('leagues → Liga MX 262, Premier 39, Mundial 1', same(lists.leagueIds, ['262', '39', '1']), JSON.stringify(lists.leagueIds));
  check('players → Messi 154, Cristiano 874 (squad player pending)', same(lists.playerIds, ['154', '874']), JSON.stringify(lists.playerIds));
  check('rivals → Cruz Azul 2295 (a followed team is not also a rival)', same(lists.rivalTeamIds, ['2295']), JSON.stringify(lists.rivalTeamIds));
  check('favorite matches dropped', lists.matchIds.length === 0);
  const backup = await Mig.readLegacyBackup();
  check('legacy lists kept as backup (with muted matches)', !!backup && same(backup.teamIds, ['2687', '427', '3468', '99999999']) && same(backup.mutedMatchIds, ['19135001']));
  check('pending players recorded', (await AsyncStorage.getItem(Mig.PENDING_PLAYERS_KEY)) === '["777001"]');
  const keys = await AsyncStorage.getAllKeys();
  check('per-match state and stale caches removed', !keys.some(k => ['analistas_muted_matches', 'analistas_estadio_matches', 'analistas_recent_searches', 'analistas_cache_league_meta_v1_28009', 'cache:matches:date:2026-11-20'].includes(k)));
  check('unrelated settings untouched', (await AsyncStorage.getItem('analistas_notif_prefs')) !== null);
  const record = JSON.parse((await AsyncStorage.getItem(Mig.MIGRATION_KEY))!);
  check('migration recorded', record.teams === 3 && record.unmapped === 1 && record.pendingPlayers === 1, JSON.stringify(record));

  check('migration recorded as complete', record.cleaned === true);

  // Idempotent: later launches never translate again, whatever the lists hold.
  // (2287 is América's new id AND a legacy id of another club — re-translating
  // would silently swap teams.)
  await AsyncStorage.setItem(Mig.FAVORITES_KEYS.teams, JSON.stringify(['2287', '2278', '541', '33']));
  Mig.resetMigrationSessionForTests();
  await Mig.ensureLocalMigration();
  check('second launch does not re-translate', same((await Mig.readLocalFavorites()).teamIds, ['2287', '2278', '541', '33']));

  // Killed between storing the lists and dropping the stale caches: the next
  // launch finishes the cleanup and leaves the lists alone.
  await AsyncStorage.setItem(Mig.MIGRATION_KEY, JSON.stringify({ ...record, cleaned: false }));
  await AsyncStorage.setItem('analistas_cache_league_meta_v1_1', '{"data":1}');
  Mig.resetMigrationSessionForTests();
  await Mig.ensureLocalMigration();
  check('interrupted cleanup is finished on the next launch',
    (await AsyncStorage.getItem('analistas_cache_league_meta_v1_1')) === null
    && JSON.parse((await AsyncStorage.getItem(Mig.MIGRATION_KEY))!).cleaned === true
    && same((await Mig.readLocalFavorites()).teamIds, ['2287', '2278', '541', '33']));
  await AsyncStorage.setItem(Mig.FAVORITES_KEYS.teams, JSON.stringify(lists.teamIds));

  // ── 2. Players the device can't map: the backend matches by surname + birth date
  await adminDb.doc('players/777001').set({ id: 777001, raw: {
    firstname: 'Luis Ángel', lastname: 'Malagón Velázquez', name: 'Luis Ángel Malagón Velázquez', display_name: 'Luis Malagón',
    date_of_birth: '1997-03-02', teams: [{ team_id: 2687, active: true, team: { type: 'domestic' } }],
  } });
  const recovered = await Mig.resolvePendingPlayers();
  check('pending player resolved by the backend (Malagón → 35930)', same(recovered, ['35930']), JSON.stringify(recovered));
  check('pending list cleared', (await AsyncStorage.getItem(Mig.PENDING_PLAYERS_KEY)) === null);
  const cachedMap = (await adminDb.doc('fb_legacy_players/777001').get()).data();
  check('lookup cached server-side', cachedMap?.afId === '35930');

  // ── 3. Cloud favorites still in the legacy id space
  const remote = await Mig.migrateRemoteFavorites({ teamIds: ['2687', '18576'], leagueIds: ['743'], playerIds: ['184798', '777001', '555'], rivalTeamIds: ['2626'], matchIds: ['1'] });
  check('cloud favorites translated', same(remote, { matchIds: [], teamIds: ['2287', '16'], playerIds: ['154', '35930'], leagueIds: ['262'], rivalTeamIds: ['2295'] }), JSON.stringify(remote));

  // Backend unreachable while translating cloud favorites: the players are
  // queued for the next launch instead of being lost; signing out drops the queue.
  setOnDemandTransport(async () => { throw new Error('offline'); });
  const offline = await Mig.migrateRemoteFavorites({ teamIds: ['2687'], playerIds: ['184798', '888002'] });
  check('cloud players queued when the backend is unreachable', same(offline.playerIds, ['154'])
    && (await AsyncStorage.getItem(Mig.PENDING_PLAYERS_KEY)) === '["888002"]');
  await Mig.clearPendingPlayers();
  check('queue cleared on sign-out', (await AsyncStorage.getItem(Mig.PENDING_PLAYERS_KEY)) === null);
  setOnDemandTransport(async req => server.toPlain(await server.handleOnDemand(req)));

  // ── 4. Push topics
  fcmCalls.length = 0;
  const left = await Topics.unsubscribeLegacyTopics({ teamIds: backup!.teamIds, rivalTeamIds: backup!.rivalTeamIds, playerIds: backup!.playerIds, muteMatchIds: backup!.mutedMatchIds });
  const unsubs = fcmCalls.filter(c => c.op === 'unsub').map(c => c.topic);
  check('legacy topics left', left && unsubs.includes('team_2687_goals_d0') && unsubs.includes('team_2687_goals_d5') && unsubs.includes('team_427_kickoff')
    && unsubs.includes('team_2626_rival_loss') && unsubs.includes('player_184798_goals') && unsubs.includes('mute_19135001') && unsubs.includes('team_2687_goals'),
    `${unsubs.length} unsubscribes`);
  check('no fb_ topic touched while leaving legacy ones', !fcmCalls.some(c => c.topic.startsWith('fb_')) && !fcmCalls.some(c => c.op === 'sub'));
  fcmCalls.length = 0;
  await Topics.unsubscribeLegacyTopics({ teamIds: ['2687'], rivalTeamIds: [], playerIds: [], muteMatchIds: [] });
  check('legacy cleanup runs once', fcmCalls.length === 0);

  fcmCalls.length = 0;
  await Topics.reconcileSubscriptions({
    teamIds: lists.teamIds, leagueIds: lists.leagueIds, playerIds: [...lists.playerIds, ...recovered],
    rivalTeamIds: lists.rivalTeamIds, delayBucket: 'd5', muteMatchIds: ['1651508'],
  });
  const subs = new Set(fcmCalls.filter(c => c.op === 'sub').map(c => c.topic));
  const expected = [
    FbTopics.goals('2287', 'd5'), FbTopics.cards('2287', 'd5'), FbTopics.live('2287', 'd5'),
    FbTopics.kickoff('2287'), FbTopics.lineups('2287'), FbTopics.reminders('2287'),
    FbTopics.goals('541', 'd5'), FbTopics.rivalLoss('2295'), FbTopics.rivalBigLoss('2295'),
    FbTopics.rivalRedCard('2295'), FbTopics.rivalPenMiss('2295'),
    FbTopics.playerGoals('154'), FbTopics.playerCards('874'), FbTopics.playerLineups('35930'),
    FbTopics.mute('1651508'),
  ];
  check('subscribed to the topics the backend sends to', expected.every(t => subs.has(t)), `${subs.size} topics, e.g. ${[...subs].slice(0, 3).join(', ')}`);
  check('one delay bucket per team (Modo Estadio 5 min)', !subs.has(FbTopics.goals('2287', 'd0')) && !subs.has(FbTopics.goals('2287', 'd2')));
  check('every subscription is in the new namespace', [...subs].every(t => t.startsWith('fb_')));
  check('leagues never subscribe (display only)', ![...subs].some(t => t.includes('league')));

  fcmCalls.length = 0;
  await Topics.unsubscribeTeamTopics('541');
  check('unfollow leaves all topics of the team', fcmCalls.filter(c => c.op === 'unsub').length === 15 && fcmCalls.every(c => c.topic.startsWith('fb_team_541_')));

  console.log(`\n${failures === 0 ? 'ALL MIGRATION CHECKS PASSED' : failures + ' FAILED'}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
