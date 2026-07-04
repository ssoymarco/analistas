// ── Nombre de liga para textos de notificación ────────────────────────────────
// SM parte los amistosos en "ligas" internas ("Club Friendlies 1-4",
// "Friendlies"...) — detalle de su modelo de datos que el usuario no debe ver
// (reporte del dueño, 4 jul 2026: la notificación de recordatorio decía
// "· Club Friendlies 3 ·"). En notificaciones el contexto es UN partido →
// SINGULAR "Amistoso" (la lista de la app usa el plural "Amistosos" vía
// getLeagueDisplayName del cliente). Copy en español: las notificaciones del
// backend son es-MX para toda la audiencia.
const FRIENDLIES_RE = /friendl|amistoso/i;

export function displayLeague(name: string | null | undefined): string {
  if (!name) return '';
  return FRIENDLIES_RE.test(name) ? 'Amistoso' : name;
}
