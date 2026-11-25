/**
 * scripts/fb-emulator.ts
 *
 * Development harness: runs the football backend against the Firestore
 * EMULATOR with real API-Sports data. It refuses to start without
 * FIRESTORE_EMULATOR_HOST, so it can never write to production, and it
 * replaces FCM and Cloud Tasks with in-memory fakes, so it can never send a
 * push to a real device.
 *
 * Setup (two terminals, from the repo root):
 *   firebase emulators:start --only firestore --project demo-analistas
 *
 *   cd functions && npm run build
 *   export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-analistas
 *   export APISPORTS_KEY=<key>          # in Claude's cloud: any value + NODE_USE_ENV_PROXY=1
 *   node lib/scripts/fb-emulator.js seed            # catalog + fixtures of yesterday/today/tomorrow
 *   node lib/scripts/fb-emulator.js poll            # one live poll (pushes are captured, not sent)
 *   node lib/scripts/fb-emulator.js ondemand '{"kind":"team","id":2287}'
 *   node lib/scripts/fb-emulator.js verify          # end-to-end checks of fbOnDemand
 */

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing to run: FIRESTORE_EMULATOR_HOST is not set (this script is emulator-only).');
  process.exit(1);
}
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-analistas';

import { admin, db } from '../admin-init';

// ── Fakes: nothing leaves the machine except API-Sports reads ────────────────

interface CapturedPush { topic?: string; condition?: string; token?: string; title?: string; body?: string }
const pushes: CapturedPush[] = [];
const fakeMessaging = {
  send: async (m: { topic?: string; condition?: string; token?: string; notification?: { title?: string; body?: string } }) => {
    pushes.push({ topic: m.topic, condition: m.condition, token: m.token, title: m.notification?.title, body: m.notification?.body });
    return 'fake-message-id';
  },
  sendEach: async (list: unknown[]) => ({ responses: list.map(() => ({ success: true })), successCount: list.length, failureCount: 0 }),
};
Object.defineProperty(admin, 'messaging', { value: () => fakeMessaging, configurable: true });

// Cloud Tasks (Modo Estadio delayed pushes): swallow enqueues.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const adminFunctions = require('firebase-admin/functions') as { getFunctions: () => unknown };
const realGetFunctions = adminFunctions.getFunctions;
adminFunctions.getFunctions = () => ({ taskQueue: () => ({ enqueue: async () => undefined }) });
void realGetFunctions;

import { quotaState } from '../football/apisports';
import { handleOnDemand, onDemandReserve } from '../football/on-demand';
import { pollFootballLive } from '../football/poll-live';
import { syncFootballFixtures } from '../football/sync-fixtures';
import { syncFootballCatalog } from '../football/sync-league-data';
import { COL } from '../football/store';
import type {
  FbLeagueFixturesDoc, FbMatchDoc, FbMatchPreviewDoc, FbPlayerDoc, FbSearchDoc, FbStandingsDoc,
  FbTeamDoc, FbTeamFixturesDoc, FbTeamStatsDoc, FbTopPlayersDoc,
} from '../shared/football/model';

function dateUtc(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function seed(): Promise<void> {
  const leagues = await syncFootballCatalog();
  const res = await syncFootballFixtures([dateUtc(-1), dateUtc(0), dateUtc(1)]);
  console.log(`seed: ${leagues} leagues in the catalog, ${res.fixtures} fixtures (${res.written} written)`);
}

async function poll(): Promise<void> {
  await pollFootballLive();
  const live = await db.collection(COL.matches).where('status', '==', 'live').get();
  console.log(`poll: ${live.size} live matches stored, ${pushes.length} pushes captured (not sent)`);
  for (const p of pushes.slice(0, 8)) console.log(`   ${p.topic ?? p.condition ?? p.token} · ${p.title} — ${p.body}`);
}

// ── verify: end-to-end checks of fbOnDemand ──────────────────────────────────

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function calls<T>(fn: () => Promise<T>): Promise<{ out: T; used: number }> {
  const before = quotaState.callsThisInstance;
  const out = await fn();
  return { out, used: quotaState.callsThisInstance - before };
}

async function verify(): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);

  // A league that is in season right now, taken from what the seed stored.
  const rows = (await db.collection(COL.matches).get()).docs.map(d => d.data() as FbMatchDoc);
  check('seeded fixtures exist', rows.length > 0, `${rows.length} rows`);
  if (!rows.length) return;
  const byPop = [...rows].sort((a, b) => b.popularity - a.popularity);
  const finished = byPop.find(r => r.status === 'finished' && r.popularity >= 20) ?? byPop.find(r => r.status === 'finished');
  const upcoming = byPop.find(r => r.status === 'scheduled' && r.statusShort === 'NS' && r.timestamp > nowSec + 3600);
  const sample = finished ?? byPop[0];
  const leagueId = Number(sample.leagueId);
  const season = sample.season;
  const teamId = Number(sample.homeTeam.id);
  console.log(`\nUsing ${sample.league} ${season} · ${sample.homeTeam.name} (team ${teamId})\n`);

  // match detail
  if (finished) {
    const r = await calls(() => handleOnDemand({ kind: 'match', id: finished.id }));
    const d = (r.out.data as { detail: { events: unknown[]; fetchedAt?: number } | null }).detail;
    check('match: detail written', !!d && Array.isArray(d.events), `${d?.events.length ?? 0} events, ${r.used} call(s)`);
    const again = await calls(() => handleOnDemand({ kind: 'match', id: finished.id }));
    // A detail fetched right after the whistle may legitimately be refreshed once more later.
    check('match: second call is served from Firestore', again.used === 0 || finished.timestamp > nowSec - 130 * 60, `${again.used} call(s)`);
  }

  // preview
  if (upcoming) {
    const r = await calls(() => handleOnDemand({ kind: 'matchPreview', id: upcoming.id }));
    const p = r.out.data as FbMatchPreviewDoc;
    check('preview: built', p.matchId === upcoming.id, `h2h ${p.h2h.length}, form ${p.form.home.length}/${p.form.away.length}, prediction ${p.prediction ? 'yes' : 'no'}, venue ${p.venue?.name ?? '—'}, ${r.used} call(s)`);
    check('preview: h2h only lists earlier matches', p.h2h.every(h => h.timestamp < upcoming.timestamp));
    const again = await calls(() => handleOnDemand({ kind: 'matchPreview', id: upcoming.id }));
    check('preview: cached', again.used === 0);
  }

  // team
  const team = await calls(() => handleOnDemand({ kind: 'team', id: teamId }));
  const t = team.out.data as FbTeamDoc;
  check('team: profile', t.id === String(teamId) && !!t.name, `${t.name}, squad ${t.squad.length}, coach ${t.coach?.name ?? '—'}, primary ${t.primaryLeagueName} ${t.season}, ${team.used} call(s)`);
  check('team: cached', (await calls(() => handleOnDemand({ kind: 'team', id: teamId }))).used === 0);

  const tf = await calls(() => handleOnDemand({ kind: 'teamFixtures', id: teamId }));
  const fixtures = (tf.out.data as FbTeamFixturesDoc).fixtures;
  check('teamFixtures: season calendar', fixtures.length > 0, `${fixtures.length} fixtures, ${tf.used} call(s)`);
  check('teamFixtures: chronological', fixtures.every((f, i) => i === 0 || fixtures[i - 1].timestamp <= f.timestamp));

  if (t.primaryLeagueId && t.season) {
    const ts = await calls(() => handleOnDemand({ kind: 'teamStats', id: teamId, leagueId: t.primaryLeagueId, season: t.season }));
    const s = ts.out.data as FbTeamStatsDoc;
    check('teamStats: season numbers', s.played.total > 0, `played ${s.played.total}, GF ${s.goalsFor.total}, form ${s.form.slice(-5)}`);
  }

  // player (first squad member)
  if (t.squad[0]) {
    const pr = await calls(() => handleOnDemand({ kind: 'player', id: t.squad[0].id }));
    const p = pr.out.data as FbPlayerDoc;
    check('player: profile + stats', p.id === t.squad[0].id, `${p.name}, ${p.stats.length} stat rows, club ${p.currentTeam?.name ?? '—'}, ${pr.used} call(s)`);
  }
  if (t.coach) {
    const c = await calls(() => handleOnDemand({ kind: 'coach', id: t.coach!.id }));
    check('coach: profile', !!(c.out.data as { name?: string }).name, `${(c.out.data as { name: string }).name}`);
  }

  // league
  const lf = await calls(() => handleOnDemand({ kind: 'leagueFixtures', id: leagueId, season }));
  const lfd = lf.out.data as FbLeagueFixturesDoc;
  check('leagueFixtures: season calendar', lfd.fixtures.length > 0, `${lfd.fixtures.length} fixtures${lfd.truncated ? ' (truncated)' : ''}, ${lf.used} call(s)`);
  const st = await calls(() => handleOnDemand({ kind: 'standings', id: leagueId, season }));
  const std = st.out.data as FbStandingsDoc;
  check('standings: table', Array.isArray(std.groups), `${std.groups.length} group(s), ${std.groups[0]?.rows.length ?? 0} rows, ${st.used} call(s)`);
  check('standings: cached', (await calls(() => handleOnDemand({ kind: 'standings', id: leagueId, season }))).used === 0);
  const tp = await calls(() => handleOnDemand({ kind: 'topPlayers', id: leagueId, season }));
  check('topPlayers: lists', Array.isArray((tp.out.data as FbTopPlayersDoc).scorers), `${(tp.out.data as FbTopPlayersDoc).scorers.length} scorers`);
  const lg = await calls(() => handleOnDemand({ kind: 'league', id: leagueId }));
  check('league: seasons', ((lg.out.data as { seasons: unknown[] }).seasons?.length ?? 0) > 0);

  // search
  const se = await calls(() => handleOnDemand({ kind: 'search', q: 'Guadalajara' }));
  const sd = se.out.data as FbSearchDoc;
  check('search: teams and players', sd.teams.length > 0, `${sd.teams.length} teams, ${sd.players.length} players, ${se.used} call(s)`);
  check('search: cached (accents and case ignored)', (await calls(() => handleOnDemand({ kind: 'search', q: '  GUADALAJARA ' }))).used === 0);

  // input validation
  for (const bad of [{ kind: 'nope' }, { kind: 'team', id: -1 }, { kind: 'team', id: '12; drop' }, { kind: 'search', q: 'ab' }, { kind: 'standings', id: 262, season: 1800 }]) {
    let code = '';
    try { await handleOnDemand(bad); } catch (e) { code = (e as { code?: string }).code ?? ''; }
    check(`rejects ${JSON.stringify(bad)}`, code === 'invalid-argument', code);
  }

  // quota guard: with the reserve reached, cached docs still answer and new ones are refused
  const quotaRef = db.doc(`${COL.meta}/quota`);
  const savedQuota = (await quotaRef.get()).data();
  quotaState.observedAt = 0; // force the guard to read the shared doc
  await quotaRef.set({ limitDay: 7500, remainingDay: Math.max(0, onDemandReserve(Date.now()) - 1), at: Date.now() });
  const stale = await calls(() => handleOnDemand({ kind: 'team', id: teamId }));
  check('quota guard: cached doc still served', stale.used === 0 && (stale.out.data as FbTeamDoc).id === String(teamId));
  let code = '';
  const refused = await calls(async () => {
    try { await handleOnDemand({ kind: 'team', id: teamId + 1 }); } catch (e) { code = (e as { code?: string }).code ?? ''; }
  });
  check('quota guard: new fetch refused without calling the provider', code === 'resource-exhausted' && refused.used === 0, code);
  if (savedQuota) await quotaRef.set(savedQuota); else await quotaRef.delete();

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} · API calls this run: ${quotaState.callsThisInstance} · remaining today: ${quotaState.remainingDay}`);
  if (failures) process.exitCode = 1;
}

async function main(): Promise<void> {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case 'seed': await seed(); break;
    case 'poll': await poll(); break;
    case 'ondemand': {
      const res = await handleOnDemand(JSON.parse(arg ?? '{}'));
      console.log(JSON.stringify(res, (k, v) => (k === 'updatedAt' ? undefined : v), 2).slice(0, 6000));
      break;
    }
    case 'verify': await verify(); break;
    default:
      console.log('usage: fb-emulator.js seed | poll | ondemand <json> | verify');
  }
}

main().then(() => process.exit(process.exitCode ?? 0), err => { console.error(err); process.exit(1); });
