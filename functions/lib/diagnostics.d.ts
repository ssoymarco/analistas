/**
 * diagnostics.ts
 *
 * Operator endpoints for verifying push delivery end-to-end. Moved verbatim
 * from the pre-migration index.ts (they don't depend on any data provider).
 *
 *  - reportFcmToken: devices report their FCM/APNs tokens on launch; logged
 *    only (no Firestore write) so tokens age out with log retention.
 *  - sendTestPush: send a test push to a topic or a token. Gated on the
 *    BACKFILL_TOKEN secret.
 *
 * Example:
 *   curl -X POST https://us-central1-analistas-8ba26.cloudfunctions.net/sendTestPush \
 *     -H 'Content-Type: application/json' \
 *     -d '{"data":{"adminToken":"…","topic":"fb_team_2287_goals_d0","title":"Prueba","body":"Hola"}}'
 */
export declare const BACKFILL_TOKEN: import("firebase-functions/lib/params/types").SecretParam;
export declare const reportFcmToken: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
}>, unknown>;
export declare const sendTestPush: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
    messageId: string;
    target: {
        token: string;
        topic?: undefined;
    } | {
        topic: string;
        token?: undefined;
    };
}>, unknown>;
