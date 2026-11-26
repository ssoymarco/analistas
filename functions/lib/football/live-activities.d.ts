/**
 * Live Activities — push de updates a lock screen / Dynamic Island.
 * Versión API-Sports (fútbol) — portada 1:1 de functions/src/live-activities.ts
 * (rama feature/live-activities); solo cambia la fuente: FbMatchDoc en vez del
 * MatchDoc de Sportmonks, y `fb_matches` para el catch-up de huérfanos.
 * Los registros nuevos traen matchId de API-Sports (fixtures ~1.5M); los de
 * builds viejos traen ids de Sportmonks (~19M) — rangos disjuntos, y el TTL
 * de 12 h los purga.
 *
 * Colgado del ciclo de fbPollLive (tras el batch write): para cada partido
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
import type { FbMatchDoc } from '../shared/football/model';
import { type MatchActivityState } from '../live-activity-contract';
type MatchDoc = FbMatchDoc;
export declare function buildStateFromMatchDoc(m: MatchDoc, contractVersion?: number): MatchActivityState;
/** Clave de deduplicación: si no cambió, no se envía nada. Los primeros
 *  CORE_KEY_LENGTH elementos son lo urgente; el resto (contrato v2) es
 *  contexto que puede esperar. */
export declare function stateKey(s: MatchActivityState): string;
/**
 * ¿El cambio respecto a lo último entregado es solo de contexto (estadísticas,
 * amarillas)? Esos pushes van con prioridad baja: Apple limita cuántos updates
 * de prioridad alta acepta por hora, y ese cupo es para goles y cambios de fase.
 */
export declare function isContextOnlyChange(prevKey: string | undefined, key: string): boolean;
/**
 * Punto de entrada — llamado desde executeSinglePoll tras el batch write.
 * `matchDocs` = partidos del ciclo (live + próximos a empezar). NUNCA lanza.
 */
export declare function sendLiveActivityUpdates(matchDocs: MatchDoc[], opts?: {
    deepPass?: boolean;
}): Promise<void>;
export {};
