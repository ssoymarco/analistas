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
 *  HT → "MT" · PEN → "PENALES" (nunca avanzar reloj) · SUSP → "SUSPENDIDO" ·
 *  FT → "FINAL" + end. Horneado en Swift — cambios = build nuevo.
 *  Mapa desde state SM: 1T→1H · HT→HT · 2T→2H · ET→ET · PEN→PEN · SUSP/INT→SUSP. */
export type LiveActivityPhase = 'pre' | '1H' | 'HT' | '2H' | 'ET' | 'PEN' | 'SUSP' | 'FT';
export interface MatchActivityState {
    homeScore: number;
    awayScore: number;
    phase: LiveActivityPhase;
    /** Anchor del minuto — misma semántica que MatchDoc.liveClock
     *  ({periodStartedAt, periodMinuteOffset}, unix seconds). Ausente cuando la
     *  fase no corre (pre/HT/PEN/FT). */
    periodStartedAt?: number;
    periodMinuteOffset?: number;
    /** FALLBACK sin ancla de período: último minuto conocido del servidor
     *  (estático en el widget, actualizado por push). */
    minute?: number;
    /** Unix seconds del kickoff — countdown del widget en phase 'pre'. */
    kickoffAt?: number;
    /** Tanda de penales (solo cuando aplica) → "PENALES · 4-2" / "FINAL · 4-2 pen". */
    penHome?: number;
    penAway?: number;
    lastEventText?: string;
    /** ── Contrato v2 (widget rediseñado, build 1.5.0+) — todos opcionales ──────
     *  Los widgets viejos ignoran estas keys; el nuevo tolera su ausencia. */
    /** Expulsados por lado (tarjeta roja junto al escudo). */
    homeRed?: number;
    awayRed?: number;
    /** Jugadas clave de cada lado, ya redactadas: "⚽ H. Martín 52', 78'" /
     *  "🟥 R. Chávez 11'" (hasta dos renglones separados por \n). */
    homeEvents?: string;
    awayEvents?: string;
    /** Franja de estadísticas (solo partidos con estadísticas en vivo). */
    possHome?: number;
    sotHome?: number;
    sotAway?: number;
    cornersHome?: number;
    cornersAway?: number;
    yellowHome?: number;
    yellowAway?: number;
}
/** Versión del contrato que entiende el widget instalado (la reporta el módulo
 *  nativo; los binarios anteriores al rediseño no la reportan → 1). */
export declare const LIVE_ACTIVITY_CONTRACT_V2 = 2;
/** Doc de la colección `liveActivities/{autoId}`. El backend consulta
 *  where('matchId','==',id) && where('ended','==',false) en cada ciclo de poll
 *  SOLO para partidos live; purga registros con createdAt > 6 h. */
export interface LiveActivityRegistration {
    fcmToken: string;
    activityPushToken?: string;
    matchId: string;
    platform: 'ios' | 'android';
    userId: string;
    createdAt: FirebaseFirestore.Timestamp;
    ended?: boolean;
    /** Contrato del widget de ese dispositivo (ausente = 1). */
    contractVersion?: number;
}
