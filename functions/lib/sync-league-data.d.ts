/**
 * sync-league-data.ts
 *
 * Event-driven sync: when pollLivescores detects a goal or match end,
 * immediately refresh standings + topscorers for the affected league
 * instead of waiting for the next hourly cron.
 *
 * Why two separate functions:
 *   • Goals change topscorers but NOT standings (match isn't over yet).
 *   • Match endings change both — points awarded + final goals tallied.
 *
 * Concurrency: callers should dedupe by leagueId and run the syncs in
 * parallel via Promise.allSettled. We don't enforce a global lock — the
 * worst case is two syncs racing on the same Firestore doc, where the
 * later write wins (and both contain the same fresh SportMonks data
 * anyway, so the outcome is identical).
 */
import type { DetectedChange } from './types';
/**
 * Refresh standings for a single league. Silent no-op if the league has
 * no configured seasonId (e.g. friendlies). Errors are caught + logged —
 * we never throw, so a failed sync of one league cannot block others.
 */
export declare function syncLeagueStandings(leagueId: number): Promise<void>;
/**
 * Refresh top scorers for a single league. Same error/skip semantics as
 * syncLeagueStandings.
 */
export declare function syncLeagueTopScorers(leagueId: number): Promise<void>;
/**
 * Inspect a batch of detected changes and fire the appropriate syncs.
 *
 *   matchEnd → refresh standings AND topscorers for that league
 *   goal     → refresh topscorers for that league (standings unchanged)
 *
 * Multiple events for the same league collapse to a single sync per
 * type, even within the same invocation (Set dedup). All syncs run in
 * parallel via Promise.allSettled — one league's failure can't block the
 * rest, and a slow league can't delay the next poll cycle by more than
 * the duration of the slowest sync.
 */
export declare function triggerLeagueSyncForChanges(changes: DetectedChange[]): Promise<void>;
