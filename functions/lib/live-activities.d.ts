/**
 * Live Activities — push de updates a lock screen / Dynamic Island.
 *
 * Colgado del ciclo de pollLivescores (tras el batch write): para cada partido
 * con registros en `liveActivities`, construye el ContentState del contrato y
 * lo empuja VÍA FCM:
 *   • iOS: `apns.live_activity_token` + header `apns-push-type: liveactivity`
 *     (event update/end + content-state). Sin cliente APNs propio.
 *   • Android: data message (lo consume el background handler — Fase 3).
 *
 * Presupuesto (lección del apagón de billing): solo se envía cuando el estado
 * CAMBIÓ vs `lastState` guardado en el registro; en juego normal eso es ~0
 * pushes/min por partido, con ráfagas solo en gol/fase. 1 query por poll,
 * filtrada por los matchIds del ciclo. NUNCA lanza: cualquier error se loguea
 * y el poll sigue intacto.
 *
 * Contrato: functions/src/live-activity-contract.ts (espejo del cliente y de
 * los structs Swift — keys literales).
 */
import type { MatchDoc } from './types';
import type { MatchActivityState } from './live-activity-contract';
export declare function buildStateFromMatchDoc(m: MatchDoc): MatchActivityState;
/**
 * Punto de entrada — llamado desde executeSinglePoll tras el batch write.
 * `matchDocs` = partidos del ciclo (live + próximos a empezar). NUNCA lanza.
 */
export declare function sendLiveActivityUpdates(matchDocs: MatchDoc[], opts?: {
    deepPass?: boolean;
}): Promise<void>;
