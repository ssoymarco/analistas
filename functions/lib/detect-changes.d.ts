/**
 * detect-changes.ts
 *
 * Compares current livescores against the previous snapshot in Firestore.
 * Detects goals, match starts, and match endings.
 * Queues FCM notifications for each detected change.
 */
import type { MatchDoc, LivescoresSnapshot, DetectedChange } from './types';
/**
 * Load the previous livescores snapshot from _meta/livescoresSnapshot.
 * Returns an empty snapshot if none exists yet.
 */
export declare function loadSnapshot(): Promise<LivescoresSnapshot['matches']>;
/**
 * Save the current livescores snapshot for next comparison.
 */
export declare function saveSnapshot(matches: MatchDoc[]): Promise<void>;
/**
 * Compare current matches against previous snapshot.
 * Returns a list of detected changes (goals, match starts, match endings).
 */
export declare function detectChanges(currentMatches: MatchDoc[], previousSnapshot: LivescoresSnapshot['matches']): DetectedChange[];
/**
 * Dispatch FCM notifications for detected changes.
 * Uses FCM topics: team_{teamId}_goal, team_{teamId}_matchStart, etc.
 *
 * Phase 2: Full implementation with FCM topic sends.
 * For now: logs changes for monitoring.
 */
export declare function dispatchNotifications(changes: DetectedChange[]): Promise<void>;
