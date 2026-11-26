"use strict";
/**
 * shared/football/estadio.ts
 *
 * Modo Estadio per match — the contract between the app and the `fbEstadio`
 * callable (see functions/src/football/estadio.ts). Shared verbatim by both.
 *
 * The user turns the mode on for ONE match. The server takes the device out
 * of that match's regular pushes (it subscribes its token to the match's mute
 * topic) and from then on delivers every push of the match to the token
 * itself, `delayMin` minutes late. It ends on its own when the match does.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ESTADIO_ACTION_OFF = exports.ESTADIO_ACTION_SPOILED = exports.ESTADIO_ACTION_ON = exports.ESTADIO_PUSH_CATEGORY = exports.ESTADIO_RIVAL_EVENTS = exports.ESTADIO_CLASSES = exports.ESTADIO_MAX_DELAY = exports.ESTADIO_BUMP_MIN = exports.ESTADIO_DEFAULT_DELAY = exports.ESTADIO_DELAYS = void 0;
exports.bumpedDelay = bumpedDelay;
/** Delays the app offers (minutes): cable / antenna, streaming. */
exports.ESTADIO_DELAYS = [3, 5];
exports.ESTADIO_DEFAULT_DELAY = 3;
/** "Me spoileó" adds this much… */
exports.ESTADIO_BUMP_MIN = 3;
/** …up to this ceiling. */
exports.ESTADIO_MAX_DELAY = 10;
/** What a device may want from a match — one per notification toggle. */
exports.ESTADIO_CLASSES = [
    'goals', 'cards', 'yellow', 'subs', 'live', 'kickoff', 'lineups', 'reminders',
];
exports.ESTADIO_RIVAL_EVENTS = ['loss', 'bigLoss', 'redCard', 'penMiss'];
/**
 * iOS notification category of the pushes a session delivers, and the ids of
 * the long-press buttons. The app registers them (services/notifications.ts);
 * regular match pushes keep the `MATCH_EVENT` category.
 */
exports.ESTADIO_PUSH_CATEGORY = 'MATCH_ESTADIO';
exports.ESTADIO_ACTION_ON = 'ESTADIO_ON';
exports.ESTADIO_ACTION_SPOILED = 'ESTADIO_SPOILED';
exports.ESTADIO_ACTION_OFF = 'ESTADIO_OFF';
/** Next delay after a "me spoileó". */
function bumpedDelay(delayMin) {
    return Math.min(exports.ESTADIO_MAX_DELAY, delayMin + exports.ESTADIO_BUMP_MIN);
}
//# sourceMappingURL=estadio.js.map