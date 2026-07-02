// ── Live Activity — contrato de datos (lado BACKEND) ─────────────────────────
//
// ESPEJO EXACTO de src/data/liveActivityContract.ts (cliente). Igual que el
// mirroring de getLiveClockAnchor (mappers.ts ↔ sportsApi.ts): cualquier cambio
// aquí debe replicarse en el cliente Y en los structs Codable de
// targets/live-activity/*.swift — el widget decodifica `content-state` JSON con
// estas keys literales.
//
// Spec: docs/live-activities-spec.md · Plan: docs/live-activities-plan.md

export interface LiveActivityTeam {
  name: string;
  shortName: string;
  colorHex: string;
  flagEmoji?: string;
}

export interface MatchActivityAttributes {
  matchId: string;
  home: LiveActivityTeam;
  away: LiveActivityTeam;
  leagueName: string;
}

/** pre → sin timer · 1H/2H/ET → minuto corriendo (timer local del widget) ·
 *  HT → "MT" · PEN → "PENALES" (nunca avanzar reloj) · FT → "FINAL" + end. */
export type LiveActivityPhase = 'pre' | '1H' | 'HT' | '2H' | 'ET' | 'PEN' | 'FT';

export interface MatchActivityState {
  homeScore: number;
  awayScore: number;
  phase: LiveActivityPhase;
  /** Anchor del minuto — misma semántica que MatchDoc.liveClock
   *  ({periodStartedAt, periodMinuteOffset}, unix seconds). Ausente cuando la
   *  fase no corre (pre/HT/PEN/FT). */
  periodStartedAt?: number;
  periodMinuteOffset?: number;
  lastEventText?: string;
}

/** Doc de la colección `liveActivities/{autoId}`. El backend consulta
 *  where('matchId','==',id) && where('ended','==',false) en cada ciclo de poll
 *  SOLO para partidos live; purga registros con createdAt > 6 h. */
export interface LiveActivityRegistration {
  fcmToken: string;
  activityPushToken?: string; // solo iOS
  matchId: string;
  platform: 'ios' | 'android';
  userId: string;
  createdAt: FirebaseFirestore.Timestamp;
  ended?: boolean;
}
