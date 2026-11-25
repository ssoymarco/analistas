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

import { admin, db } from './admin-init';
import * as logger from 'firebase-functions/logger';
import { displayLeague } from './league-display';
import { loc } from './detect-changes';
import type { MatchDoc } from './types';

/** Umbral mínimo para considerar un movimiento como retraso real (no ruido de
 *  micro-correcciones de SM). */
const MIN_DELAY_MS = 5 * 60 * 1000;
/** Techo: más de esto es un APLAZAMIENTO a otro día/fecha (estado POSTPONED,
 *  otra clase de evento), no un retraso de misma jornada. No lo tratamos aquí. */
const MAX_DELAY_MS = 8 * 60 * 60 * 1000;
/** Solo miramos partidos que arrancan dentro de esta ventana (el retraso
 *  importa cuando es inminente; y acota las lecturas). */
const IMMINENT_MS = 8 * 60 * 60 * 1000;

function parseSmUtc(s: string | undefined): number {
  if (!s) return NaN;
  return new Date(s.replace(' ', 'T') + 'Z').getTime();
}

/** "1 h", "1 h 30 min", "45 min" — desfase legible, sin zona horaria. */
function formatDelta(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h} h ${m} min`;
  if (h > 0) return `${h} h`;
  return `${m} min`;
}

/**
 * Detecta partidos cuya hora de inicio se movió MÁS TARDE desde el último sync
 * y notifica a los seguidores. Recibe los MatchDocs recién mapeados de este run
 * (aún NO escritos), lee la hora vieja de Firestore y compara.
 *
 * No-fatal: cualquier error se registra y no interrumpe syncFixtures.
 */
export async function notifyKickoffDelays(freshDocs: MatchDoc[]): Promise<number> {
  const now = Date.now();

  // Candidatos: programados, con hora futura dentro de la ventana inminente.
  const candidates = freshDocs.filter(d => {
    if (d.status !== 'scheduled') return false;
    const t = parseSmUtc(d.startingAtUtc);
    return Number.isFinite(t) && t > now && t - now < IMMINENT_MS;
  });
  if (candidates.length === 0) return 0;

  // Leer la hora vieja de los candidatos (pocas lecturas: los inminentes).
  const refs = candidates.map(d => db.collection('matches').doc(d.id));
  const oldSnaps = await db.getAll(...refs);
  const oldById = new Map(oldSnaps.map(s => [s.id, s.data()]));

  const messaging = admin.messaging();
  let sent = 0;

  for (const d of candidates) {
    const old = oldById.get(d.id);
    const oldT = parseSmUtc(old?.startingAtUtc as string | undefined);
    const newT = parseSmUtc(d.startingAtUtc);
    if (!Number.isFinite(oldT)) continue; // doc nuevo — sin hora previa que comparar

    const deltaMs = newT - oldT;
    if (deltaMs < MIN_DELAY_MS || deltaMs > MAX_DELAY_MS) continue; // no es retraso de jornada

    const homeId = d.homeTeam.id;
    const awayId = d.awayTeam.id;
    const title  = '⏰ Partido retrasado';
    const body   = `${loc(d.homeTeam.name)} vs ${loc(d.awayTeam.name)} · ${displayLeague(d.league)} · +${formatDelta(deltaMs)}`;

    try {
      // Clase `kickoff` (inicio del partido) — es la audiencia CORRECTA y
      // AMPLIA: un retraso es un cambio de la hora de inicio, y matchStart está
      // ON por default (a diferencia de `reminders`, que es opt-in y casi nadie
      // tiene — lección de la auditoría 10-jul-2026: no mandar a topics vacíos).
      // + guard de mute por partido. Inmediato: un cambio de horario no es
      // spoiler, no pasa por buckets de Modo Estadio.
      await messaging.send({
        condition:
          `('team_${homeId}_kickoff' in topics || 'team_${awayId}_kickoff' in topics)` +
          ` && !('mute_${d.id}' in topics)`,
        notification: { title, body },
        data: {
          type: 'matchDelayed',
          matchId: d.id,
          delayMinutes: String(Math.round(deltaMs / 60000)),
        },
        android: { priority: 'high', notification: { channelId: 'analistas-live', sound: 'default' } },
        apns: { payload: { aps: { sound: 'default', badge: 0, category: 'MATCH_EVENT' } } },
      });
      sent++;
      logger.info(`⏰ Retraso notificado: ${d.homeTeam.name} vs ${d.awayTeam.name} (+${formatDelta(deltaMs)})`);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'messaging/invalid-argument') {
        logger.warn(`⏰ Push de retraso falló para ${d.id}`, { err });
      }
    }
  }
  return sent;
}
