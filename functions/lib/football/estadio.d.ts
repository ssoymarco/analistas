/**
 * football/estadio.ts
 *
 * Modo Estadio per match (v2). The first design delayed pushes with one FCM
 * topic per delay (`…_d2/_d5/_d10`) and a GLOBAL switch in the app: turning it
 * on meant re-subscribing every followed team from the phone (hundreds of
 * calls that died when the phone was locked), switching mid-match repeated or
 * lost events, and rival / followed-player pushes were never delayed.
 *
 * Here the mode belongs to ONE match and the server owns it:
 *
 *   start  The app calls `fbEstadio` once. We subscribe the device's token to
 *          the match's mute topic — every regular push of the match already
 *          excludes it — and to its hold topic (followed-player pushes, which
 *          ignore mute), and store a session: token, delay, what the device
 *          wants from this match (its notification toggles, rival teams,
 *          followed players).
 *   event  dispatchEstadioSessions() runs with every batch of changes: each
 *          session that wants a change gets it by token, `delayMin` minutes
 *          later, through the same `deliverDelayedPush` queue (VAR guard
 *          included). Only what is detected AFTER the session started goes
 *          this way; what came before was delivered by the topics → switching
 *          mid-match neither repeats nor loses anything.
 *   stop   The session is deleted and the token leaves both topics. Pushes
 *          already queued carry their tokens, so they still arrive.
 *   end    At full time the session gets a short expiry (after its last push);
 *          sweepEstadioSessions() then unmutes the device and deletes it.
 *          Sessions never outlive 4 h past kickoff.
 *
 * Cost follows the number of devices that have the mode on in a match, not the
 * number of users: one query per dispatch, one task per (event, delay).
 * Sessions live in `fb_estadio` (server only: no client rule opens it).
 */
import { type EstadioClass, type EstadioResponse, type EstadioRivalEvent } from '../shared/football/estadio';
import type { FbChange } from './live-detect';
import { type DelayQueue } from './notify';
export declare const ESTADIO_COL = "fb_estadio";
export interface EstadioSession {
    /** Document id: `{matchId}_{hash of the token}`. */
    id: string;
    matchId: string;
    token: string;
    delayMin: number;
    classes: EstadioClass[];
    rivalTeamIds: string[];
    rivalEvents: EstadioRivalEvent[];
    playerIds: string[];
    platform: 'ios' | 'android' | 'unknown';
    uid: string | null;
    /** Unix seconds. */
    startedAt: number;
    endsAt: number;
    updatedAt: number;
}
/** Where sessions are read from and closed (Firestore; tests pass their own). */
export interface EstadioSessionSource {
    load(matchIds: string[], nowSec: number): Promise<Map<string, EstadioSession[]>>;
    /** Give these sessions their final expiry (the match ended). */
    expire(updates: Array<{
        id: string;
        endsAt: number;
    }>): Promise<void>;
}
export declare function sessionIdFor(matchId: string, token: string): string;
export interface SessionPush {
    /** `team`: the regular push of the change. `player`: the followed-player one. */
    variant: 'team' | 'player';
    delaySec: number;
}
/**
 * The push a session gets for a change, or null when it wants none.
 *
 *  - its own notification toggles decide the team events;
 *  - a followed player's goal or red card reaches a device that doesn't get
 *    the team push for it (same rule as the player topics);
 *  - rival news follows the rival toggles; the "rival sent off" push is
 *    dropped when the device already gets the red card itself;
 *  - a correction (disallowed goal, revoked red) is only for a device that
 *    was shown the event: either it saw it live before turning the mode on,
 *    or its delayed copy had already gone out.
 */
export declare function sessionPushFor(s: EstadioSession, c: FbChange): SessionPush | null;
/**
 * Deliver a batch of changes to the sessions of their matches. `queue` null
 * (delays switched off with ESTADIO_DELAY_ENABLED=false) → everything goes out
 * at once: a muted device must never be left without its pushes.
 */
export declare function dispatchEstadioSessions(changes: FbChange[], deps: {
    queue: DelayQueue | null;
    sessions?: EstadioSessionSource;
    nowSec?: number;
}): Promise<void>;
/**
 * Close sessions whose time is up: take their devices out of the match's mute
 * topic and delete them. Runs once a minute from the live poller. Never throws.
 */
export declare function sweepEstadioSessions(nowSec?: number): Promise<number>;
/** Body of the `fbEstadio` callable. */
export declare function handleEstadio(raw: unknown, uid: string | null): Promise<EstadioResponse>;
