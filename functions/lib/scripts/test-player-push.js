"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * test-player-push.ts
 *
 * One-shot manual test: sends a fake "goal" or "redCard" push directly to
 * player_{PLAYER_ID}_{goals|cards} — bypasses match detection entirely, so
 * it works even with no live match. Used to verify a real device receives
 * player-follow notifications (Fase 1, 5 jul 2026) without waiting for a
 * real event.
 *
 * Edit PLAYER_ID / PLAYER_NAME / KIND below, then run:
 *   cd functions && npx ts-node -e "require('./src/scripts/test-player-push.ts')"
 */
const admin_init_1 = require("../admin-init");
const PLAYER_ID = 0; // ← SportMonks player id
const PLAYER_NAME = 'Jugador Test'; // ← display name for the copy
const KIND = 'goals';
async function main() {
    if (!PLAYER_ID) {
        throw new Error('Set PLAYER_ID before running this script.');
    }
    const topic = `player_${PLAYER_ID}_${KIND}`;
    const title = KIND === 'goals' ? `⚽ ¡Gol de ${PLAYER_NAME}!` : `🟥 Expulsado: ${PLAYER_NAME}`;
    const body = KIND === 'goals' ? 'Prueba manual · Analistas' : 'Prueba manual · Analistas';
    await admin_init_1.admin.messaging().send({
        topic,
        notification: { title, body },
        data: { type: KIND === 'goals' ? 'playerGoal' : 'playerRedCard', playerId: String(PLAYER_ID), test: 'true' },
        android: { priority: 'high', notification: { channelId: 'analistas-live', sound: 'default' } },
        apns: { payload: { aps: { sound: 'default', badge: 0 } } },
    });
    console.log(`✅  Sent test push to topic "${topic}"`);
    process.exit(0);
}
main().catch(err => {
    console.error('❌  Error:', err);
    process.exit(1);
});
//# sourceMappingURL=test-player-push.js.map