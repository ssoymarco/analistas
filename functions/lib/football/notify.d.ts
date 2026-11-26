/**
 * football/notify.ts
 *
 * Push delivery for football changes detected by live-detect.ts. Ports the
 * Sportmonks-era dispatch rules (feature/live-activities branch) 1:1 onto the
 * `fb_` topic namespace (see FbTopics in shared/football/model.ts):
 *
 *  - Modo Estadio: retrasable events go to <base>_d0 now and to _d2/_d5/_d10
 *    through the `deliverDelayedPush` task queue (VAR guard for goals AND reds).
 *  - Modo Rival: immediate, single team topic.
 *  - "Silenciar este partido": every condition carries
 *    `&& !('fb_mute_{matchId}' in topics)` so muted devices are excluded in FCM
 *    (real silence with the app closed). Followed-player pushes omit it on
 *    purpose — following a player is a stronger opt-in, and their condition
 *    already uses FCM's 5-topic limit.
 *  - Followed players: goals (never own goals) and red cards, immediate, to
 *    devices that follow the player but NOT that player's team (those already
 *    get the team push, which names the scorer).
 *  - iOS category MATCH_EVENT → long-press action "Silenciar este partido".
 *  - dedupId includes the minute so two different same-type events at the same
 *    score don't replace each other in the notification center.
 *
 * LEGACY DUAL-SEND (transition window): users still on a Sportmonks-era build
 * are subscribed to `team_{sportmonksId}_*` topics. Immediate pushes are also
 * sent to the legacy topic of every team we can map back (legacy.ts). The
 * payload omits `matchId` so tapping opens the app (and its update prompt)
 * instead of a match screen the old build can no longer load. Disable with
 * FB_LEGACY_DUAL_SEND=false once adoption of the new build is high.
 */
import { type FbDelayBucket } from '../shared/football/model';
import type { FbChange } from './live-detect';
export declare const loc: (name: string) => string;
/** Friendlies are one match in a push → singular "Amistoso". */
export declare function displayLeague(name: string | null | undefined): string;
export interface Copy {
    title: string;
    body: string;
}
export declare function buildCopy(c: FbChange): Copy;
type BucketedTopic = (teamId: string, b: FbDelayBucket) => string;
type PlainTopic = (teamId: string) => string;
interface Route {
    /** Delay-bucketed topic family + the team ids it applies to. */
    bucketed?: {
        topic: BucketedTopic;
        teams: string[];
        delayed: boolean;
    };
    /** Immediate-only topic family + team ids. */
    immediate?: {
        topic: PlainTopic;
        teams: string[];
    };
}
export declare function route(c: FbChange): Route;
/** Legacy (Sportmonks-era) topic for a new-format team topic, or null when unmappable. */
export declare function legacyTopicFor(fbTopic: string): string | null;
/** `(a || b) && !mute` — FCM allows at most 5 topics per condition. */
export declare function conditionFor(topics: string[], muteMatchId?: string): string;
export declare function sendFcm(target: {
    topic: string;
} | {
    condition: string;
}, copy: Copy, data: Record<string, string>, dedupId: string): Promise<void>;
/**
 * Starting XI confirmed → one push per starter to devices following that
 * player but not their team (team followers got the "Alineaciones" push).
 */
export declare function dispatchPlayerLineups(match: {
    matchId: string;
    homeTeam: {
        id: string;
        name: string;
    };
    awayTeam: {
        id: string;
        name: string;
    };
    league: string;
}, starters: Array<{
    playerId: number;
    name: string;
    teamId: string;
}>): Promise<void>;
/**
 * FCM condition of the immediate push of a change.
 *
 * Modo Rival's red card ("your rival is a man down") is skipped for devices
 * that follow the OTHER team of the match with cards on: they already get the
 * regular red-card push for this same sending-off. FCM allows five topics per
 * condition: the rival topic, the mute guard and three of the other team's
 * delay buckets (10-minute Modo Estadio users may still see both).
 */
export declare function immediateCondition(c: FbChange, topics: string[]): string;
export declare function dispatchFootballChanges(changes: FbChange[]): Promise<void>;
export {};
