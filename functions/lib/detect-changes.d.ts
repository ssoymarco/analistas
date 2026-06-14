/**
 * detect-changes.ts
 *
 * Compares current livescores against the previous snapshot in Firestore.
 * Detects goals (regular/penalty/own), goal cancellations (VAR), match starts,
 * halftime, full time, and red cards. Sends FCM topic pushes for each event.
 *
 * ── Modo Estadio: delay-bucket topic taxonomy ────────────────────────────────
 * Live (retrasable) events fan out to 4 topics per base, one per delay bucket:
 *   team_{id}_goals_d{0|2|5|10}   — goals (both teams' followers)
 *   team_{id}_cards_d{0|2|5|10}   — red cards
 *   team_{id}_live_d{0|2|5|10}    — halftime + matchEnd
 *
 * Pre-match events are always immediate (no bucket suffix):
 *   team_{id}_kickoff              — NEW: replaces _start for matchStart
 *   team_{id}_lineups              — (unchanged)
 *   team_{id}_reminders            — (unchanged)
 *
 * League topics REMOVED: following a league is display-only (spam fix, 2026-06-03).
 * No notifications are dispatched to league_{id}_* topics.
 *
 * DUAL-SEND (migration window): we also send to the legacy topics
 * (team_{id}_goals, team_{id}_start, etc.) so devices on old builds keep
 * receiving notifications. Stop dual-send once adoption of the new build
 * reaches ~90-95% (see rollout plan in docs/MODO_ESTADIO_ARQUITECTURA.md).
 *
 * ── Strategy C (hybrid) for goal+scorer:
 *   - When a score change is detected, we ALSO look at the events array on the
 *     same SMFixture payload for a matching goal event (same minute, same
 *     team). If we find it, the notification includes the scorer name.
 *   - If the scorer event isn't in the payload yet (SportMonks publishes the
 *     score before the event in ~5% of cases), we send the notification
 *     without a name. The client will see the name in-app when it shows up
 *     on the next poll. We do NOT send a second "follow-up" notification —
 *     two pushes for the same goal feels like spam.
 */
import { LIVE_STATE_IDS, FINISHED_STATE_IDS } from './types';
import type { MatchDoc, LivescoresSnapshot, DetectedChange, SMFixture } from './types';
export declare function loadSnapshot(): Promise<LivescoresSnapshot['matches']>;
/** Snapshot the relevant per-match state for next-poll diff detection. */
export declare function saveSnapshot(matches: MatchDoc[], fixtures: SMFixture[], previousSnapshot?: LivescoresSnapshot['matches']): Promise<void>;
export declare function detectChanges(currentMatches: MatchDoc[], previousSnapshot: LivescoresSnapshot['matches'], fixtures: SMFixture[]): DetectedChange[];
/** Send FCM topic pushes for each detected change. */
export declare function dispatchNotifications(changes: DetectedChange[]): Promise<void>;
export { LIVE_STATE_IDS, FINISHED_STATE_IDS };
