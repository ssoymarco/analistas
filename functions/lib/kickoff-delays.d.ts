/**
 * kickoff-delays.ts
 *
 * Aviso de RETRASO PRE-PARTIDO (13 jul 2026). Cuando SportMonks mueve la hora
 * de inicio de un partido programado (típico: retraso 1 h por tormenta
 * eléctrica — México vs Inglaterra, 6pm→7pm), notificamos a los seguidores de
 * ambos equipos la NUEVA situación. Complementa a `matchSuspended`
 * (detect-changes.ts), que cubre la suspensión EN PLENO partido.
 *
 * Por qué aquí (syncFixtures, 5 min) y no en pollLivescores (4 s): pollLivescores
 * solo ve el feed inplay (partidos en vivo) — un retraso ocurre mientras el
 * partido sigue 'scheduled'. syncFixtures re-baja TODAS las ligas por fecha, así
 * que ve el cambio de starting_at para cualquier liga del mundo. 5 min de
 * latencia es irrelevante para un retraso de una hora.
 *
 * Notificamos el DESFASE ("retrasado 1 h"), no la hora absoluta: el servidor no
 * conoce la zona horaria de cada usuario, pero el desfase es universal y la hora
 * nueva exacta ya se ve en la app en horario local. Auto-dedup: comparamos la
 * hora vieja del doc contra la nueva; una vez escrita, el siguiente sync ve
 * vieja==nueva y no re-notifica (y si se retrasa OTRA vez, vuelve a disparar).
 */
import type { MatchDoc } from './types';
/**
 * Detecta partidos cuya hora de inicio se movió MÁS TARDE desde el último sync
 * y notifica a los seguidores. Recibe los MatchDocs recién mapeados de este run
 * (aún NO escritos), lee la hora vieja de Firestore y compara.
 *
 * No-fatal: cualquier error se registra y no interrumpe syncFixtures.
 */
export declare function notifyKickoffDelays(freshDocs: MatchDoc[]): Promise<number>;
