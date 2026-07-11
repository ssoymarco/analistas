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
//   10 POSTPONED · 12 CANCELLED · 15 ABANDONED · 20 DELETED

const POSTPONED = 10;
const CANCELLED_LIKE = new Set([12, 15, 20]); // cancelado/abandonado/eliminado

/** ¿El stateId corresponde a un partido cancelado/pospuesto (no un final real)? */
export function isDeadStateId(stateId: number | null | undefined): boolean {
  return stateId === POSTPONED || CANCELLED_LIKE.has(Number(stateId));
}

/** Key i18n de la etiqueta si el partido está cancelado/pospuesto; `null` para
 *  un final normal (el caller usa su propia etiqueta "Finalizado"/"Final"). */
export function deadStateLabelKey(stateId: number | null | undefined): string | null {
  if (stateId === POSTPONED) return 'matchStatus.postponed';
  if (CANCELLED_LIKE.has(Number(stateId))) return 'matchStatus.cancelled';
  return null;
}
