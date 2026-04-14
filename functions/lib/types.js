"use strict";
/**
 * types.ts
 *
 * Firestore document interfaces + SportMonks response types for Cloud Functions.
 * These mirror the client-side types but are optimized for server-side storage.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.STANDING_DETAIL_TYPES = exports.FINISHED_STATE_IDS = exports.LIVE_STATE_IDS = exports.SM_STATE_IDS = void 0;
// ── SM State & Event Constants ──────────────────────────────────────────────
exports.SM_STATE_IDS = {
    NOT_STARTED: 1,
    FIRST_HALF: 2,
    HALF_TIME: 3,
    SECOND_HALF: 4,
    FULL_TIME: 5,
    EXTRA_TIME: 6,
    PENALTIES: 7,
    BREAK: 8,
    FINISHED_AET: 9,
    FINISHED_PENALTIES: 10,
    POSTPONED: 13,
    CANCELLED: 14,
    SUSPENDED: 15,
    INTERRUPTED: 16,
    ABANDONED: 17,
    DELETED: 22,
    TBD: 25,
};
exports.LIVE_STATE_IDS = new Set([
    exports.SM_STATE_IDS.FIRST_HALF,
    exports.SM_STATE_IDS.HALF_TIME,
    exports.SM_STATE_IDS.SECOND_HALF,
    exports.SM_STATE_IDS.EXTRA_TIME,
    exports.SM_STATE_IDS.PENALTIES,
    exports.SM_STATE_IDS.BREAK,
]);
exports.FINISHED_STATE_IDS = new Set([
    exports.SM_STATE_IDS.FULL_TIME,
    exports.SM_STATE_IDS.FINISHED_AET,
    exports.SM_STATE_IDS.FINISHED_PENALTIES,
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
//# sourceMappingURL=types.js.map