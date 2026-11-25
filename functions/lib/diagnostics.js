"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTestPush = exports.reportFcmToken = exports.BACKFILL_TOKEN = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const logger = __importStar(require("firebase-functions/logger"));
const admin_init_1 = require("./admin-init");
exports.BACKFILL_TOKEN = (0, params_1.defineSecret)('BACKFILL_TOKEN');
exports.reportFcmToken = (0, https_1.onCall)({
    timeoutSeconds: 30,
    memory: '256MiB',
    region: 'us-central1',
    invoker: 'public',
}, async (req) => {
    const fcmToken = String(req.data?.fcmToken ?? '');
    const apnsToken = String(req.data?.apnsToken ?? '');
    const platform = String(req.data?.platform ?? 'unknown');
    const buildNum = String(req.data?.buildNum ?? 'unknown');
    logger.info('📲 FCM_DIAG', {
        platform,
        buildNum,
        hasFcmToken: fcmToken.length > 0,
        hasApnsToken: apnsToken.length > 0,
        fcmToken,
        apnsFirst16: apnsToken.slice(0, 16),
        ts: Date.now(),
    });
    return { ok: true };
});
exports.sendTestPush = (0, https_1.onCall)({
    timeoutSeconds: 60,
    memory: '256MiB',
    region: 'us-central1',
    secrets: [exports.BACKFILL_TOKEN],
    invoker: 'public',
}, async (req) => {
    const tokenHeader = req.data?.adminToken ?? '';
    const expectedToken = exports.BACKFILL_TOKEN.value();
    if (!expectedToken || tokenHeader !== expectedToken) {
        throw new https_1.HttpsError('permission-denied', 'sendTestPush requires a matching adminToken.');
    }
    const topic = req.data?.topic;
    const token = req.data?.token;
    const title = req.data?.title ?? 'Analistas';
    const body = req.data?.body ?? 'Test push';
    if (!topic && !token) {
        throw new https_1.HttpsError('invalid-argument', 'Expected `topic` OR `token` string.');
    }
    const target = token ? { token } : { topic: topic };
    const messageId = await admin_init_1.admin.messaging().send({
        ...target,
        notification: { title, body },
        data: { type: 'test', ts: String(Date.now()) },
        apns: { payload: { aps: { sound: 'default' } } },
        android: { priority: 'high', notification: { channelId: 'analistas-live', sound: 'default' } },
    });
    return { ok: true, messageId, target };
});
//# sourceMappingURL=diagnostics.js.map