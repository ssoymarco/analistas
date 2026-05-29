/**
 * detect-changes.ts
 *
 * Compares current livescores against the previous snapshot in Firestore.
 * Detects goals (regular/penalty/own), goal cancellations (VAR), match starts,
 * halftime, full time, and red cards. Sends FCM topic pushes for each event.
 *
 * Topic naming convention — must stay aligned with src/services/fcmTopics.ts:
 *   team_{id}_goals    · cards · start · lineups · reminders
 *   league_{id}_start  · finals
 *   player_{id}_goals  · cards
 *
 * Strategy C (hybrid) for goal+scorer:
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
export declare function saveSnapshot(matches: MatchDoc[], fixtures: SMFixture[]): Promise<void>;
export declare function detectChanges(currentMatches: MatchDoc[], previousSnapshot: LivescoresSnapshot['matches'], fixtures: SMFixture[]): DetectedChange[];
/** Send FCM topic pushes for each detected change. */
export declare function dispatchNotifications(changes: DetectedChange[]): Promise<void>;
export { LIVE_STATE_IDS, FINISHED_STATE_IDS };
