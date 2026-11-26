// Modo Estadio per match, app side (src/services/estadio.ts): what the device
// asks the server for, what it remembers, and the notification buttons.
// The server call is replaced by a recorder; storage is in memory.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  bumpEstadio, EstadioError, forgetEstadio, getLastEstadioDelay, handleEstadioAction, readEstadioSessions, refreshEstadioWantsNow,
  setEstadioTransport, startEstadio, stopEstadio, stopEstadioBecauseMuted, subscribeEstadio, wantsForMatch,
} from '../../src/services/estadio';
import { FAVORITES_KEYS } from '../../src/services/football/legacyMigration';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' — ' + extra}`); if (!ok) failed++; };
const set = (k: string, v: unknown) => AsyncStorage.setItem(k, JSON.stringify(v));
const match = { id: '77', homeTeamId: '2282', awayTeamId: '2287' };

async function main() {
  // ── what the device wants from a match ────────────────────────────────────
  await set(FAVORITES_KEYS.teams, ['2287', '16']);
  await set(FAVORITES_KEYS.rivals, ['2282', '999']);
  await set(FAVORITES_KEYS.players, ['9', '10']);
  let w = await wantsForMatch(match);
  check('wants: a followed team brings the toggles that are on (defaults: goals, reds, phases, kickoff)', w.classes.join() === 'goals,cards,live,kickoff', w.classes.join());
  check('wants: only rivals playing this match, with the rival toggles', w.rivalTeamIds.join() === '2282' && w.rivalEvents.join() === 'loss,bigLoss,redCard,penMiss', JSON.stringify(w));
  check('wants: followed players go along', w.playerIds.join() === '9,10');

  await set('analistas_match_event_overrides', { '77': { goals: false, yellowCards: true }, '88': { redCards: false } });
  w = await wantsForMatch(match);
  check('wants: this match\'s own switches win over the general ones', w.classes.join() === 'cards,yellow,live,kickoff', w.classes.join());
  await AsyncStorage.removeItem('analistas_match_event_overrides');

  w = await wantsForMatch({ id: '5', homeTeamId: '1', awayTeamId: '2' });
  check('wants: a match of teams the user doesn\'t follow has no team notifications', w.classes.length === 0 && w.rivalTeamIds.length === 0 && w.playerIds.length === 2);
  w = await wantsForMatch({ id: '6', homeTeamId: '21213', awayTeamId: '25551' });
  check('wants: following Mexico covers Mexico U17', w.classes.join() === 'goals,cards,live,kickoff', w.classes.join());

  await set('analistas_notif_prefs', { notificationsEnabled: false });
  w = await wantsForMatch(match);
  check('wants: with notifications switched off nothing is asked for', w.classes.length === 0 && w.rivalTeamIds.length === 0 && w.rivalEvents.length === 0 && w.playerIds.length === 0, JSON.stringify(w));
  await set('analistas_notif_prefs', { yellowCards: true, rivalPenMiss: false });
  w = await wantsForMatch(match);
  check('wants: stored toggles are read over the defaults', w.classes.includes('yellow') && w.classes.includes('goals') && !w.rivalEvents.includes('penMiss'), JSON.stringify(w));

  // ── start / change / stop ─────────────────────────────────────────────────
  const calls: any[] = [];
  let reply: any = (req: any) => ({ ok: true, active: req.action !== 'stop', delayMin: req.action === 'start' ? req.delayMin : 8, endsAt: 99999999999 });
  setEstadioTransport(async req => { calls.push(req); const r = typeof reply === 'function' ? reply(req) : reply; if (r instanceof Error) throw r; return r; });
  const seen: number[] = [];
  const unsub = subscribeEstadio(s => seen.push(Object.keys(s).length));

  check('state: 3 minutes is the option before the user ever picked one', (await getLastEstadioDelay()) === 3);
  await startEstadio(match, 5);
  let sessions = await readEstadioSessions();
  check('start: one call with the device token, the delay and what it wants', calls.length === 1 && calls[0].action === 'start' && calls[0].matchId === '77' && calls[0].fcmToken === 'fake-fcm-token' && calls[0].delayMin === 5 && calls[0].platform === 'ios' && calls[0].classes.includes('goals') && calls[0].rivalTeamIds.join() === '2282' && !calls[0].confirm, JSON.stringify(calls[0]));
  check('start: the session is remembered only after the server said yes', sessions['77']?.delayMin === 5 && seen.join() === '1');
  check('start: the option picked is remembered for next time', (await getLastEstadioDelay()) === 5);

  const d = await bumpEstadio('77');
  sessions = await readEstadioSessions();
  check('bump: the new delay is the one the server answered', d === 8 && sessions['77'].delayMin === 8 && calls[1].action === 'bump');
  check('bump: it doesn\'t change the option offered next time', (await getLastEstadioDelay()) === 5);

  reply = Object.assign(new Error('unavailable'), { code: 'functions/unavailable' });
  let err: unknown = null;
  try { await stopEstadio('77'); } catch (e) { err = e; }
  check('stop: if the server can\'t be reached it is said, and the session stays', err instanceof EstadioError && err.code === 'failed' && !!(await readEstadioSessions())['77']);
  reply = Object.assign(new Error('match-finished'), { code: 'functions/failed-precondition' });
  err = null;
  try { await startEstadio({ id: '90' }, 3); } catch (e) { err = e; }
  check('start: a finished match is reported as such, nothing stored', err instanceof EstadioError && (err as EstadioError).code === 'match-finished' && !(await readEstadioSessions())['90']);

  reply = (req: any) => ({ ok: true, active: req.action !== 'stop', delayMin: req.delayMin ?? 0, endsAt: 99999999999 });
  await stopEstadio('77');
  check('stop: the session is gone and the device is released', !(await readEstadioSessions())['77'] && calls[calls.length - 1].action === 'stop' && !calls[calls.length - 1].keepMuted);

  reply = { ok: true, active: false, delayMin: 0 };
  check('bump: without a session on the server nothing is kept here', (await bumpEstadio('77')) === 0 && !(await readEstadioSessions())['77']);

  // ── silencing a match with the mode on ────────────────────────────────────
  reply = (req: any) => ({ ok: true, active: req.action !== 'stop', delayMin: req.delayMin ?? 0, endsAt: 99999999999 });
  await startEstadio(match, 3);
  calls.length = 0;
  await stopEstadioBecauseMuted('77');
  check('mute: silencing ends the mode and asks to stay muted', calls.length === 1 && calls[0].action === 'stop' && calls[0].keepMuted === true && !(await readEstadioSessions())['77']);
  calls.length = 0;
  await stopEstadioBecauseMuted('77');
  check('mute: silencing a match without the mode calls nobody', calls.length === 0);
  await startEstadio(match, 3);
  reply = new Error('offline');
  await stopEstadioBecauseMuted('77');
  check('mute: offline, the match still stops showing the mode', !(await readEstadioSessions())['77']);

  // ── following a team with the mode already on ─────────────────────────────
  reply = (req: any) => ({ ok: true, active: req.action !== 'stop', delayMin: req.delayMin ?? 3, endsAt: 99999999999 });
  await set(FAVORITES_KEYS.teams, []);
  await startEstadio(match, 3);
  calls.length = 0;
  await set(FAVORITES_KEYS.teams, ['2282']);
  await refreshEstadioWantsNow();
  check('refresh: a team followed mid-match is sent to the server for the running session', calls.length === 1 && calls[0].action === 'refresh' && calls[0].matchId === '77' && calls[0].classes.includes('goals') && calls[0].delayMin === undefined && (await readEstadioSessions())['77'].delayMin === 3, JSON.stringify(calls[0]));
  reply = { ok: true, active: false, delayMin: 0 };
  await refreshEstadioWantsNow();
  check('refresh: a session the server already closed stops showing here', !(await readEstadioSessions())['77']);
  calls.length = 0;
  await refreshEstadioWantsNow();
  check('refresh: with no session nobody is called', calls.length === 0);
  await set(FAVORITES_KEYS.teams, ['2287', '16']);

  // ── notification buttons ──────────────────────────────────────────────────
  reply = (req: any) => ({ ok: true, active: req.action !== 'stop', delayMin: req.action === 'bump' ? 6 : (req.delayMin ?? 0), endsAt: 99999999999 });
  calls.length = 0;
  const data = { matchId: '77', homeTeamId: '2282', awayTeamId: '2287', type: 'matchStart' };
  const on = await handleEstadioAction('on', data, 'notif-1');
  check('button "Activar": last option used, team ids from the push, confirmation requested', on === true && calls.length === 1 && calls[0].action === 'start' && calls[0].delayMin === 3 && calls[0].confirm === true && calls[0].classes.includes('goals') && !!(await readEstadioSessions())['77'], JSON.stringify(calls[0]));
  const again = await handleEstadioAction('on', data, 'notif-1');
  check('button: the same tap handed over twice is applied once', again === 'ignored' && calls.length === 1);
  await handleEstadioAction('spoiled', { matchId: '77' }, 'notif-2');
  await handleEstadioAction('spoiled', { matchId: '77' }, 'notif-2');
  check('button "Me spoileó": minutes are added once per tap', calls.filter(c => c.action === 'bump').length === 1 && (await readEstadioSessions())['77'].delayMin === 6 && calls[1].confirm === true);
  const other = await handleEstadioAction('spoiled', { matchId: '77' }, 'notif-3');
  check('button: a tap on another notification counts on its own', other === true && calls.filter(c => c.action === 'bump').length === 2);
  await handleEstadioAction('off', { matchId: '77' }, 'notif-3');
  check('button "Apagar": stops the session', calls[calls.length - 1].action === 'stop' && calls[calls.length - 1].confirm === true && !(await readEstadioSessions())['77']);
  reply = new Error('offline');
  check('button: a failed request is reported back (the caller tells the user)', (await handleEstadioAction('on', data, 'notif-4')) === false);
  check('button: a push without a match is ignored', (await handleEstadioAction('on', { type: 'x' }, 'notif-5')) === 'ignored');

  // ── expiry ────────────────────────────────────────────────────────────────
  await set('analistas_estadio_sessions_v2', { '1': { delayMin: 3, endsAt: 1 }, '2': { delayMin: 5, endsAt: 99999999999 } });
  sessions = await readEstadioSessions();
  check('state: sessions past their end are not shown', !sessions['1'] && sessions['2']?.delayMin === 5);
  await forgetEstadio('2');
  check('state: a finished match stops showing as active without calling the server', !(await readEstadioSessions())['2']);
  unsub();

  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
