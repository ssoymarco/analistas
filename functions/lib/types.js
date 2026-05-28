"use strict";
/**
 * types.ts
 *
 * Firestore document interfaces + SportMonks response types for Cloud Functions.
 * These mirror the client-side types but are optimized for server-side storage.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SM_EVENT_TYPES = exports.STANDING_DETAIL_TYPES = exports.DEAD_STATE_IDS = exports.FINISHED_STATE_IDS = exports.LIVE_STATE_IDS = exports.SM_STATE_IDS = void 0;
// ── SM State & Event Constants ──────────────────────────────────────────────
/**
 * SportMonks v3 Football API state IDs.
 *
 * Verified 2026-05-28 against docs.sportmonks.com/v3/tutorials-and-guides/
 * tutorials/includes/states — the OFFICIAL state developer_name table.
 *
 * ⚠️ HISTORICAL NOTE — the previous map was scrambled (BREAK=8, SECOND_HALF=4,
 * FINISHED_PENALTIES=10, etc.) which caused a critical production bug: live
 * 2nd-half matches were misclassified as `scheduled` because SportMonks
 * reports `state_id: 22` for INPLAY_2ND_HALF, but our LIVE_STATE_IDS set only
 * had {2, 3, 4, 6, 7, 8}. Every match silently reverted to the "Previa"
 * screen ~2-3 min into the second half (when SM finalized the transition).
 * Source of the wrong map: appears to have come from an unrelated reference,
 * not SportMonks docs.
 */
exports.SM_STATE_IDS = {
    // ── Pre-match ──────────────────────────────────────────────────────────
    NOT_STARTED: 1,
    // ── Live, regulation ───────────────────────────────────────────────────
    FIRST_HALF: 2, // INPLAY_1ST_HALF
    HALF_TIME: 3, // HT
    SECOND_HALF: 22, // INPLAY_2ND_HALF — was wrongly 4
    // ── Live, beyond regulation ────────────────────────────────────────────
    ET_BREAK: 4, // BREAK: regulation over, awaiting ET start (was wrongly 8)
    EXTRA_TIME: 6, // INPLAY_ET
    EXTRA_TIME_BREAK: 21, // Between ET halves
    PENALTIES: 9, // INPLAY_PENALTIES — was wrongly 7
    PEN_BREAK: 25, // Between penalty rounds — was wrongly TBD
    // ── Finished ───────────────────────────────────────────────────────────
    FULL_TIME: 5, // FT
    FINISHED_AET: 7, // AET — was wrongly 9
    FINISHED_PENALTIES: 8, // FT_PEN — was wrongly 10
    AWARDED: 17, // Winner decided administratively (was wrongly ABANDONED)
    // ── Dead / not-played ──────────────────────────────────────────────────
    POSTPONED: 10, // was wrongly 13
    SUSPENDED: 11, // will continue later (was wrongly 15)
    CANCELLED: 12, // was wrongly 14
    TBA: 13, // To Be Announced (was wrongly TBD=25)
    WALK_OVER: 14, // WO
    ABANDONED: 15, // was wrongly 17
    DELAYED: 16, // kick-off pushed (new)
    INTERRUPTED: 18, // was wrongly 16
    AWAITING_UPDATES: 19, // SM has no recent data (new)
    DELETED: 20, // was wrongly 22
    PENDING: 26, // awaiting data/verification (new)
    // ── Aliases kept for backwards-compatible imports ──────────────────────
    /** @deprecated use SECOND_HALF — kept as alias so existing imports compile. */
    BREAK: 4,
    /** @deprecated use FINISHED_PENALTIES — kept as alias. */
    FINISHED_PEN: 8,
    /** @deprecated use TBA — kept as alias. */
    TBD: 13,
};
/** State IDs where the match is actively being played — UI shows live tab. */
exports.LIVE_STATE_IDS = new Set([
    exports.SM_STATE_IDS.FIRST_HALF, // 2
    exports.SM_STATE_IDS.HALF_TIME, // 3
    exports.SM_STATE_IDS.SECOND_HALF, // 22 ← the fix
    exports.SM_STATE_IDS.ET_BREAK, // 4
    exports.SM_STATE_IDS.EXTRA_TIME, // 6
    exports.SM_STATE_IDS.EXTRA_TIME_BREAK, // 21
    exports.SM_STATE_IDS.PENALTIES, // 9
    exports.SM_STATE_IDS.PEN_BREAK, // 25
]);
/** State IDs where the match has concluded normally — UI shows summary tab. */
exports.FINISHED_STATE_IDS = new Set([
    exports.SM_STATE_IDS.FULL_TIME, // 5
    exports.SM_STATE_IDS.FINISHED_AET, // 7
    exports.SM_STATE_IDS.FINISHED_PENALTIES, // 8
    exports.SM_STATE_IDS.AWARDED, // 17
]);
/** State IDs where the match will NOT proceed normally — never infer "live"
 *  from time even if kickoff was hours ago. Keeps the time-based fallback in
 *  `getMatchStatus` from second-guessing a definitive "won't happen" signal. */
exports.DEAD_STATE_IDS = new Set([
    exports.SM_STATE_IDS.POSTPONED, // 10
    exports.SM_STATE_IDS.SUSPENDED, // 11
    exports.SM_STATE_IDS.CANCELLED, // 12
    exports.SM_STATE_IDS.WALK_OVER, // 14
    exports.SM_STATE_IDS.ABANDONED, // 15
    exports.SM_STATE_IDS.DELAYED, // 16
    exports.SM_STATE_IDS.INTERRUPTED, // 18
    exports.SM_STATE_IDS.DELETED, // 20
]);
/** Standing detail type_id → meaning */
exports.STANDING_DETAIL_TYPES = {
    GP: 129, // Games Played
    W: 130, // Won
    D: 131, // Drawn
    L: 132, // Lost
    GF: 133, // Goals For
    GA: 134, // Goals Against
    GD: 179, // Goal Difference
};
/** SportMonks event type_id → semantic meaning. Mirrors the client-side
 *  SM_EVENT_TYPES in src/services/sportmonks.ts — keep both in sync. */
exports.SM_EVENT_TYPES = {
    GOAL: 14,
    PENALTY_GOAL: 15,
    OWN_GOAL: 16,
    PENALTY_MISS: 17,
    SUBSTITUTION: 18,
    YELLOW_CARD: 19,
    SECOND_YELLOW: 20,
    RED_CARD: 21,
    VAR: 24,
};
//# sourceMappingURL=types.js.map