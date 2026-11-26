// Standalone check of Modo Estadio on the server (delayed topic copies and the
// per-match sessions). Nothing leaves the process:
// FCM, Cloud Tasks and Firestore are replaced by recorders.
//   cd functions && npm run build && node ../scripts/fb-tests/estadio-push.check.js
process.env.GCLOUD_PROJECT = 'demo-analistas';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:1'; // never dialled: the db calls used are replaced
const path = require('path');
const fn = process.argv[2] || path.resolve(__dirname, '../../functions');
const lib = p => require(path.join(fn, 'lib', p));

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' — ' + extra}`); if (!ok) failed++; };

const adminInit = lib('admin-init.js');
const sent = [];       // topic / condition sends
const multicast = [];  // sends to device tokens
const topicOps = [];   // server-side topic (un)subscriptions
let refuseTopic = null;
Object.defineProperty(adminInit.admin, 'messaging', { configurable: true, value: () => ({
  send: async m => { sent.push(m); return 'ok'; },
  sendEachForMulticast: async m => { multicast.push(m); return { successCount: m.tokens.length, failureCount: 0, responses: [] }; },
  subscribeToTopic: async (tokens, topic) => { topicOps.push(`+${topic}`); return { successCount: topic === refuseTopic ? 0 : tokens.length, failureCount: topic === refuseTopic ? tokens.length : 0, errors: [] }; },
  unsubscribeFromTopic: async (tokens, topic) => { topicOps.push(`-${topic}`); return { successCount: tokens.length, failureCount: 0, errors: [] }; },
}) });

// In-memory documents behind the few Firestore calls these paths make.
const docs = new Map();
let reads = 0;
const docRef = p => ({
  path: p,
  get: async () => { reads++; return { exists: docs.has(p), data: () => docs.get(p) }; },
  set: async d => { docs.set(p, { ...d }); },
  update: async d => { docs.set(p, { ...docs.get(p), ...d }); },
  delete: async () => { docs.delete(p); },
});
adminInit.db.doc = docRef;
adminInit.db.getAll = async (...refs) => refs.map(r => ({ exists: docs.has(r.path), data: () => docs.get(r.path) }));

const notify = lib('football/notify.js');
const detect = lib('football/live-detect.js');
const deliver = lib('deliver-delayed-push.js');
const estadio = lib('football/estadio.js');

const fixture = (short, elapsed, hs, as, events) => ({
  fixture: { id: 77, timestamp: 1000, status: { short, elapsed, extra: null, long: '' }, periods: { first: null, second: null }, venue: { id: null, name: null, city: null }, referee: null, date: '2026-11-26T00:00:00+00:00', timezone: 'UTC' },
  league: { id: 262, name: 'Liga MX', country: 'Mexico', season: 2026, round: 'Apertura - 17', logo: '', flag: '' },
  teams: { home: { id: 2282, name: 'Monterrey', logo: '', winner: null }, away: { id: 2287, name: 'Club America', logo: '', winner: null } },
  goals: { home: hs, away: as },
  score: { halftime: { home: null, away: null }, fulltime: { home: null, away: null }, extratime: { home: null, away: null }, penalty: { home: null, away: null } },
  events,
});
const goalEv = (teamId, min) => ({ time: { elapsed: min, extra: null }, team: { id: teamId, name: '' }, player: { id: 9, name: 'R. Aguirre' }, assist: { id: null, name: null }, type: 'Goal', detail: 'Normal Goal', comments: null });
const redEv = (teamId, min) => ({ time: { elapsed: min, extra: null }, team: { id: teamId, name: '' }, player: { id: 5, name: 'J. Pérez' }, assist: { id: null, name: null }, type: 'Card', detail: 'Red Card', comments: null });

(async () => {
  // ── detector: when was the event announced, when was it taken back ────────
  let snap = detect.detectChanges([fixture('1H', 10, 0, 0, [])], {}, 1000).next;
  let r = detect.detectChanges([fixture('1H', 12, 1, 0, [goalEv(2282, 12)])], snap, 1060);
  check('detect: a goal is announced and its time remembered', r.changes.some(c => c.type === 'goal') && r.next['77'].gt === 1060, JSON.stringify(r.next['77']));
  snap = { ...snap, ...r.next };
  r = detect.detectChanges([fixture('1H', 13, 1, 0, [goalEv(2282, 12)])], snap, 1075);
  check('detect: the goal time survives quiet polls', r.changes.length === 0 && r.next['77'].gt === 1060);
  snap = { ...snap, ...r.next };
  r = detect.detectChanges([fixture('1H', 14, 0, 0, [])], snap, 1100);
  const gc = r.changes.find(c => c.type === 'goalCancelled');
  check('detect: a disallowed goal says when the goal was announced and when it was taken back', !!gc && gc.eventAt === 1060 && gc.revokedAt === 1100, JSON.stringify(gc));
  snap = { ...snap, ...r.next };

  r = detect.detectChanges([fixture('1H', 20, 0, 0, [redEv(2287, 20)])], snap, 1500);
  check('detect: a red card is announced and its time remembered', r.changes.some(c => c.type === 'redCard') && r.next['77'].rt[1] === 1500, JSON.stringify(r.next['77']));
  snap = { ...snap, ...r.next };
  r = detect.detectChanges([fixture('1H', 22, 0, 0, [])], snap, 1620);
  check('detect: one poll without the red card is not yet a cancellation', !r.changes.some(c => c.type === 'redCardCancelled') && r.next['77'].rx[1] === 1620, JSON.stringify(r.next['77']));
  snap = { ...snap, ...r.next };
  r = detect.detectChanges([fixture('1H', 23, 0, 0, [])], snap, 1650);
  const rc = r.changes.find(c => c.type === 'redCardCancelled');
  check('detect: the revoked red card carries both times (revoked = first poll without it)', !!rc && rc.eventAt === 1500 && rc.revokedAt === 1620 && !r.next['77'].rx, JSON.stringify(rc));

  // ── which delayed buckets get a correction ────────────────────────────────
  const ch = (type, extra = {}) => ({ type, side: 'home', matchId: '77', homeTeam: { id: '2282', name: 'Monterrey' }, awayTeam: { id: '2287', name: 'Club America' }, homeScore: 0, awayScore: 0, league: 'Liga MX', leagueId: '262', popularity: 100, minute: 14, ...extra });
  const b = (type, extra) => notify.delayedBucketsFor(ch(type, extra)).join(',');
  check('buckets: a goal goes to every delay bucket', b('goal') === '2,5,10');
  check('buckets: kickoff goes to none', b('matchStart') === '');
  check('buckets: a goal disallowed after 40 s corrects nobody (no bucket had shown it)', b('goalCancelled', { eventAt: 1000, revokedAt: 1040 }) === '');
  check('buckets: disallowed after 3 min corrects only the 2-minute bucket', b('goalCancelled', { eventAt: 1000, revokedAt: 1180 }) === '2');
  check('buckets: disallowed after 6 min corrects 2 and 5', b('goalCancelled', { eventAt: 1000, revokedAt: 1360 }) === '2,5');
  check('buckets: at the edge (1 min 50 s) the 2-minute bucket is corrected', b('goalCancelled', { eventAt: 1000, revokedAt: 1110 }) === '2' && b('goalCancelled', { eventAt: 1000, revokedAt: 1100 }) === '');
  check('buckets: unknown announcement time corrects every bucket', b('goalCancelled', { revokedAt: 1100 }) === '2,5,10');
  check('buckets: revoked red card follows the same rule', b('redCardCancelled', { eventAt: 1500, revokedAt: 1620 }) === '2' && b('redCardCancelled', { eventAt: 1500, revokedAt: 1560 }) === '');

  // ── dispatch: tasks are awaited, old builds get their delayed copy ────────
  const tasks = [];
  let pending = 0;
  const queue = { enqueue: async (payload, opts) => { pending++; await new Promise(r2 => setTimeout(r2, 40)); tasks.push({ payload, opts }); pending--; } };
  sent.length = 0;
  await notify.dispatchFootballChanges([ch('goal', { homeScore: 1, scorerName: 'R. Aguirre' })], { queue, sessions: null });
  check('dispatch: returns only after every task was accepted', pending === 0 && tasks.length === 6, `pending ${pending}, tasks ${tasks.length}`);
  const fb = tasks.filter(t => t.opts.id.startsWith('fb_'));
  const old = tasks.filter(t => t.opts.id.startsWith('fbl_'));
  check('dispatch: three delayed copies for the new topics, with the mute guard', fb.length === 3 && fb.map(t => t.opts.scheduleDelaySeconds).sort((x, y) => x - y).join(',') === '120,300,600' &&
    fb.every(t => t.payload.condition.includes(`fb_team_2282_goals_d${t.opts.scheduleDelaySeconds / 60}`) && t.payload.condition.includes("!('fb_mute_77' in topics)") && t.payload.data.matchId === '77'), JSON.stringify(fb.map(t => t.payload.condition)));
  check('dispatch: three delayed copies for old builds, on their own topics and without matchId', old.length === 3 &&
    old.every(t => new RegExp(`'team_\\d+_goals_d${t.opts.scheduleDelaySeconds / 60}' in topics`).test(t.payload.condition) && !t.payload.condition.includes('fb_') && !t.payload.condition.includes('mute') &&
      t.payload.data.legacy === '1' && !('matchId' in t.payload.data) && t.payload.matchId === '77' && t.payload.matchCollection === 'fb_matches' && t.payload.dedupId.startsWith('l')), JSON.stringify(old.map(t => [t.payload.condition, t.payload.data])));
  check('dispatch: task ids are unique and valid', new Set(tasks.map(t => t.opts.id)).size === 6 && tasks.every(t => /^[a-zA-Z0-9_-]{1,499}$/.test(t.opts.id)), tasks.map(t => t.opts.id).join(' '));
  check('dispatch: the immediate push and its old-build twin still go out', sent.length === 2 && sent.some(m => m.condition.includes('fb_team_2282_goals_d0')) && sent.some(m => /'team_\d+_goals_d0'/.test(m.condition)), JSON.stringify(sent.map(m => m.condition)));

  tasks.length = 0; sent.length = 0;
  await notify.dispatchFootballChanges([ch('yellowCard')], { queue, sessions: null });
  check('dispatch: a yellow card has no old-build copy (those builds have no such topic)', tasks.length === 3 && tasks.every(t => t.opts.id.startsWith('fb_')), tasks.map(t => t.opts.id).join(' '));

  tasks.length = 0; sent.length = 0;
  await notify.dispatchFootballChanges([ch('goalCancelled', { eventAt: 1000, revokedAt: 1040 })], { queue, sessions: null });
  check('dispatch: a quickly disallowed goal reaches only the immediate topics', tasks.length === 0 && sent.length === 2, `tasks ${tasks.length}, sent ${sent.length}`);
  await notify.dispatchFootballChanges([ch('goalCancelled', { eventAt: 1000, revokedAt: 1200 })], { queue, sessions: null });
  check('dispatch: disallowed after the 2-minute copy went out → that bucket gets the correction 2 minutes later', tasks.length === 2 && tasks.every(t => t.opts.scheduleDelaySeconds === 120 && t.payload.changeType === 'goalCancelled') &&
    tasks.some(t => t.payload.condition.includes('fb_team_2287_goals_d2')) && tasks.some(t => /'team_\d+_goals_d2'/.test(t.payload.condition)), JSON.stringify(tasks.map(t => t.payload.condition)));

  tasks.length = 0;
  await notify.dispatchFootballChanges([ch('goal', { homeScore: 1 })], { queue: null, sessions: null });
  check('dispatch: with the delay switched off nothing is queued', tasks.length === 0);

  // ── enqueue retries ───────────────────────────────────────────────────────
  let calls = 0;
  const flaky = { enqueue: async () => { calls++; if (calls < 3) throw new Error('UNAVAILABLE: socket hang up'); } };
  const okAfterRetries = await notify.enqueueDelayed(flaky, { matchId: '77', changeType: 'goal' }, { scheduleDelaySeconds: 120, id: 'x' }, [5, 5]);
  check('enqueue: transient failures are retried until Cloud Tasks accepts', okAfterRetries === true && calls === 3, `calls ${calls}`);
  calls = 0;
  const dup = { enqueue: async () => { calls++; const e = new Error('A task with ID x already exists'); e.code = 'functions/task-already-exists'; throw e; } };
  check('enqueue: "already exists" counts as delivered, no retry', (await notify.enqueueDelayed(dup, { matchId: '77', changeType: 'goal' }, { scheduleDelaySeconds: 120, id: 'x' }, [5, 5])) === true && calls === 1, `calls ${calls}`);
  calls = 0;
  const dead = { enqueue: async () => { calls++; throw new Error('PERMISSION_DENIED'); } };
  const gaveUp = await notify.enqueueDelayed(dead, { matchId: '77', changeType: 'goal' }, { scheduleDelaySeconds: 120, id: 'x' }, [5, 5]);
  check('enqueue: gives up after three attempts without throwing', gaveUp === false && calls === 3, `calls ${calls}`);
  let threw = false;
  try { await notify.dispatchFootballChanges([ch('goal', { homeScore: 1 })], { queue: dead, sessions: null }); } catch { threw = true; }
  check('dispatch: a dead queue never breaks the poll', !threw);

  // ── delivery handler ──────────────────────────────────────────────────────
  reads = 0;
  docs.set('fb_matches/77', { homeScore: 1, awayScore: 0, homeRedCards: 0, awayRedCards: 0 });
  const task = (changeType, extra = {}) => ({ condition: "'fb_team_2282_goals_d2' in topics", title: 't', body: 'b', data: { type: changeType, matchId: '77' }, dedupId: 'd', changeType, matchId: '77', homeScore: 1, awayScore: 0, matchCollection: 'fb_matches', ...extra });
  sent.length = 0;
  await deliver.handleDelayedPush(task('goal'));
  check('deliver: a goal that still stands is delivered', sent.length === 1 && reads === 1 && sent[0].fcmOptions.analyticsLabel === 'goal-estadio', JSON.stringify(sent[0]?.fcmOptions));
  docs.set('fb_matches/77', { homeScore: 0, awayScore: 0 });
  await deliver.handleDelayedPush(task('goal'));
  check('deliver: a goal disallowed in the meantime is dropped', sent.length === 1);
  reads = 0;
  await deliver.handleDelayedPush(task('goalCancelled', { homeScore: 0 }));
  check('deliver: a correction is delivered without consulting the score', sent.length === 2 && reads === 0 && sent[1].fcmOptions.analyticsLabel === 'goalCancelled-estadio');
  docs.set('fb_matches/77', { homeScore: 1, awayScore: 0 });
  await deliver.handleDelayedPush(task('goal', { condition: "'team_2687_goals_d5' in topics", data: { type: 'goal', legacy: '1' }, dedupId: 'ld' }));
  check('deliver: the old-build copy is labelled apart and keeps the VAR guard', sent.length === 3 && sent[2].fcmOptions.analyticsLabel === 'legacy-goal-estadio' && sent[2].condition.includes('team_2687_goals_d5') && reads === 1, JSON.stringify(sent[2]?.fcmOptions));

  // ══ Modo Estadio per match ════════════════════════════════════════════════
  const sess = (token, delayMin, extra = {}) => ({ id: `77_${token}`, matchId: '77', token, delayMin, classes: ['goals', 'cards', 'live', 'kickoff'], rivalTeamIds: [], rivalEvents: [], playerIds: [], platform: 'ios', uid: null, startedAt: 900, endsAt: 99999999999, updatedAt: 900, ...extra });
  const want = (s2, type, extra) => { const r2 = estadio.sessionPushFor(s2, ch(type, extra)); return r2 ? `${r2.variant}:${r2.delaySec}` : 'none'; };

  check('session: goals, red cards and match phases arrive late', want(sess('a', 3), 'goal') === 'team:180' && want(sess('a', 5), 'redCard') === 'team:300' && want(sess('a', 3), 'matchEnd') === 'team:180');
  check('session: kickoff is never delayed', want(sess('a', 5), 'matchStart') === 'team:0' && want(sess('a', 5), 'kickoffDelayed') === 'team:0');
  check('session: a toggle that is off stays off', want(sess('a', 3), 'yellowCard') === 'none' && want(sess('a', 3), 'substitution') === 'none' && want(sess('a', 3, { classes: ['goals', 'yellow'] }), 'yellowCard') === 'team:180');
  check('session: a followed player reaches a device that has no team push for it, late', want(sess('a', 3, { classes: [], playerIds: ['9'] }), 'goal', { playerId: 9, scorerName: 'R. Aguirre' }) === 'player:180' && want(sess('a', 3, { classes: [], playerIds: ['8'] }), 'goal', { playerId: 9 }) === 'none' && want(sess('a', 3, { playerIds: ['9'] }), 'goal', { playerId: 9 }) === 'team:180');
  check('session: an own goal is not a followed-player push', want(sess('a', 3, { classes: [], playerIds: ['9'] }), 'goal', { playerId: 9, goalKind: 'own' }) === 'none');
  check('session: rival news is delayed too, and only for a team marked as rival', want(sess('a', 5, { rivalTeamIds: ['2282'], rivalEvents: ['loss', 'penMiss'] }), 'rivalLoss') === 'team:300' && want(sess('a', 5, { rivalTeamIds: ['2287'], rivalEvents: ['loss'] }), 'rivalLoss') === 'none' && want(sess('a', 5, { rivalTeamIds: ['2282'], rivalEvents: ['loss'] }), 'rivalBigLoss') === 'none');
  check('session: "rival sent off" is dropped when the red card itself already arrives', want(sess('a', 3, { rivalTeamIds: ['2282'], rivalEvents: ['redCard'] }), 'rivalRedCard') === 'none' && want(sess('a', 3, { classes: ['goals'], rivalTeamIds: ['2282'], rivalEvents: ['redCard'] }), 'rivalRedCard') === 'team:180');
  check('session: a goal disallowed before its delayed copy went out is not corrected', want(sess('a', 3), 'goalCancelled', { eventAt: 1000, revokedAt: 1090 }) === 'none' && want(sess('a', 3), 'goalCancelled', { eventAt: 1000, revokedAt: 1200 }) === 'team:180');
  check('session: a goal seen live before turning the mode on is corrected', want(sess('a', 5, { startedAt: 1050 }), 'goalCancelled', { eventAt: 1000, revokedAt: 1090 }) === 'team:300');

  const source = list => ({ expired: [], load: async () => new Map([['77', list]]), async expire(u) { this.expired.push(...u); } });
  let src = source([sess('tokA', 3), sess('tokB', 5), sess('tokC', 3), sess('tokD', 3, { classes: [] })]);
  tasks.length = 0; multicast.length = 0;
  await estadio.dispatchEstadioSessions([ch('goal', { homeScore: 1 })], { queue, sessions: src, nowSec: 2000 });
  const t3 = tasks.find(t => t.opts.scheduleDelaySeconds === 180);
  const t5 = tasks.find(t => t.opts.scheduleDelaySeconds === 300);
  check('sessions: one task per delay, each with its devices', tasks.length === 2 && !!t3 && !!t5 && t3.payload.tokens.join(',') === 'tokA,tokC' && t5.payload.tokens.join(',') === 'tokB' && multicast.length === 0, JSON.stringify(tasks.map(t => [t.opts, t.payload.tokens])));
  check('sessions: the task carries the VAR guard, the match and the Modo Estadio buttons', !!t3 && t3.payload.changeType === 'goal' && t3.payload.homeScore === 1 && t3.payload.matchCollection === 'fb_matches' && t3.payload.data.matchId === '77' && t3.payload.category === 'MATCH_ESTADIO' && !t3.payload.condition && /^[a-zA-Z0-9_-]+$/.test(t3.opts.id), JSON.stringify(t3));

  tasks.length = 0; multicast.length = 0;
  await estadio.dispatchEstadioSessions([ch('matchStart')], { queue, sessions: src, nowSec: 2000 });
  check('sessions: kickoff goes out at once, straight to the devices', tasks.length === 0 && multicast.length === 1 && multicast[0].tokens.join(',') === 'tokA,tokB,tokC' && multicast[0].apns.payload.aps.category === 'MATCH_ESTADIO', JSON.stringify(multicast.map(m => m.tokens)));

  tasks.length = 0; multicast.length = 0;
  await estadio.dispatchEstadioSessions([ch('goal', { homeScore: 1 })], { queue: null, sessions: src, nowSec: 2000 });
  check('sessions: with the delay switched off the devices still get the push, at once', tasks.length === 0 && multicast.flatMap(m => m.tokens).sort().join(',') === 'tokA,tokB,tokC', JSON.stringify(multicast.map(m => m.tokens)));

  tasks.length = 0; multicast.length = 0;
  await estadio.dispatchEstadioSessions([ch('matchEnd'), ch('rivalLoss')], { queue, sessions: src, nowSec: 2000 });
  check('sessions: full time gives every session its last expiry (delay + 2 min)', src.expired.length === 4 && src.expired.find(u => u.id === '77_tokA').endsAt === 2000 + 180 + 120 && src.expired.find(u => u.id === '77_tokB').endsAt === 2000 + 300 + 120, JSON.stringify(src.expired));
  check('sessions: the final whistle itself is still delivered late', tasks.length === 2 && tasks.every(t => t.payload.changeType === 'matchEnd'), tasks.map(t => t.payload.changeType).join());

  src = source([sess('tokP', 3, { classes: [], playerIds: ['9'] }), sess('tokT', 3)]);
  tasks.length = 0;
  await estadio.dispatchEstadioSessions([ch('goal', { homeScore: 1, playerId: 9, scorerName: 'R. Aguirre' })], { queue, sessions: src, nowSec: 2000 });
  const pTask = tasks.find(t => t.payload.tokens[0] === 'tokP');
  check('sessions: the player follower gets the player push, the team follower the team push', tasks.length === 2 && !!pTask && pTask.payload.data.type === 'playerGoal' && pTask.payload.title.includes('R. Aguirre') && tasks.find(t => t.payload.tokens[0] === 'tokT').payload.data.type === 'goal' && new Set(tasks.map(t => t.opts.id)).size === 2, JSON.stringify(tasks.map(t => [t.opts.id, t.payload.title])));

  tasks.length = 0; sent.length = 0;
  await notify.dispatchFootballChanges([ch('goal', { homeScore: 1, playerId: 9, scorerName: 'R. Aguirre' })], { queue, sessions: src });
  const playerSend = sent.find(m => m.condition.includes('fb_player_9_goals'));
  check('dispatch: topics and sessions are served by the same call', tasks.filter(t => t.payload.tokens).length === 2 && tasks.filter(t => t.payload.condition).length === 6 && sent.length === 3, `tasks ${tasks.length}, sent ${sent.length}`);
  check('dispatch: the followed-player topic push skips devices with a session (five topics)', !!playerSend && playerSend.condition.includes("!('fb_hold_77' in topics)") && (playerSend.condition.match(/in topics/g) || []).length === 5, playerSend && playerSend.condition);
  let broke = false;
  try { await notify.dispatchFootballChanges([ch('goal', { homeScore: 1 })], { queue, sessions: { load: async () => { throw new Error('firestore down'); }, expire: async () => {} } }); } catch { broke = true; }
  check('dispatch: a failure reading sessions never costs the regular pushes', !broke && sent.some(m => m.condition.includes('fb_team_2282_goals_d0')));

  // delivery to tokens
  multicast.length = 0; reads = 0;
  docs.set('fb_matches/77', { homeScore: 1, awayScore: 0 });
  await deliver.handleDelayedPush({ tokens: ['tokA', 'tokC'], category: 'MATCH_ESTADIO', title: 't', body: 'b', data: { type: 'goal', matchId: '77' }, dedupId: 'd', changeType: 'goal', matchId: '77', homeScore: 1, awayScore: 0, matchCollection: 'fb_matches' });
  check('deliver: a session task goes to its devices after the VAR guard', multicast.length === 1 && reads === 1 && multicast[0].tokens.length === 2 && multicast[0].apns.payload.aps.category === 'MATCH_ESTADIO' && multicast[0].fcmOptions.analyticsLabel === 'goal-estadio');
  docs.set('fb_matches/77', { homeScore: 0, awayScore: 0 });
  await deliver.handleDelayedPush({ tokens: ['tokA'], title: 't', body: 'b', data: { type: 'goal', matchId: '77' }, dedupId: 'd', changeType: 'goal', matchId: '77', homeScore: 1, awayScore: 0, matchCollection: 'fb_matches' });
  check('deliver: a disallowed goal never reaches the session devices', multicast.length === 1);

  // the callable
  const TOKEN = 'fcm-token-of-a-device-0123456789';
  const sid = `fb_estadio/${estadio.sessionIdFor('77', TOKEN)}`;
  const liveMatch = { id: '77', statusShort: '1H', timestamp: 5000, homeTeam: { id: '2282', name: 'Monterrey' }, awayTeam: { id: '2287', name: 'Club America' }, homeScore: 0, awayScore: 0, leagueId: '262' };
  const call = (action, extra = {}) => estadio.handleEstadio({ action, matchId: '77', fcmToken: TOKEN, ...extra }, 'uid1');
  const fails = async (p2, code) => { try { await p2; return false; } catch (e) { return e.code === code; } };
  docs.clear(); docs.set('fb_matches/77', liveMatch); topicOps.length = 0; multicast.length = 0;

  check('callable: bad input is refused', await fails(call('start', { delayMin: 2 }), 'invalid-argument') && await fails(call('start', { delayMin: 10 }), 'invalid-argument') && await fails(estadio.handleEstadio({ action: 'start', matchId: 'x', fcmToken: TOKEN, delayMin: 3 }, null), 'invalid-argument') && await fails(estadio.handleEstadio({ action: 'start', matchId: '77', fcmToken: 'short', delayMin: 3 }, null), 'invalid-argument') && await fails(call('explode'), 'invalid-argument') && topicOps.length === 0 && !docs.has(sid));
  let res = await call('start', { delayMin: 3, classes: ['goals', 'live', 'nonsense'], rivalTeamIds: ['2287', '999'], rivalEvents: ['loss', 'x'], playerIds: ['9', 'DROP TABLE'], platform: 'ios' });
  const stored = docs.get(sid);
  check('callable: start holds the device and stores a clean session', res.active && res.delayMin === 3 && topicOps.join(' ') === '+fb_mute_77 +fb_hold_77' && !!stored && stored.token === TOKEN && stored.delayMin === 3 && stored.classes.join() === 'goals,live' && stored.rivalTeamIds.join() === '2287' && stored.rivalEvents.join() === 'loss' && stored.playerIds.join() === '9' && stored.uid === 'uid1' && stored.endsAt > stored.startedAt, JSON.stringify([topicOps, stored]));
  check('callable: no confirmation push unless asked', multicast.length === 0);
  const startedAt = stored.startedAt;
  res = await call('start', { delayMin: 5, classes: ['goals'], confirm: true });
  check('callable: changing the option keeps the session start and confirms by push when asked', docs.get(sid).delayMin === 5 && docs.get(sid).startedAt === startedAt && multicast.length === 1 && multicast[0].tokens[0] === TOKEN && multicast[0].notification.title === 'Modo Estadio activado' && multicast[0].notification.body === 'Monterrey vs América: tus avisos llegan 5 minutos después. Se apaga solo al final.', multicast[0] && multicast[0].notification.body);
  res = await call('bump');
  const b1 = res.delayMin; res = await call('bump'); const b2 = res.delayMin; res = await call('bump'); const b3 = res.delayMin;
  check('callable: "me spoileó" adds 3 minutes up to 10', b1 === 8 && b2 === 10 && b3 === 10 && docs.get(sid).delayMin === 10, `${b1},${b2},${b3}`);
  topicOps.length = 0;
  res = await call('stop');
  check('callable: stop deletes the session and releases the device', !res.active && !docs.has(sid) && topicOps.join(' ') === '-fb_hold_77 -fb_mute_77', topicOps.join(' '));
  res = await call('bump');
  check('callable: adding delay without a session does nothing', !res.active && !docs.has(sid));
  await call('start', { delayMin: 3 }); topicOps.length = 0;
  await call('stop', { keepMuted: true });
  check('callable: stopping because the user silenced the match keeps it muted', topicOps.join(' ') === '-fb_hold_77' && !docs.has(sid), topicOps.join(' '));

  topicOps.length = 0; refuseTopic = 'fb_mute_77';
  check('callable: a token FCM refuses is not left with a session', await fails(call('start', { delayMin: 3 }), 'failed-precondition') && !docs.has(sid));
  topicOps.length = 0; refuseTopic = 'fb_hold_77';
  check('callable: a half-held device is released again', await fails(call('start', { delayMin: 3 }), 'failed-precondition') && !docs.has(sid) && topicOps.join(' ') === '+fb_mute_77 +fb_hold_77 -fb_mute_77', topicOps.join(' '));
  refuseTopic = null;
  docs.set('fb_matches/77', { ...liveMatch, statusShort: 'FT' });
  check('callable: a finished match cannot be started', await fails(call('start', { delayMin: 3 }), 'failed-precondition'));
  docs.delete('fb_matches/77');
  check('callable: an unknown match cannot be started', await fails(call('start', { delayMin: 3 }), 'not-found'));

  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
