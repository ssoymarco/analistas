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
 * Correcciones (gol anulado, roja revocada):
 *   También pasan por aquí, pero solo para los buckets que ya habían recibido
 *   el evento (lo decide quien encola — delayedBucketsFor en football/notify.ts).
 *   Llegan con el mismo retraso del bucket y sin guard: no hay nada que revocar.
 *
 * Builds anteriores al cambio de proveedor:
 *   Sus copias retrasadas son tareas aparte, dirigidas a los topics
 *   `team_{idViejo}_*_d{N}` y con `data.legacy = '1'` (sin matchId).
 *
 * Kill switch (server-side):
 *   Set ESTADIO_DELAY_ENABLED=false in Cloud Functions env to stop enqueuing
 *   new tasks (no redeploy needed; this handler just never gets called).
 */
export interface DelayedPushPayload {
    /** Single-team topic (e.g. "team_1234_goals_d5"). Mutually exclusive with condition. */
    topic?: string;
    /** FCM topic condition for events that affect both teams — eliminates double delivery
     *  when a user follows both. e.g. "'team_A_goals_d5' in topics || 'team_B_goals_d5' in topics" */
    condition?: string;
    title: string;
    body: string;
    data: Record<string, string>;
    dedupId: string;
    changeType: string;
    matchId: string;
    homeScore: number;
    awayScore: number;
    /** Collection holding the match doc for the VAR guard. Defaults to the
     *  legacy 'matches'; API-Sports pushes use 'fb_matches'. */
    matchCollection?: 'matches' | 'fb_matches';
    /** Expulsados por lado AL MOMENTO DEL EVENTO. Solo se llena para
     *  changeType 'redCard'; es la referencia del guard de VAR para saber si la
     *  roja sigue vigente al entregar. Opcional: las tareas encoladas antes de
     *  este cambio no lo traen y se entregan sin comparar. */
    homeRedCards?: number;
    awayRedCards?: number;
}
export declare const deliverDelayedPush: import("firebase-functions/v2/tasks").TaskQueueFunction<any>;
/** Etiqueta para los Reports de Firebase: "goal-estadio", "legacy-goal-estadio"… */
export declare function delayedAnalyticsLabel(p: Pick<DelayedPushPayload, 'changeType' | 'data'>): string;
/** Cuerpo del handler, separado del wrapper de Cloud Tasks para poder probarlo. */
export declare function handleDelayedPush(p: DelayedPushPayload): Promise<void>;
