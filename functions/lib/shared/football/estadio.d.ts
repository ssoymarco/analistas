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
/** Delays the app offers (minutes): cable / antenna, streaming. */
export declare const ESTADIO_DELAYS: readonly [3, 5];
export declare const ESTADIO_DEFAULT_DELAY = 3;
/** "Me spoileó" adds this much… */
export declare const ESTADIO_BUMP_MIN = 3;
/** …up to this ceiling. */
export declare const ESTADIO_MAX_DELAY = 10;
/** What a device may want from a match — one per notification toggle. */
export declare const ESTADIO_CLASSES: readonly ["goals", "cards", "yellow", "subs", "live", "kickoff", "lineups", "reminders"];
export type EstadioClass = typeof ESTADIO_CLASSES[number];
export declare const ESTADIO_RIVAL_EVENTS: readonly ["loss", "bigLoss", "redCard", "penMiss"];
export type EstadioRivalEvent = typeof ESTADIO_RIVAL_EVENTS[number];
export interface EstadioRequest {
    /** `start` also changes the delay of a running session. `refresh` only
     *  updates what the device wants (it followed a team, flipped a toggle…)
     *  and does nothing when there is no session. */
    action: 'start' | 'stop' | 'bump' | 'refresh';
    matchId: string;
    /** The device's FCM registration token — where the delayed pushes go. */
    fcmToken: string;
    /** start: minutes of delay (one of ESTADIO_DELAYS). */
    delayMin?: number;
    /** start / refresh: team notifications this device has on for the match
     *  (empty when it follows neither team). */
    classes?: EstadioClass[];
    /** start: teams of this match the user marked as rivals, and which of
     *  their bad news they want. */
    rivalTeamIds?: string[];
    rivalEvents?: EstadioRivalEvent[];
    /** start: players the user follows (their goals and red cards). */
    playerIds?: string[];
    platform?: 'ios' | 'android';
    /** stop: the user silenced the match — leave the device muted. */
    keepMuted?: boolean;
    /** The request comes from a notification button (app not on screen): answer
     *  with a push so the user sees it worked. */
    confirm?: boolean;
}
export interface EstadioResponse {
    ok: true;
    active: boolean;
    /** Minutes of delay now in force (0 when not active). */
    delayMin: number;
    /** Unix seconds after which the session is gone even if nobody ends it. */
    endsAt?: number;
}
/**
 * iOS notification category of the pushes a session delivers, and the ids of
 * the long-press buttons. The app registers them (services/notifications.ts);
 * regular match pushes keep the `MATCH_EVENT` category.
 */
export declare const ESTADIO_PUSH_CATEGORY = "MATCH_ESTADIO";
export declare const ESTADIO_ACTION_ON = "ESTADIO_ON";
export declare const ESTADIO_ACTION_SPOILED = "ESTADIO_SPOILED";
export declare const ESTADIO_ACTION_OFF = "ESTADIO_OFF";
/** Next delay after a "me spoileó". */
export declare function bumpedDelay(delayMin: number): number;
