"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_SEASON_FIXTURE_SHARDS = exports.SEASON_FIXTURE_LIGHT_FIELDS = void 0;
exports.firestoreValueBytes = firestoreValueBytes;
exports.shardDocBytes = shardDocBytes;
exports.compactFixture = compactFixture;
exports.shardDocId = shardDocId;
exports.rebuildSeasonFixturesIndex = rebuildSeasonFixturesIndex;
exports.rebuildSeasonFixturesForSeasons = rebuildSeasonFixturesForSeasons;
// ── season_fixtures/{seasonId} — lightweight per-season fixtures index ────────
//
// WHY: matches/{id} docs carry a heavy `detail` blob (events, lineups,
// statistics, h2h, …) written by syncMatchEnrichment / pollLivescores. The
// league-detail screen reads every fixture of a season
// (getFixturesBySeasonFromFirestore: ~104 docs for the World Cup) and the
// CLIENT Firebase SDK cannot project fields — it downloads the FULL docs,
// detail blobs included (several MB), and JSON-parses them on the main thread.
// That was the 3-4s "App Hanging" on the Mundial 2026 landing.
//
// FIX: precompute a compact index per season holding only the fields the
// fixtures list + bracket need (NO detail / h2h / sidelined). Built server-side
// with the Admin SDK `.select(...)` so we never load the heavy blobs into the
// function either. The client then reads ~26 KB instead of 104 heavy docs.
// Same denormalized-read-model pattern as standings/{seasonId}.
//
// SHARDING (2026-08-05): one doc is not always enough. Firestore caps a
// document at 1,048,576 bytes and syncFixtures syncs ALL leagues with no
// filter, so catch-all buckets like SportMonks' "Club Friendlies 3"
// (league 2451, season 26740) accumulate thousands of fixtures across a
// calendar year. That season blew past the limit and every rebuild died with
// `INVALID_ARGUMENT: ... exceeds the maximum allowed size`, leaving the index
// frozen at its last successful write (2026-07-01 — five weeks stale) while
// the failure lived only in the logs. Two fixes, applied together:
//
//   1. Thinner fixtures (compactFixture) — the raw SM `stage` object alone was
//      172 B on EVERY fixture (repeating season_id / league_id / starting_at /
//      … that no consumer reads), null-valued fields were serialized in full,
//      and finished matches still carried a stale `liveClock` anchor.
//   2. Sharding — fixtures are packed into `season_fixtures/{seasonId}` (shard
//      0, which also publishes `shardCount`) plus `season_fixtures/{seasonId}_1`,
//      `_2`, … Shards are chronological, so a client that only reads shard 0
//      still gets a coherent (if truncated) prefix.
//
// Live scores: this index intentionally goes a little stale for in-play
// matches. The client overlays live scores from the small `status == 'live'`
// query on top of the index — see getFixturesBySeasonFromFirestore.
const admin_init_1 = require("./admin-init");
const logger = __importStar(require("firebase-functions/logger"));
/**
 * Fields the client's matchFromDoc() reads. MUST be a superset of everything
 * matchFromDoc touches — omitting a present field would silently break the
 * fixtures list or the cup bracket. Selecting a field that doesn't exist on a
 * given doc is harmless (Firestore just omits it). Deliberately EXCLUDES the
 * heavy fields: detail, detailUpdatedAt, h2h, h2hUpdatedAt, sidelinedHome,
 * sidelinedAway, lineupsSent, updatedAt.
 */
exports.SEASON_FIXTURE_LIGHT_FIELDS = [
    'id',
    'homeTeam', 'awayTeam',
    'homeScore', 'awayScore',
    'homeScoreHT', 'awayScoreHT',
    'homePenScore', 'awayPenScore',
    'status', 'stateId', 'stateLabel', 'minute', 'time',
    'league', 'leagueId', 'leagueLogo',
    'date', 'startingAtUtc', 'seasonId',
    'liveClock',
    'stageId', 'roundId', 'groupId',
    'stage', 'round', 'group',
    'venueId', 'venueName', 'venueCity',
    'details', 'homePlaceholder', 'awayPlaceholder',
];
// ── Size / sharding budget ──────────────────────────────────────────────────
/** Firestore's hard per-document ceiling. Not configurable — see the docs. */
const FIRESTORE_MAX_DOC_BYTES = 1_048_576;
/**
 * Bytes of fixtures we allow per shard. Deliberately well under the hard
 * limit: our size estimate is faithful but not byte-exact, `updatedAt` /
 * `count` / `shardCount` add overhead on top, and a season keeps growing
 * between rebuilds. ~750 KB ≈ 1,100 compacted fixtures per shard.
 */
const SHARD_BUDGET_BYTES = 750_000;
/**
 * Upper bound on shards per season. 8 × 750 KB is far more than any real
 * competition needs; it exists so a runaway season (a bad seasonId mapping,
 * an SM data glitch) can't quietly turn one league into megabytes of client
 * egress. Overflow past this is dropped AND logged — never silently.
 */
exports.MAX_SEASON_FIXTURE_SHARDS = 8;
/**
 * Cap on fixtures read from `matches` per season. Was 2000, which silently
 * truncated season 26740 (2,768 fixtures and counting). Raised with headroom;
 * hitting it is logged as a warning.
 */
const MAX_FIXTURES_PER_SEASON = 6000;
// ── Firestore document size accounting ──────────────────────────────────────
//
// Mirrors https://firebase.google.com/docs/firestore/storage-size so the
// packer splits on the number Firestore will actually enforce, rather than on
// a JSON.stringify() length that under-counts maps and over-counts numbers.
const utf8 = (s) => Buffer.byteLength(s, 'utf8');
/**
 * Byte size Firestore attributes to a single field value.
 *
 * Exported so the packing math can be checked against production data without
 * a write: fed the 2,000 fixtures that produced the 2026-08-05 failure, this
 * reproduces Firestore's reported 1,798,204 bytes exactly.
 */
function firestoreValueBytes(v) {
    if (v === null || v === undefined)
        return 1;
    if (typeof v === 'boolean')
        return 1;
    if (typeof v === 'number')
        return 8;
    if (typeof v === 'string')
        return utf8(v) + 1;
    if (v instanceof Date)
        return 8;
    if (v instanceof admin_init_1.admin.firestore.Timestamp)
        return 8;
    if (Array.isArray(v)) {
        let n = 0;
        for (const item of v)
            n += firestoreValueBytes(item);
        return n;
    }
    if (typeof v === 'object') {
        let n = 0;
        for (const [k, val] of Object.entries(v)) {
            n += utf8(k) + 1 + firestoreValueBytes(val);
        }
        return n;
    }
    return 8;
}
/** Byte size of the document name (`season_fixtures/{docId}`). */
function docNameBytes(docId) {
    return utf8('season_fixtures') + 1 + utf8(docId) + 1 + 16;
}
/** Total size Firestore will bill/enforce for a season_fixtures shard. */
function shardDocBytes(docId, payload) {
    let n = docNameBytes(docId) + 32;
    for (const [k, v] of Object.entries(payload)) {
        n += utf8(k) + 1 + firestoreValueBytes(v);
    }
    return n;
}
// ── Per-fixture compaction ──────────────────────────────────────────────────
/**
 * Keys we keep from the raw SportMonks `stage` / `round` / `group` objects.
 *
 * The rest (sport_id, league_id, season_id, starting_at, ending_at,
 * tie_breaker_rule_id, games_in_current_week, …) is identical on every fixture
 * of a season and read by nobody. Everything listed here IS read:
 *   - stage.name / sort_order / is_current / finished → getCupBracket stage map
 *   - stage.name, round.name, round.sort_order        → useLeagueDetail grouping
 *   - round.stage_id                                  → getCupBracket fallback
 *   - id / type_id                                    → stage identity
 *
 * If a consumer ever needs another key, add it here — a missing key reads as
 * `undefined` client-side, which degrades silently.
 */
const STAGE_KEEP = ['id', 'name', 'sort_order', 'is_current', 'finished', 'type_id'];
const ROUND_KEEP = ['id', 'name', 'sort_order', 'is_current', 'finished', 'stage_id'];
const GROUP_KEEP = ['id', 'name', 'sort_order', 'stage_id'];
function pickKeys(v, keep) {
    if (v === null || typeof v !== 'object' || Array.isArray(v))
        return v;
    const src = v;
    const out = {};
    for (const k of keep) {
        const val = src[k];
        if (val !== undefined && val !== null)
            out[k] = val;
    }
    return out;
}
/**
 * Shrink one fixture to what the client actually consumes.
 *
 * Every transformation here is backward compatible with app builds already in
 * the wild: `matchFromDoc` maps each optional field through `?? undefined`, so
 * an omitted key is indistinguishable from an explicit null.
 *
 * Measured on season 26740: 899 B → 691 B per fixture (−23%).
 */
function compactFixture(raw) {
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
        // Null/undefined round-trips to `undefined` on the client anyway.
        if (v === null || v === undefined)
            continue;
        switch (k) {
            case 'stage':
                out[k] = pickKeys(v, STAGE_KEEP);
                break;
            case 'round':
                out[k] = pickKeys(v, ROUND_KEEP);
                break;
            case 'group':
                out[k] = pickKeys(v, GROUP_KEEP);
                break;
            case 'liveClock':
                // pollLivescores writes the live-clock anchor and never clears it, so
                // finished matches keep a meaningless 46-byte map forever. The client
                // only ticks it while a match is live.
                if (raw.status === 'live')
                    out[k] = v;
                break;
            default: out[k] = v;
        }
    }
    return out;
}
/** Doc id for a shard. Shard 0 keeps the bare `{seasonId}` id, so a reader
 *  that knows nothing about sharding still finds a valid index. */
function shardDocId(seasonId, shardIndex) {
    return shardIndex === 0 ? String(seasonId) : `${seasonId}_${shardIndex}`;
}
// ── Rebuild ─────────────────────────────────────────────────────────────────
/**
 * Rebuild season_fixtures/{seasonId} (+ overflow shards) from the matches
 * collection using a light-field projection.
 *
 * Throws on write failure — the caller is responsible for making that visible
 * (see rebuildSeasonFixturesForSeasons).
 */
async function rebuildSeasonFixturesIndex(seasonId) {
    const snap = await admin_init_1.db
        .collection('matches')
        .where('seasonId', '==', seasonId)
        .orderBy('startingAtUtc', 'asc')
        .select(...exports.SEASON_FIXTURE_LIGHT_FIELDS)
        .limit(MAX_FIXTURES_PER_SEASON)
        .get();
    // Spread data first, then force `id` from the doc id so it always wins.
    const fixtures = snap.docs.map(d => compactFixture({ ...d.data(), id: d.id }));
    const readTruncated = fixtures.length >= MAX_FIXTURES_PER_SEASON;
    // ── Pack fixtures into shards under the byte budget ───────────────────────
    // Chronological order is preserved across shards: shard 0 holds the oldest
    // fixtures, so a reader that only fetches shard 0 gets a coherent prefix
    // rather than an arbitrary slice.
    const shards = [[]];
    let shardBytes = 0;
    let dropped = 0;
    // Fixed cost of the non-fixtures fields on a shard doc (counts, timestamp).
    const SHARD_OVERHEAD_BYTES = 256;
    for (let i = 0; i < fixtures.length; i++) {
        const fixture = fixtures[i];
        const size = firestoreValueBytes(fixture);
        if (size + SHARD_OVERHEAD_BYTES >= FIRESTORE_MAX_DOC_BYTES) {
            // Can't happen with the light-field projection, but a single oversized
            // fixture must not poison the whole season.
            logger.error('season_fixtures: single fixture exceeds the document limit — skipped', {
                marker: 'SEASON_FIXTURES_OVERSIZED_FIXTURE',
                seasonId,
                fixtureId: fixture.id,
                bytes: size,
            });
            dropped++;
            continue;
        }
        if (shardBytes + size > SHARD_BUDGET_BYTES && shards[shards.length - 1].length > 0) {
            if (shards.length >= exports.MAX_SEASON_FIXTURE_SHARDS) {
                dropped += fixtures.length - i;
                break;
            }
            shards.push([]);
            shardBytes = 0;
        }
        shards[shards.length - 1].push(fixture);
        shardBytes += size;
    }
    const total = shards.reduce((n, s) => n + s.length, 0);
    const now = admin_init_1.admin.firestore.Timestamp.now();
    const payloads = shards.map((chunk, i) => {
        const docId = shardDocId(seasonId, i);
        const payload = {
            seasonId,
            count: total,
            shardFixtureCount: chunk.length,
            shardCount: shards.length,
            shardIndex: i,
            fixtures: chunk,
            updatedAt: now,
        };
        return { docId, payload, bytes: shardDocBytes(docId, payload) };
    });
    const oversized = payloads.filter(p => p.bytes >= FIRESTORE_MAX_DOC_BYTES);
    if (oversized.length > 0) {
        // The budget should make this unreachable. If it fires, the size estimate
        // drifted from Firestore's accounting — surface it loudly rather than
        // letting the write fail with a bare INVALID_ARGUMENT.
        throw new Error(`season_fixtures/${seasonId}: shard size estimate exceeded the hard limit ` +
            `(${oversized.map(p => `${p.docId}=${p.bytes}B`).join(', ')}). ` +
            'Lower SHARD_BUDGET_BYTES in season-fixtures-index.ts.');
    }
    // How many shards did the previous rebuild publish? Needed to clean up
    // shards that are no longer used when a season shrinks.
    //
    // Read via a PROJECTED query rather than doc().get(): a plain get would pull
    // the entire ~750 KB shard back on every rebuild, for every season, every
    // 5 minutes — the exact egress mistake this index exists to avoid.
    const prevShardCount = await admin_init_1.db
        .collection('season_fixtures')
        .where(admin_init_1.admin.firestore.FieldPath.documentId(), '==', String(seasonId))
        .select('shardCount')
        .get()
        .then(s => (s.empty ? 0 : Number(s.docs[0].get('shardCount')) || 1))
        .catch(() => 0);
    // Write overflow shards FIRST, shard 0 LAST: shard 0 is what publishes
    // `shardCount`, so a reader never learns about a shard that isn't there yet.
    await Promise.all(payloads.slice(1).map(p => admin_init_1.db.collection('season_fixtures').doc(p.docId).set(p.payload)));
    await admin_init_1.db.collection('season_fixtures').doc(payloads[0].docId).set(payloads[0].payload);
    // Drop shards left over from a larger previous build.
    if (prevShardCount > shards.length) {
        await Promise.all(Array.from({ length: prevShardCount - shards.length }, (_, i) => admin_init_1.db.collection('season_fixtures').doc(shardDocId(seasonId, shards.length + i)).delete()));
    }
    const stats = {
        seasonId,
        count: total,
        fetched: fixtures.length,
        shardCount: shards.length,
        bytes: payloads.reduce((n, p) => n + p.bytes, 0),
        maxShardBytes: Math.max(...payloads.map(p => p.bytes)),
        dropped,
        readTruncated,
    };
    // Always log the size — the whole point of this rewrite is that "how big is
    // this index?" was invisible until a write failed.
    logger.info(`season_fixtures/${seasonId}: rebuilt (${total} fixtures, ${stats.shardCount} shard(s), ` +
        `${Math.round(stats.bytes / 1024)} KB, max shard ${Math.round(stats.maxShardBytes / 1024)} KB)`, { marker: 'SEASON_FIXTURES_REBUILT', ...stats });
    if (dropped > 0) {
        logger.error(`season_fixtures/${seasonId}: DROPPED ${dropped} fixtures — season exceeds ` +
            `${exports.MAX_SEASON_FIXTURE_SHARDS} shards. The league calendar is incomplete.`, { marker: 'SEASON_FIXTURES_TRUNCATED', ...stats });
    }
    if (readTruncated) {
        logger.warn(`season_fixtures/${seasonId}: read hit the ${MAX_FIXTURES_PER_SEASON}-fixture cap — ` +
            'there may be more fixtures in this season than are indexed.', { marker: 'SEASON_FIXTURES_READ_CAPPED', ...stats });
    }
    return stats;
}
// ── Health doc ──────────────────────────────────────────────────────────────
const HEALTH_DOC = '_meta/seasonFixturesHealth';
/**
 * Publish which seasons are currently failing to `_meta/seasonFixturesHealth`.
 *
 * Cloud Functions logs are the only place a non-fatal rebuild failure used to
 * appear, and nobody reads logs until something visibly breaks — season 26740
 * served a five-week-stale calendar without a single alert. This doc makes the
 * state queryable (and dashboard-able) from outside the log viewer.
 *
 * Written only when the failing set CHANGES, so the steady state costs one
 * small read per run and zero writes.
 */
async function publishRebuildHealth(failures, attempted) {
    const ref = admin_init_1.db.doc(HEALTH_DOC);
    const failingIds = failures.map(f => f.seasonId).sort((a, b) => a - b);
    const prev = await ref.get().catch(() => null);
    const prevIds = prev?.exists ? (prev.data()?.failingSeasonIds ?? []) : [];
    const unchanged = prevIds.length === failingIds.length &&
        prevIds.every((id, i) => id === failingIds[i]);
    if (unchanged)
        return;
    await ref.set({
        failingSeasonIds: failingIds,
        failures: failures.map(f => ({ seasonId: f.seasonId, message: f.message })),
        attempted,
        updatedAt: admin_init_1.admin.firestore.Timestamp.now(),
    }, { merge: false }).catch(err => logger.error('season_fixtures: failed to publish health doc', { error: String(err) }));
}
/**
 * Rebuild the index for a set of seasons (deduped). Called after syncFixtures /
 * backfill batch writes. Failures are isolated per season so one bad season
 * doesn't abort the rest — but they are NOT swallowed: each one is logged at
 * error level with the seasonId, the fixture count and the measured byte size,
 * and the failing set is mirrored to `_meta/seasonFixturesHealth`.
 */
async function rebuildSeasonFixturesForSeasons(seasonIds) {
    const unique = [...new Set(seasonIds)].filter(n => Number.isFinite(n) && n > 0);
    const failures = [];
    await Promise.all(unique.map(sid => rebuildSeasonFixturesIndex(sid).catch(async (err) => {
        const message = err instanceof Error ? err.message : String(err);
        // Measure the season so the log says WHY it failed, not just THAT it
        // did. A count-only aggregation is cheap even for a 3k-fixture season.
        const count = await admin_init_1.db
            .collection('matches')
            .where('seasonId', '==', sid)
            .count()
            .get()
            .then(s => s.data().count)
            .catch(() => -1);
        logger.error(`season_fixtures/${sid} rebuild FAILED (${count} fixtures in matches): ${message}`, {
            marker: 'SEASON_FIXTURES_REBUILD_FAILED',
            seasonId: sid,
            fixtureCount: count,
            error: message,
            stack: err instanceof Error ? err.stack : undefined,
        });
        failures.push({ seasonId: sid, message });
    })));
    await publishRebuildHealth(failures, unique.length).catch(err => logger.error('season_fixtures: health publish threw', { error: String(err) }));
}
//# sourceMappingURL=season-fixtures-index.js.map