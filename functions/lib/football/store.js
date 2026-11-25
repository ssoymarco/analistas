"use strict";
/**
 * football/store.ts
 *
 * Firestore persistence for the football backend: match rows, detail docs,
 * the live-diff snapshot, per-date write fingerprints, the live gate (when the
 * poller should run) and the shared quota reading.
 *
 * Write economy: rows are only written when their visible fingerprint
 * changed — Firestore writes are the main recurring cost of this pipeline.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.COL = void 0;
exports.shortHash = shortHash;
exports.rowHash = rowHash;
exports.commitSets = commitSets;
exports.matchWrite = matchWrite;
exports.detailWrite = detailWrite;
exports.loadLiveSnapshot = loadLiveSnapshot;
exports.saveLiveSnapshot = saveLiveSnapshot;
exports.loadDateFingerprints = loadDateFingerprints;
exports.saveDateFingerprints = saveDateFingerprints;
exports.saveLiveGateDates = saveLiveGateDates;
exports.decodeGate = decodeGate;
exports.loadGateEntries = loadGateEntries;
exports.loadQuota = loadQuota;
exports.saveQuota = saveQuota;
exports.acquireLease = acquireLease;
exports.releaseLease = releaseLease;
exports.markStandingsDirty = markStandingsDirty;
exports.deleteOldFingerprints = deleteOldFingerprints;
const node_crypto_1 = require("node:crypto");
const admin_init_1 = require("../admin-init");
const mapping_1 = require("./mapping");
exports.COL = {
    matches: 'fb_matches',
    details: 'fb_match_details',
    standings: 'fb_standings',
    topscorers: 'fb_topscorers',
    meta: 'fb_meta',
    // On-demand caches (see on-demand.ts)
    previews: 'fb_match_previews',
    teams: 'fb_teams',
    teamFixtures: 'fb_team_fixtures',
    teamStats: 'fb_team_stats',
    players: 'fb_players',
    coaches: 'fb_coaches',
    venues: 'fb_venues',
    leagues: 'fb_leagues',
    leagueFixtures: 'fb_league_fixtures',
    search: 'fb_search',
    legacyPlayers: 'fb_legacy_players',
};
const now = () => admin_init_1.admin.firestore.Timestamp.now();
function shortHash(s) {
    return (0, node_crypto_1.createHash)('md5').update(s).digest('base64url').slice(0, 10);
}
function rowHash(doc) {
    return shortHash((0, mapping_1.matchFingerprint)(doc));
}
// ── Batched writes ───────────────────────────────────────────────────────────
/** Commit set(merge) writes in batches of ≤450 ops. */
async function commitSets(writes) {
    for (let i = 0; i < writes.length; i += 450) {
        const batch = admin_init_1.db.batch();
        for (const w of writes.slice(i, i + 450))
            batch.set(admin_init_1.db.doc(w.path), w.data, { merge: true });
        await batch.commit();
    }
}
function matchWrite(doc) {
    return { path: `${exports.COL.matches}/${doc.id}`, data: { ...doc, updatedAt: now() } };
}
function detailWrite(doc) {
    // set() without merge semantics per field would be ideal for arrays; merge
    // replaces arrays wholesale anyway, which is what we want here.
    return {
        path: `${exports.COL.details}/${doc.matchId}`,
        data: { ...doc, fetchedAt: Date.now(), updatedAt: now() },
    };
}
async function loadLiveSnapshot() {
    const s = await admin_init_1.db.doc(`${exports.COL.meta}/liveSnapshot`).get();
    const d = (s.exists ? s.data() : undefined);
    return { matches: d?.matches ?? {}, fp: d?.fp ?? {}, enrichedAt: d?.enrichedAt ?? {} };
}
async function saveLiveSnapshot(s) {
    await admin_init_1.db.doc(`${exports.COL.meta}/liveSnapshot`).set({ ...s, updatedAt: now() });
}
// ── Fixture fingerprints per date (sync-fixtures) ────────────────────────────
async function loadDateFingerprints(date) {
    const s = await admin_init_1.db.doc(`${exports.COL.meta}/fp_${date}`).get();
    return (s.exists ? s.data()?.fp : undefined) ?? {};
}
async function saveDateFingerprints(date, fp) {
    await admin_init_1.db.doc(`${exports.COL.meta}/fp_${date}`).set({ fp, updatedAt: now() });
}
/**
 * Replace the gate entries of the given dates and drop dates not in
 * `keepDates`. Stored as "ts:pop:id" strings because Firestore arrays can't
 * contain arrays.
 */
async function saveLiveGateDates(entries, keepDates) {
    const ref = admin_init_1.db.doc(`${exports.COL.meta}/liveGate`);
    await admin_init_1.db.runTransaction(async (tx) => {
        const cur = await tx.get(ref);
        const byDate = { ...(cur.data()?.byDate ?? {}) };
        for (const [d, list] of Object.entries(entries))
            byDate[d] = list.map(e => `${e[0]}:${e[1]}:${e[2]}`);
        for (const d of Object.keys(byDate))
            if (!keepDates.includes(d))
                delete byDate[d];
        tx.set(ref, { byDate, updatedAt: now() });
    });
}
function decodeGate(raw) {
    const out = [];
    for (const list of Object.values(raw ?? {})) {
        if (!Array.isArray(list))
            continue;
        for (const s of list) {
            if (typeof s !== 'string')
                continue;
            const [ts, pop, id] = s.split(':').map(Number);
            if (Number.isFinite(ts))
                out.push([ts, pop || 0, id || 0]);
        }
    }
    return out;
}
async function loadGateEntries() {
    const s = await admin_init_1.db.doc(`${exports.COL.meta}/liveGate`).get();
    return decodeGate((s.exists ? s.data()?.byDate : undefined));
}
async function loadQuota() {
    const s = await admin_init_1.db.doc(`${exports.COL.meta}/quota`).get();
    return s.exists ? s.data() : null;
}
async function saveQuota(q) {
    await admin_init_1.db.doc(`${exports.COL.meta}/quota`).set(q);
}
// ── Poll lease (prevents overlapping poller invocations) ────────────────────
async function acquireLease(name, ttlMs) {
    const ref = admin_init_1.db.doc(`${exports.COL.meta}/lease_${name}`);
    const nowMs = Date.now();
    return admin_init_1.db.runTransaction(async (tx) => {
        const cur = await tx.get(ref);
        const until = cur.data()?.until ?? 0;
        if (until > nowMs)
            return false;
        tx.set(ref, { until: nowMs + ttlMs, at: nowMs });
        return true;
    });
}
async function releaseLease(name) {
    await admin_init_1.db.doc(`${exports.COL.meta}/lease_${name}`).set({ until: 0, at: Date.now() });
}
// ── Standings dirty set (league ids whose table must be refreshed) ───────────
async function markStandingsDirty(leagueIds) {
    if (!leagueIds.length)
        return;
    await admin_init_1.db.doc(`${exports.COL.meta}/standingsDirty`).set({ leagues: admin_init_1.admin.firestore.FieldValue.arrayUnion(...leagueIds), updatedAt: now() }, { merge: true });
}
// ── Housekeeping ─────────────────────────────────────────────────────────────
/** Delete per-date fingerprint docs older than `keepDays` (they only matter for the sync window). */
async function deleteOldFingerprints(keepDays = 3, nowMs = Date.now()) {
    const cutoff = new Date(nowMs - keepDays * 86_400_000).toISOString().slice(0, 10);
    const refs = await admin_init_1.db.collection(exports.COL.meta).listDocuments();
    const old = refs.filter(r => r.id.startsWith('fp_') && r.id.slice(3) < cutoff);
    for (let i = 0; i < old.length; i += 400) {
        const batch = admin_init_1.db.batch();
        old.slice(i, i + 400).forEach(r => batch.delete(r));
        await batch.commit();
    }
    return old.length;
}
//# sourceMappingURL=store.js.map