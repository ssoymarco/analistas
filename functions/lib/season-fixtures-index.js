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
exports.SEASON_FIXTURE_LIGHT_FIELDS = void 0;
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
// FIX: precompute a single compact doc per season holding only the fields the
// fixtures list + bracket need (NO detail / h2h / sidelined). Built server-side
// with the Admin SDK `.select(...)` so we never load the heavy blobs into the
// function either. The client then reads ONE ~26 KB doc instead of 104 heavy
// ones. Same denormalized-read-model pattern as standings/{seasonId}.
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
/**
 * Rebuild season_fixtures/{seasonId} from the matches collection using a
 * light-field projection. Returns the number of fixtures written.
 */
async function rebuildSeasonFixturesIndex(seasonId) {
    const snap = await admin_init_1.db
        .collection('matches')
        .where('seasonId', '==', seasonId)
        .orderBy('startingAtUtc', 'asc')
        .select(...exports.SEASON_FIXTURE_LIGHT_FIELDS)
        .limit(2000)
        .get();
    // Spread data first, then force `id` from the doc id so it always wins.
    const fixtures = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    const payload = {
        seasonId,
        count: fixtures.length,
        fixtures,
        updatedAt: admin_init_1.admin.firestore.Timestamp.now(),
    };
    await admin_init_1.db.collection('season_fixtures').doc(String(seasonId)).set(payload);
    logger.info(`season_fixtures/${seasonId}: rebuilt (${fixtures.length} fixtures)`);
    return fixtures.length;
}
/**
 * Rebuild the index for a set of seasons (deduped). Called after syncFixtures /
 * backfill batch writes. Failures are isolated per season so one bad season
 * doesn't abort the rest.
 */
async function rebuildSeasonFixturesForSeasons(seasonIds) {
    const unique = [...new Set(seasonIds)].filter(n => Number.isFinite(n) && n > 0);
    await Promise.all(unique.map(sid => rebuildSeasonFixturesIndex(sid).catch(err => logger.error(`season_fixtures/${sid} rebuild failed:`, err))));
}
//# sourceMappingURL=season-fixtures-index.js.map