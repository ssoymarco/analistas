// ── Live Activity — contrato de datos (lado CLIENTE) ─────────────────────────
//
// Contrato compartido entre:
//   • Este archivo (TypeScript, cliente RN)
//   • functions/src/live-activity-contract.ts (espejo EXACTO, backend)
//   • targets/live-activity/*.swift (structs Codable — las KEYS deben coincidir
//     letra por letra con los campos JSON de aquí)
//
// ⚠️ MIRRORING: igual que getLiveClockAnchor (src/services/sportsApi.ts ↔
// functions/src/mappers.ts), cualquier cambio aquí DEBE replicarse en los otros
// dos lados. El widget decodifica `content-state` JSON directamente con estas
// keys — un rename rompe la Activity en silencio.
//
// Spec: docs/live-activities-spec.md · Plan: docs/live-activities-plan.md

// ── Atributos estáticos (fijos durante toda la Activity) ─────────────────────

export interface LiveActivityTeam {
  /** Nombre display ya traducido al idioma del usuario al INICIAR la actividad
   *  (el widget no tiene i18n propio). */
  name: string;
  /** Código corto (FIFA para selecciones, p.ej. "MEX"; short_code SM para clubes). */
  shortName: string;
  /** Color primario del equipo, hex "#RRGGBB" — de src/utils/teamColors.ts
   *  (resolveMatchColors garantiza contraste entre ambos lados). */
  colorHex: string;
  /** Bandera emoji para selecciones ("🇲🇽"); undefined para clubes. */
  flagEmoji?: string;
}

export interface MatchActivityAttributes {
  /** ID SportMonks del fixture — clave para el registro en Firestore y para el
   *  deep link (analistas://match/{matchId}) al tocar la Activity. */
  matchId: string;
  home: LiveActivityTeam;
  away: LiveActivityTeam;
  /** Nombre display de la liga ("Mundial 2026"). */
  leagueName: string;
}

// ── Estado dinámico (cada push lo reemplaza completo) ────────────────────────

/** Fase del partido — decide qué renderiza el widget en la línea de tiempo:
 *  pre  → "Por comenzar"           (sin timer)
 *  1H   → minuto corriendo         (timer local anclado)
 *  HT   → "MT"                     (estático)
 *  2H   → minuto corriendo
 *  ET   → minuto corriendo (105/120)
 *  PEN  → "PENALES"                (estático — nunca avanzar reloj, ver MEMORY)
 *  SUSP → "SUSPENDIDO"             (estático — partido interrumpido/suspendido)
 *  FT   → "FINAL"                  (estático; el push event:"end" cierra)
 *  ⚠️ Este union está HORNEADO en el widget nativo (Swift) — agregar fases
 *  después requiere build nuevo. Mapea desde Match.stateLabel:
 *  1T→1H · HT→HT · 2T→2H · ET→ET · PEN→PEN · SUSP/INT→SUSP. */
export type LiveActivityPhase = 'pre' | '1H' | 'HT' | '2H' | 'ET' | 'PEN' | 'SUSP' | 'FT';

export interface MatchActivityState {
  homeScore: number;
  awayScore: number;
  phase: LiveActivityPhase;
  /** Anchor del minuto en vivo — MISMA semántica que Match.liveClock
   *  (src/hooks/useLiveTick.ts · computeLiveMinuteSeconds):
   *  unix SECONDS en que arrancó el período actual. El widget calcula el
   *  minuto LOCALMENTE con Text(timerInterval:) anclado a
   *  (periodStartedAt − periodMinuteOffset·60) — cero pushes por tick.
   *  Ausente cuando phase no corre (pre/HT/PEN/FT). */
  periodStartedAt?: number;
  /** Offset de minuto del período: 0 (1T) | 45 (2T) | 90 (TE1) | 105 (TE2). */
  periodMinuteOffset?: number;
  /** Unix seconds del kickoff — usado en phase 'pre' para la CUENTA REGRESIVA
   *  del widget (Text(timerInterval:countsDown:true)). Al llegar a 0 el widget
   *  se queda en 0:00 hasta que el push (Fase 2) o el update en foreground
   *  cambie la fase a 1H. */
  kickoffAt?: number;
  /** Última jugada relevante, ya localizada: "⚽ Oyarzabal 36'". Opcional. */
  lastEventText?: string;
}

// ── Registro en Firestore ─────────────────────────────────────────────────────
//
// Colección: liveActivities/{autoId}
// Reglas: create/delete solo del dueño autenticado; sin lecturas de cliente.
// El backend (poll-livescores) consulta por matchId e indexa por él.

export interface LiveActivityRegistration {
  /** Token FCM del DISPOSITIVO — el target del mensaje FCM en ambas plataformas. */
  fcmToken: string;
  /** Push token de la ACTIVITY (ActivityKit) — solo iOS. FCM lo enruta a APNs
   *  vía el campo `apns.live_activity_token`. */
  activityPushToken?: string;
  matchId: string;
  platform: 'ios' | 'android';
  /** UID Firebase del usuario (para reglas + limpieza). */
  userId: string;
  /** serverTimestamp al registrar. TTL: el backend purga registros > 6 h. */
  createdAt: unknown;
  /** Marcado true al enviar event:"end" — evita re-envíos. */
  ended?: boolean;
}

// ── Payloads FCM (referencia backend — doc corto) ────────────────────────────
//
// iOS (update) — admin.messaging().send(...):
// {
//   token: <fcmToken>,                              // device
//   apns: {
//     live_activity_token: <activityPushToken>,     // la Activity concreta
//     headers: { 'apns-push-type': 'liveactivity', 'apns-priority': '10' },
//     payload: { aps: {
//       timestamp: <unix s>, event: 'update',       // o 'end' (+ dismissal-date)
//       'content-state': <MatchActivityState>,      // JSON con las keys de arriba
//       alert: { title: '', body: '' },             // quirk FCM: exige alert presente
//     }},
//   },
// }
// ⚠️ firebase-admin puede no tipar live_activity_token → cast `as any`
//    (issue firebase-admin-node #2875). Validar en Fase 2 en device real.
//
// Android (update/end) — data-only, lo consume el background handler:
// {
//   token: <fcmToken>,
//   data: {
//     type: 'live_activity_update' | 'live_activity_end',
//     matchId: <string>,
//     attributes: JSON.stringify(<MatchActivityAttributes>),
//     state: JSON.stringify(<MatchActivityState>),
//   },
//   android: { priority: 'high' },
// }
