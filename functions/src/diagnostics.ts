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

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { admin } from './admin-init';

export const BACKFILL_TOKEN = defineSecret('BACKFILL_TOKEN');

export const reportFcmToken = onCall(
  {
    timeoutSeconds: 30,
    memory: '256MiB',
    region: 'us-central1',
    invoker: 'public',
  },
  async (req) => {
    const fcmToken  = String(req.data?.fcmToken  ?? '');
    const apnsToken = String(req.data?.apnsToken ?? '');
    const platform  = String(req.data?.platform  ?? 'unknown');
    const buildNum  = String(req.data?.buildNum  ?? 'unknown');
    logger.info('📲 FCM_DIAG', {
      platform,
      buildNum,
      hasFcmToken:  fcmToken.length > 0,
      hasApnsToken: apnsToken.length > 0,
      fcmToken,
      apnsFirst16:  apnsToken.slice(0, 16),
      ts:           Date.now(),
    });
    return { ok: true };
  },
);

export const sendTestPush = onCall(
  {
    timeoutSeconds: 60,
    memory: '256MiB',
    region: 'us-central1',
    secrets: [BACKFILL_TOKEN],
    invoker: 'public',
  },
  async (req) => {
    const tokenHeader = (req.data?.adminToken as string | undefined) ?? '';
    const expectedToken = BACKFILL_TOKEN.value();
    if (!expectedToken || tokenHeader !== expectedToken) {
      throw new HttpsError('permission-denied', 'sendTestPush requires a matching adminToken.');
    }
    const topic = req.data?.topic as string | undefined;
    const token = req.data?.token as string | undefined;
    const title = (req.data?.title as string | undefined) ?? 'Analistas';
    const body  = (req.data?.body  as string | undefined) ?? 'Test push';
    if (!topic && !token) {
      throw new HttpsError('invalid-argument', 'Expected `topic` OR `token` string.');
    }
    const target = token ? { token } : { topic: topic! };
    const messageId = await admin.messaging().send({
      ...target,
      notification: { title, body },
      data: { type: 'test', ts: String(Date.now()) },
      apns: { payload: { aps: { sound: 'default' } } },
      android: { priority: 'high', notification: { channelId: 'analistas-live', sound: 'default' } },
    });
    return { ok: true, messageId, target };
  },
);
