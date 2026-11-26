// Standalone check of the Modo Estadio server patch. Nothing leaves the process:
// FCM, Cloud Tasks and Firestore are replaced by recorders.
//   cd functions && npm run build && node ../scripts/fb-tests/estadio-push.check.js
process.env.GCLOUD_PROJECT = 'demo-analistas';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:1'; // never dialled: db.doc is replaced
const path = require('path');
const fn = process.argv[2] || path.resolve(__dirname, '../../functions');
const lib = p => require(path.join(fn, 'lib', p));

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' — ' + extra}`); if (!ok) failed++; };

const adminInit = lib('admin-init.js');
const sent = [];
Object.defineProperty(adminInit.admin, 'messaging', { configurable: true, value: () => ({ send: async m => { sent.push(m); return 'ok'; } }) });

const notify = lib('football/notify.js');
const detect = lib('football/live-detect.js');
const deliver = lib('deliver-delayed-push.js');

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
  await notify.dispatchFootballChanges([ch('goal', { homeScore: 1, scorerName: 'R. Aguirre' })], { queue });
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
  await notify.dispatchFootballChanges([ch('yellowCard')], { queue });
  check('dispatch: a yellow card has no old-build copy (those builds have no such topic)', tasks.length === 3 && tasks.every(t => t.opts.id.startsWith('fb_')), tasks.map(t => t.opts.id).join(' '));

  tasks.length = 0; sent.length = 0;
  await notify.dispatchFootballChanges([ch('goalCancelled', { eventAt: 1000, revokedAt: 1040 })], { queue });
  check('dispatch: a quickly disallowed goal reaches only the immediate topics', tasks.length === 0 && sent.length === 2, `tasks ${tasks.length}, sent ${sent.length}`);
  await notify.dispatchFootballChanges([ch('goalCancelled', { eventAt: 1000, revokedAt: 1200 })], { queue });
  check('dispatch: disallowed after the 2-minute copy went out → that bucket gets the correction 2 minutes later', tasks.length === 2 && tasks.every(t => t.opts.scheduleDelaySeconds === 120 && t.payload.changeType === 'goalCancelled') &&
    tasks.some(t => t.payload.condition.includes('fb_team_2287_goals_d2')) && tasks.some(t => /'team_\d+_goals_d2'/.test(t.payload.condition)), JSON.stringify(tasks.map(t => t.payload.condition)));

  tasks.length = 0;
  await notify.dispatchFootballChanges([ch('goal', { homeScore: 1 })], { queue: null });
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
  try { await notify.dispatchFootballChanges([ch('goal', { homeScore: 1 })], { queue: dead }); } catch { threw = true; }
  check('dispatch: a dead queue never breaks the poll', !threw);

  // ── delivery handler ──────────────────────────────────────────────────────
  let reads = 0;
  let row = { homeScore: 1, awayScore: 0, homeRedCards: 0, awayRedCards: 0 };
  adminInit.db.doc = () => ({ get: async () => { reads++; return { exists: true, data: () => row }; } });
  const task = (changeType, extra = {}) => ({ condition: "'fb_team_2282_goals_d2' in topics", title: 't', body: 'b', data: { type: changeType, matchId: '77' }, dedupId: 'd', changeType, matchId: '77', homeScore: 1, awayScore: 0, matchCollection: 'fb_matches', ...extra });
  sent.length = 0;
  await deliver.handleDelayedPush(task('goal'));
  check('deliver: a goal that still stands is delivered', sent.length === 1 && reads === 1 && sent[0].fcmOptions.analyticsLabel === 'goal-estadio', JSON.stringify(sent[0]?.fcmOptions));
  row = { homeScore: 0, awayScore: 0 };
  await deliver.handleDelayedPush(task('goal'));
  check('deliver: a goal disallowed in the meantime is dropped', sent.length === 1);
  reads = 0;
  await deliver.handleDelayedPush(task('goalCancelled', { homeScore: 0 }));
  check('deliver: a correction is delivered without consulting the score', sent.length === 2 && reads === 0 && sent[1].fcmOptions.analyticsLabel === 'goalCancelled-estadio');
  row = { homeScore: 1, awayScore: 0 };
  await deliver.handleDelayedPush(task('goal', { condition: "'team_2687_goals_d5' in topics", data: { type: 'goal', legacy: '1' }, dedupId: 'ld' }));
  check('deliver: the old-build copy is labelled apart and keeps the VAR guard', sent.length === 3 && sent[2].fcmOptions.analyticsLabel === 'legacy-goal-estadio' && sent[2].condition.includes('team_2687_goals_d5') && reads === 1, JSON.stringify(sent[2]?.fcmOptions));

  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
