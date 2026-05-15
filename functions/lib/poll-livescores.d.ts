/**
 * poll-livescores.ts
 *
 * Cloud Function: polls SportMonks livescores every 15 seconds.
 * Scheduled to run every 1 minute, executes 4 internal polls with 15s delays.
 *
 * Flow per poll:
 * 1. Fetch all live matches from SportMonks (1 API call)
 * 2. Transform to MatchDoc format
 * 3. Compare against previous snapshot for change detection (goals, starts, ends)
 * 4. Batch write changed matches to Firestore
 * 5. Save new snapshot for next comparison
 * 6. Dispatch notifications for detected changes
 */
/**
 * Main polling function — runs 4 polls with 15-second intervals.
 * Called by the scheduled Cloud Function every 1 minute.
 */
export declare function pollLivescoresHandler(): Promise<void>;
