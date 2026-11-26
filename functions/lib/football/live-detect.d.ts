/**
 * football/live-detect.ts
 *
 * Change detection for API-Sports live fixtures. Pure: takes the previous
 * per-match snapshot + current fixtures, returns detected changes and the next
 * snapshot. Same event vocabulary and product rules as the Sportmonks-era
 * detector (detect-changes.ts on the feature/live-activities branch), so
 * notification copy, Modo Estadio, Modo Rival, player follows and the per-match
 * mute behave identically.
 *
 * API-Sports specifics handled here:
 *   - Finished matches DROP OUT of `/fixtures?live=all`. The poller re-fetches
 *     snapshot matches missing from the feed via `/fixtures?ids=` and passes
 *     them in, so the FT transition is still observed.
 *   - Events have no ids. Scorer/card/sub details come from counting events
 *     per side (count-based diffing is naturally idempotent) and reading the
 *     newest matching event.
 *   - Own goals: API-Sports credits the event to the team that BENEFITS, so
 *     "latest goal event of the scoring side" also finds own goals.
 *   - A revoked red card / disallowed goal is REMOVED from the feed: counts go
 *     down. Red-card cancellations are confirmed over consecutive polls before
 *     notifying (a feed hiccup must not invent a correction).
 */
import type { FbTeamRef } from '../shared/football/model';
import type { AfEvent, AfFixtureCore } from './apisports-types';
/** Consecutive polls a red-card count drop must hold before "roja anulada"
 *  is sent. Polls are ≥15 s apart, so 2 polls ≈ 30-120 s — negligible next
 *  to a VAR review, enough to ride out a feed reordering. */
export declare const RED_CANCEL_CONFIRM_POLLS = 2;
export type FbChangeType = 'goal' | 'goalCancelled' | 'matchStart' | 'halftime' | 'secondHalfStart' | 'matchEnd' | 'extraTimeStart' | 'penaltiesStart' | 'redCard' | 'redCardCancelled' | 'yellowCard' | 'substitution' | 'matchSuspended' | 'kickoffDelayed' | 'matchReminder' | 'lineups' | 'rivalLoss' | 'rivalBigLoss' | 'rivalRedCard' | 'rivalPenMiss';
export interface FbChange {
    type: FbChangeType;
    matchId: string;
    homeTeam: FbTeamRef;
    awayTeam: FbTeamRef;
    homeScore: number;
    awayScore: number;
    league: string;
    leagueId: string;
    /** The league's country as the provider names it ("World" for national-team and international cups). */
    leagueCountry?: string;
    popularity: number;
    /** Side that caused the event (goal/card/sub) or that the news is about (rival, cancellations). */
    side?: 'home' | 'away';
    goalKind?: 'normal' | 'penalty' | 'own';
    scorerName?: string;
    /** Player behind a goal (scorer) or red card — drives followed-player pushes. */
    playerId?: number;
    /** Cards: player booked. Substitutions: player going OFF. */
    playerName?: string;
    /** Substitutions: player coming ON. */
    relatedPlayerName?: string;
    minute?: number | null;
    homePenScore?: number | null;
    awayPenScore?: number | null;
    /** Red cards per side at the moment of a redCard (VAR guard for delayed buckets). */
    homeRedCards?: number;
    awayRedCards?: number;
    /** goalCancelled: a VAR review event backs it (copy says "El VAR anula"). */
    varConfirmed?: boolean;
    /** kickoffDelayed: human delay ("1 h 30 min") or 'postponed'. */
    delay?: string;
}
/** Compact per-match state persisted between polls (fb_meta/liveSnapshot). */
export interface SnapEntry {
    st: string;
    hs: number;
    as: number;
    rh: number;
    ra: number;
    yh: number;
    ya: number;
    sh: number;
    sa: number;
    ph: number;
    pa: number;
    /** Kickoff unix seconds (lets the poller drop stale entries). */
    ts: number;
    /** League popularity (drives poll cadence and enrichment priority). */
    pp?: number;
    /** Last live-clock anchor written for the row: [periodStartedAt, offset]. */
    lc?: [number, number];
    /** Red cards per side we actually notified (watermark for cancellations). */
    rp?: [number, number];
    /** Consecutive polls the red-card count has stayed below the watermark. */
    rd?: [number, number];
    /** Unix seconds when we saw the match finish (settle passes). */
    ft?: number;
    /** Post-final settle passes already done. */
    se?: number;
    /** Unix seconds since the match went missing from the live feed while in play. */
    g?: number;
    /** Last re-check of a missing match (unix seconds). */
    gc?: number;
    /** One-time latches. */
    f: {
        start?: true;
        ht?: true;
        h2?: true;
        et?: true;
        pen?: true;
        susp?: true;
        end?: true;
        rival?: true;
        rem?: true;
        lin?: true;
    };
}
export type Snapshot = Record<string, SnapEntry>;
type FixtureWithEvents = AfFixtureCore & {
    events?: AfEvent[];
};
/**
 * Is there a VAR event near the current minute? Distinguishes a formal VAR
 * review from a goal the referee disallowed on the spot (clear offside) or a
 * data correction. Six-minute window back from now; without a current minute
 * any VAR event counts (better to attribute in a match that had a review than
 * deny one that just happened).
 */
export declare function hasRecentVarEvent(events: AfEvent[] | undefined, currentMinute: number | null): boolean;
/** Build a snapshot entry from a fixture, carrying state over from `prev`. */
export declare function snapEntryFor(f: FixtureWithEvents, prev?: SnapEntry): SnapEntry;
export interface DetectResult {
    changes: FbChange[];
    next: Snapshot;
}
/**
 * Diff current fixtures against the previous snapshot.
 *
 * @param fixtures  live-feed fixtures + re-fetched fixtures that left the feed
 * @param prev      previous snapshot
 * @param nowSec    clock (injected for tests)
 */
export declare function detectChanges(fixtures: FixtureWithEvents[], prev: Snapshot, nowSec: number): DetectResult;
/** Upcoming-match row the poller passes for pre-match reminders. */
export interface UpcomingMatch {
    id: string;
    timestamp: number;
    homeTeam: FbTeamRef;
    awayTeam: FbTeamRef;
    league: string;
    leagueId: string;
    leagueCountry?: string;
    popularity: number;
}
export declare function emptyEntry(ts: number, pp: number): SnapEntry;
/**
 * Pre-match reminders (~15 min before kickoff). Creates/updates snapshot
 * entries for upcoming matches so the later NS → 1H transition is a proper
 * kickoff and the reminder latch survives across polls.
 */
export declare function detectReminders(upcoming: UpcomingMatch[], snap: Snapshot, nowSec: number): FbChange[];
export {};
