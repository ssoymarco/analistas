/**
 * deliver-delayed-push.ts
 *
 * Cloud Tasks handler for Modo Estadio delayed notifications.
 *
 * Architecture (Modo Estadio — delay-bucket topics):
 *   1. detect-changes.ts detects a live event (goal, halftime, matchEnd, redCard)
 *   2. dispatchNotifications() sends to <base>_d0 immediately AND enqueues one
 *      Cloud Task per delay bucket (d2/d5/d10) pointing at this handler.
 *   3. Cloud Tasks fires this handler at T+N minutes.
 *   4. This handler re-sends the FCM push to <base>_d{N}, which fan-outs to all
 *      devices currently subscribed to that delay bucket.
 *
 * VAR guard (goal events only):
 *   At delivery time we read the current match score from Firestore. If the
 *   total goals decreased since the task was enqueued (VAR cancelled the goal),
 *   we skip the notification. This means _d2/d5/d10 subscribers never learn
 *   about a disallowed goal — better UX than "Gol!" followed by "VAR: anulado".
 *
 * Idempotency:
 *   Tasks are enqueued with a deterministic name (estadio_<base>_<dedupId>_d<N>).
 *   Cloud Tasks silently drops a second enqueue with the same name while the
 *   first is still pending — no double delivery.
 *
 * Kill switch (server-side):
 *   Set ESTADIO_DELAY_ENABLED=false in Cloud Functions env to stop enqueuing
 *   new tasks (no redeploy needed; this handler just never gets called).
 */
export interface DelayedPushPayload {
    topic: string;
    title: string;
    body: string;
    data: Record<string, string>;
    dedupId: string;
    changeType: string;
    matchId: string;
    homeScore: number;
    awayScore: number;
}
export declare const deliverDelayedPush: import("firebase-functions/v2/tasks").TaskQueueFunction<any>;
