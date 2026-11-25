"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('Refusing to run: FIRESTORE_EMULATOR_HOST is not set (this script is emulator-only).');
    process.exit(1);
}
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-analistas';
const admin_init_1 = require("../admin-init");
const pushes = [];
const fakeMessaging = {
    send: async (m) => {
        pushes.push({ topic: m.topic, condition: m.condition, token: m.token, title: m.notification?.title, body: m.notification?.body });
        return 'fake-message-id';
    },
    sendEach: async (list) => ({ responses: list.map(() => ({ success: true })), successCount: list.length, failureCount: 0 }),
};
Object.defineProperty(admin_init_1.admin, 'messaging', { value: () => fakeMessaging, configurable: true });
// Cloud Tasks (Modo Estadio delayed pushes): swallow enqueues.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const adminFunctions = require('firebase-admin/functions');
const realGetFunctions = adminFunctions.getFunctions;
adminFunctions.getFunctions = () => ({ taskQueue: () => ({ enqueue: async () => undefined }) });
void realGetFunctions;
const apisports_1 = require("../football/apisports");
const on_demand_1 = require("../football/on-demand");
const poll_live_1 = require("../football/poll-live");
const sync_fixtures_1 = require("../football/sync-fixtures");
const sync_league_data_1 = require("../football/sync-league-data");
const store_1 = require("../football/store");
function dateUtc(offsetDays) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
}
async function seed() {
    const leagues = await (0, sync_league_data_1.syncFootballCatalog)();
    const res = await (0, sync_fixtures_1.syncFootballFixtures)([dateUtc(-1), dateUtc(0), dateUtc(1)]);
    console.log(`seed: ${leagues} leagues in the catalog, ${res.fixtures} fixtures (${res.written} written)`);
}
async function poll() {
    await (0, poll_live_1.pollFootballLive)();
    const live = await admin_init_1.db.collection(store_1.COL.matches).where('status', '==', 'live').get();
    console.log(`poll: ${live.size} live matches stored, ${pushes.length} pushes captured (not sent)`);
    for (const p of pushes.slice(0, 8))
        console.log(`   ${p.topic ?? p.condition ?? p.token} · ${p.title} — ${p.body}`);
}
// ── verify: end-to-end checks of fbOnDemand ──────────────────────────────────
let failures = 0;
function check(name, ok, detail = '') {
    if (!ok)
        failures++;
    console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
}
async function calls(fn) {
    const before = apisports_1.quotaState.callsThisInstance;
    const out = await fn();
    return { out, used: apisports_1.quotaState.callsThisInstance - before };
}
async function verify() {
    const nowSec = Math.floor(Date.now() / 1000);
    // A league that is in season right now, taken from what the seed stored.
    const rows = (await admin_init_1.db.collection(store_1.COL.matches).get()).docs.map(d => d.data());
    check('seeded fixtures exist', rows.length > 0, `${rows.length} rows`);
    if (!rows.length)
        return;
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
        const r = await calls(() => (0, on_demand_1.handleOnDemand)({ kind: 'match', id: finished.id }));
        const d = r.out.data.detail;
        check('match: detail written', !!d && Array.isArray(d.events), `${d?.events.length ?? 0} events, ${r.used} call(s)`);
        const again = await calls(() => (0, on_demand_1.handleOnDemand)({ kind: 'match', id: finished.id }));
        // A detail fetched right after the whistle may legitimately be refreshed once more later.
        check('match: second call is served from Firestore', again.used === 0 || finished.timestamp > nowSec - 130 * 60, `${again.used} call(s)`);
    }
    // preview
    if (upcoming) {
        const r = await calls(() => (0, on_demand_1.handleOnDemand)({ kind: 'matchPreview', id: upcoming.id }));
        const p = r.out.data;
        check('preview: built', p.matchId === upcoming.id, `h2h ${p.h2h.length}, form ${p.form.home.length}/${p.form.away.length}, prediction ${p.prediction ? 'yes' : 'no'}, venue ${p.venue?.name ?? '—'}, ${r.used} call(s)`);
        check('preview: h2h only lists earlier matches', p.h2h.every(h => h.timestamp < upcoming.timestamp));
        const again = await calls(() => (0, on_demand_1.handleOnDemand)({ kind: 'matchPreview', id: upcoming.id }));
        check('preview: cached', again.used === 0);
    }
    // team
    const team = await calls(() => (0, on_demand_1.handleOnDemand)({ kind: 'team', id: teamId }));
    const t = team.out.data;
    check('team: profile', t.id === String(teamId) && !!t.name, `${t.name}, squad ${t.squad.length}, coach ${t.coach?.name ?? '—'}, primary ${t.primaryLeagueName} ${t.season}, ${team.used} call(s)`);
    check('team: cached', (await calls(() => (0, on_demand_1.handleOnDemand)({ kind: 'team', id: teamId }))).used === 0);
    const tf = await calls(() => (0, on_demand_1.handleOnDemand)({ kind: 'teamFixtures', id: teamId }));
    const fixtures = tf.out.data.fixtures;
    check('teamFixtures: season calendar', fixtures.length > 0, `${fixtures.length} fixtures, ${tf.used} call(s)`);
    check('teamFixtures: chronological', fixtures.every((f, i) => i === 0 || fixtures[i - 1].timestamp <= f.timestamp));
    if (t.primaryLeagueId && t.season) {
        const ts = await calls(() => (0, on_demand_1.handleOnDemand)({ kind: 'teamStats', id: teamId, leagueId: t.primaryLeagueId, season: t.season }));
        const s = ts.out.data;
        check('teamStats: season numbers', s.played.total > 0, `played ${s.played.total}, GF ${s.goalsFor.total}, form ${s.form.slice(-5)}`);
    }
    // player (first squad member)
    if (t.squad[0]) {
        const pr = await calls(() => (0, on_demand_1.handleOnDemand)({ kind: 'player', id: t.squad[0].id }));
        const p = pr.out.data;
        check('player: profile + stats', p.id === t.squad[0].id, `${p.name}, ${p.stats.length} stat rows, club ${p.currentTeam?.name ?? '—'}, ${pr.used} call(s)`);
    }
    if (t.coach) {
        const c = await calls(() => (0, on_demand_1.handleOnDemand)({ kind: 'coach', id: t.coach.id }));
        check('coach: profile', !!c.out.data.name, `${c.out.data.name}`);
    }
    // league
    const lf = await calls(() => (0, on_demand_1.handleOnDemand)({ kind: 'leagueFixtures', id: leagueId, season }));
    const lfd = lf.out.data;
    check('leagueFixtures: season calendar', lfd.fixtures.length > 0, `${lfd.fixtures.length} fixtures${lfd.truncated ? ' (truncated)' : ''}, ${lf.used} call(s)`);
    const st = await calls(() => (0, on_demand_1.handleOnDemand)({ kind: 'standings', id: leagueId, season }));
    const std = st.out.data;
    check('standings: table', Array.isArray(std.groups), `${std.groups.length} group(s), ${std.groups[0]?.rows.length ?? 0} rows, ${st.used} call(s)`);
    check('standings: cached', (await calls(() => (0, on_demand_1.handleOnDemand)({ kind: 'standings', id: leagueId, season }))).used === 0);
    const tp = await calls(() => (0, on_demand_1.handleOnDemand)({ kind: 'topPlayers', id: leagueId, season }));
    check('topPlayers: lists', Array.isArray(tp.out.data.scorers), `${tp.out.data.scorers.length} scorers`);
    const lg = await calls(() => (0, on_demand_1.handleOnDemand)({ kind: 'league', id: leagueId }));
    check('league: seasons', (lg.out.data.seasons?.length ?? 0) > 0);
    // search
    const se = await calls(() => (0, on_demand_1.handleOnDemand)({ kind: 'search', q: 'Guadalajara' }));
    const sd = se.out.data;
    check('search: teams and players', sd.teams.length > 0, `${sd.teams.length} teams, ${sd.players.length} players, ${se.used} call(s)`);
    check('search: cached (accents and case ignored)', (await calls(() => (0, on_demand_1.handleOnDemand)({ kind: 'search', q: '  GUADALAJARA ' }))).used === 0);
    // input validation
    for (const bad of [{ kind: 'nope' }, { kind: 'team', id: -1 }, { kind: 'team', id: '12; drop' }, { kind: 'search', q: 'ab' }, { kind: 'standings', id: 262, season: 1800 }]) {
        let code = '';
        try {
            await (0, on_demand_1.handleOnDemand)(bad);
        }
        catch (e) {
            code = e.code ?? '';
        }
        check(`rejects ${JSON.stringify(bad)}`, code === 'invalid-argument', code);
    }
    // quota guard: with the reserve reached, cached docs still answer and new ones are refused
    const quotaRef = admin_init_1.db.doc(`${store_1.COL.meta}/quota`);
    const savedQuota = (await quotaRef.get()).data();
    apisports_1.quotaState.observedAt = 0; // force the guard to read the shared doc
    await quotaRef.set({ limitDay: 7500, remainingDay: Math.max(0, (0, on_demand_1.onDemandReserve)(Date.now()) - 1), at: Date.now() });
    const stale = await calls(() => (0, on_demand_1.handleOnDemand)({ kind: 'team', id: teamId }));
    check('quota guard: cached doc still served', stale.used === 0 && stale.out.data.id === String(teamId));
    let code = '';
    const refused = await calls(async () => {
        try {
            await (0, on_demand_1.handleOnDemand)({ kind: 'team', id: teamId + 1 });
        }
        catch (e) {
            code = e.code ?? '';
        }
    });
    check('quota guard: new fetch refused without calling the provider', code === 'resource-exhausted' && refused.used === 0, code);
    if (savedQuota)
        await quotaRef.set(savedQuota);
    else
        await quotaRef.delete();
    console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} · API calls this run: ${apisports_1.quotaState.callsThisInstance} · remaining today: ${apisports_1.quotaState.remainingDay}`);
    if (failures)
        process.exitCode = 1;
}
async function main() {
    const [cmd, arg] = process.argv.slice(2);
    switch (cmd) {
        case 'seed':
            await seed();
            break;
        case 'poll':
            await poll();
            break;
        case 'ondemand': {
            const res = await (0, on_demand_1.handleOnDemand)(JSON.parse(arg ?? '{}'));
            console.log(JSON.stringify(res, (k, v) => (k === 'updatedAt' ? undefined : v), 2).slice(0, 6000));
            break;
        }
        case 'verify':
            await verify();
            break;
        default:
            console.log('usage: fb-emulator.js seed | poll | ondemand <json> | verify');
    }
}
main().then(() => process.exit(process.exitCode ?? 0), err => { console.error(err); process.exit(1); });
//# sourceMappingURL=fb-emulator.js.map