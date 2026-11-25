/**
 * football/store.ts
 *
 * Firestore persistence for the football backend: match rows, detail docs,
 * the live-diff snapshot, per-date write fingerprints, the live gate (when the
 * poller should run) and the shared quota reading.
 *
 * Write economy: rows are only written when their visible fingerprint
 * changed — Firestore writes are the main recurring cost of this pipeline.
 */
import type { FbMatchDetailDoc, FbMatchDoc } from '../shared/football/model';
import type { Snapshot } from './live-detect';
export declare const COL: {
    readonly matches: "fb_matches";
    readonly details: "fb_match_details";
    readonly standings: "fb_standings";
    readonly topscorers: "fb_topscorers";
    readonly meta: "fb_meta";
    readonly previews: "fb_match_previews";
    readonly teams: "fb_teams";
    readonly teamFixtures: "fb_team_fixtures";
    readonly teamStats: "fb_team_stats";
    readonly players: "fb_players";
    readonly coaches: "fb_coaches";
    readonly venues: "fb_venues";
    readonly leagues: "fb_leagues";
    readonly leagueFixtures: "fb_league_fixtures";
    readonly search: "fb_search";
    readonly legacyPlayers: "fb_legacy_players";
};
export declare function shortHash(s: string): string;
export declare function rowHash(doc: Partial<FbMatchDoc>): string;
/** Commit set(merge) writes in batches of ≤450 ops. */
export declare function commitSets(writes: Array<{
    path: string;
    data: Record<string, unknown>;
}>): Promise<void>;
export declare function matchWrite(doc: Partial<FbMatchDoc> & {
    id: string;
}): {
    path: string;
    data: Record<string, unknown>;
};
export declare function detailWrite(doc: FbMatchDetailDoc): {
    path: string;
    data: Record<string, unknown>;
};
export interface StoredSnapshot {
    matches: Snapshot;
    /** Row fingerprints written by the poller (id → hash) to skip no-op writes. */
    fp: Record<string, string>;
    /** Last detail enrichment per match (id → unix seconds). */
    enrichedAt: Record<string, number>;
}
export declare function loadLiveSnapshot(): Promise<StoredSnapshot>;
export declare function saveLiveSnapshot(s: StoredSnapshot): Promise<void>;
export declare function loadDateFingerprints(date: string): Promise<Record<string, string>>;
export declare function saveDateFingerprints(date: string, fp: Record<string, string>): Promise<void>;
/** [kickoff unix seconds, league popularity, fixture id] for unfinished fixtures. */
export type GateEntry = [number, number, number];
/**
 * Replace the gate entries of the given dates and drop dates not in
 * `keepDates`. Stored as "ts:pop:id" strings because Firestore arrays can't
 * contain arrays.
 */
export declare function saveLiveGateDates(entries: Record<string, GateEntry[]>, keepDates: string[]): Promise<void>;
export declare function decodeGate(raw: Record<string, unknown> | undefined): GateEntry[];
export declare function loadGateEntries(): Promise<GateEntry[]>;
export interface QuotaDoc {
    limitDay: number;
    remainingDay: number;
    /** Unix ms of the reading. */
    at: number;
}
export declare function loadQuota(): Promise<QuotaDoc | null>;
export declare function saveQuota(q: QuotaDoc): Promise<void>;
export declare function acquireLease(name: string, ttlMs: number): Promise<boolean>;
export declare function releaseLease(name: string): Promise<void>;
export declare function markStandingsDirty(leagueIds: string[]): Promise<void>;
/** Delete per-date fingerprint docs older than `keepDays` (they only matter for the sync window). */
export declare function deleteOldFingerprints(keepDays?: number, nowMs?: number): Promise<number>;
