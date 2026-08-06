// ── deadState — etiqueta correcta para partidos "muertos" de SportMonks ──────
//
// El servidor mapea los estados MUERTOS de SM (cancelado/pospuesto/abandonado/
// eliminado) a status:'finished' — TERMINAL, para que el reloj en vivo no se
// dispare (incidente Chivas vs U. de G., 11 jul 2026, donde SM canceló un
// amistoso que sí se jugaba y la app mostró "EN VIVO · 119:08'"). Pero un
// partido cancelado NO terminó 0-0: mostrar "Finalizado" con marcador es
// engañoso. El doc conserva `stateId`, así que aquí lo traducimos a la
// etiqueta honesta SIN crear un status nuevo (cero riesgo para la lógica de
// tabs/resumen, que sigue viendo 'finished') y de forma retrocompatible
// (builds viejos ignoran esto y muestran "Finalizado").
//
// IDs de SM (functions/src/types.ts · SM_STATE_IDS):
//   10 POSTPONED · 12 CANCELLED · 15 ABANDONED · 16 DELAYED · 20 DELETED · 26 PENDING
//
// ⚠️ 16 DELAYED (retraso del pitido inicial, típicamente por tormenta) también
// llega con status 'finished'. Faltaba aquí, y el resultado fue el peor de los
// tres: la app decía "Finalizado · 0 – 0" de un partido que ni había arrancado
// (Monterrey vs Orlando City, Leagues Cup, 5 ago 2026). Peor aún, la pastilla
// ámbar "RETRASADO" ya existía en MatchCard/MatchDetailScreen pero estaba
// gateada a `isScheduled` — código muerto, imposible de renderizar. Por eso
// `isPreKickoffStateId` existe: los callers lo usan para tratar estos partidos
// como PREVIA (sin marcador) en vez de como final.

const POSTPONED = 10;
const DELAYED = 16;
const CANCELLED_LIKE = new Set([12, 15, 20]); // cancelado/abandonado/eliminado
/** Retrasado: el partido NO ha empezado y SÍ va a jugarse hoy. Solo 16 — un
 *  aplazamiento (10) manda el partido a otro día y ahí "Aplazado" es correcto. */
const PRE_KICKOFF_LIKE = new Set([DELAYED]);

/** ¿El stateId corresponde a un partido cancelado/pospuesto/retrasado (no un
 *  final real)? */
export function isDeadStateId(stateId: number | null | undefined): boolean {
  const id = Number(stateId);
  return id === POSTPONED || CANCELLED_LIKE.has(id) || PRE_KICKOFF_LIKE.has(id);
}

/** ¿El partido está "muerto" pero AÚN VA A JUGARSE (retrasado/por confirmar)?
 *  Los callers deben renderizar previa — hora/pastilla de retraso — y NUNCA el
 *  marcador, que sería 0-0 y engañoso. */
export function isPreKickoffStateId(stateId: number | null | undefined): boolean {
  return PRE_KICKOFF_LIKE.has(Number(stateId));
}

/** Key i18n de la etiqueta si el partido está cancelado/pospuesto/retrasado;
 *  `null` para un final normal (el caller usa "Finalizado"/"Final"). */
export function deadStateLabelKey(stateId: number | null | undefined): string | null {
  const id = Number(stateId);
  if (id === POSTPONED) return 'matchStatus.postponed';
  if (CANCELLED_LIKE.has(id)) return 'matchStatus.cancelled';
  if (PRE_KICKOFF_LIKE.has(id)) return 'matchStatus.delayed';
  return null;
}
