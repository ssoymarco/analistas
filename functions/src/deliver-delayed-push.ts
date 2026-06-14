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

import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { admin, db } from './admin-init';
import * as logger from 'firebase-functions/logger';

// ── Payload shape ──────────────────────────────────────────────────────────────
// Must stay in sync with the enqueue call in detect-changes.ts.

export interface DelayedPushPayload {
  topic:      string;               // e.g. "team_1234_goals_d5"
  title:      string;
  body:       string;
  data:       Record<string, string>;
  dedupId:    string;               // same apns-collapse-id / android tag as _d0
  changeType: string;               // 'goal' | 'halftime' | 'matchEnd' | 'redCard'
  matchId:    string;
  homeScore:  number;               // score AT THE TIME OF THE EVENT
  awayScore:  number;
}

// ── Handler ─────────────────────────────────────────────────────────────────────

export const deliverDelayedPush = onTaskDispatched(
  {
    retryConfig:  { maxAttempts: 2, minBackoffSeconds: 5 },
    rateLimits:   { maxConcurrentDispatches: 50 },
    region:       'us-central1',
    memory:       '256MiB',
    timeoutSeconds: 30,
  },
  async (req) => {
    const p = req.data as DelayedPushPayload;

    // ── VAR guard (goal events only) ─────────────────────────────────────────
    // If the score has decreased since the task was enqueued, the goal was
    // cancelled by VAR. Skip the notification so delayed-bucket subscribers
    // never receive a spoiler for a disallowed goal.
    if (p.changeType === 'goal') {
      try {
        const snap = await db.doc(`matches/${p.matchId}`).get();
        if (snap.exists) {
          const curr = snap.data() as { homeScore?: number; awayScore?: number };
          const currTotal = (curr.homeScore ?? 0) + (curr.awayScore ?? 0);
          const taskTotal = p.homeScore + p.awayScore;
          if (currTotal < taskTotal) {
            logger.info('🚫 VAR guard: delayed push suppressed', {
              matchId: p.matchId, topic: p.topic,
              taskTotal, currTotal,
            });
            return; // drop — VAR cancelled the goal
          }
        }
      } catch (varErr) {
        // Firestore read failed → deliver anyway (availability > correctness here)
        logger.warn('VAR guard read failed — delivering notification', {
          matchId: p.matchId, err: String(varErr),
        });
      }
    }

    // ── FCM send ─────────────────────────────────────────────────────────────
    try {
      await admin.messaging().send({
        topic: p.topic,
        notification: { title: p.title, body: p.body },
        data: p.data,
        android: {
          priority: 'high',
          collapseKey: p.dedupId,
          notification: {
            channelId: 'analistas-live',
            sound:     'default',
            tag:       p.dedupId,
          },
        },
        apns: {
          headers:  { 'apns-collapse-id': p.dedupId },
          payload:  { aps: { sound: 'default', badge: 0 } },
        },
      });
      logger.info(`⏰ Delayed push delivered → ${p.topic}`, {
        matchId: p.matchId, changeType: p.changeType,
      });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      // "No subscribers on this topic" → topic just has no receivers for this bucket
      if (
        code === 'messaging/invalid-argument' ||
        code === 'messaging/registration-token-not-registered'
      ) {
        return; // silent skip — no subscribers on this bucket
      }
      // Any other error → rethrow so Cloud Tasks retries (up to maxAttempts)
      throw err;
    }
  },
);
