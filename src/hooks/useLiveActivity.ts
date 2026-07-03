// ── useLiveActivity — "Seguir en vivo" en pantalla de bloqueo ─────────────────
//
// Orquesta la Live Activity de un partido:
//   1. start() → inicia la Activity nativa (ActivityKit) con attrs/state
//      construidos desde `Match` (colores de teamColors, nombres traducidos,
//      anchor de minuto = Match.liveClock, misma semántica que
//      computeLiveMinuteSeconds).
//   2. Registra en Firestore `liveActivities/{matchId_userId}` el fcmToken del
//      device + el push token de la Activity (llega asíncrono y puede rotar →
//      upsert con merge). El backend (Fase 2) empuja updates por ese registro.
//   3. end() → termina la Activity y marca el registro como ended.
//
// GRATIS para todos — sin checks de premium (decisión de producto).
// En binarios sin el módulo nativo (runtimes OTA viejos) `supported` es false
// y el botón nunca se renderiza.

import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { getSavedFCMToken } from '../services/fcmInit';
import {
  isAndroidLiveScoreSupported,
  showOrUpdateLiveScore,
  cancelLiveScore,
  isLiveScoreDisplayed,
  type LiveScoreAttributes,
} from '../services/liveScoreNotification';
import {
  isLiveActivitySupported,
  areActivitiesEnabled,
  getActiveMatchIds,
  prepareTeamCrests,
  startMatchActivity,
  updateMatchActivity,
  endMatchActivity,
  addPushTokenListener,
} from '../../modules/expo-live-activity';
import type {
  LiveActivityPhase,
  MatchActivityAttributes,
  MatchActivityState,
} from '../data/liveActivityContract';
import type { Match, Team } from '../data/types';
import { resolveMatchColors, teamFlagEmoji } from '../utils/teamColors';
import { translateTeamName } from '../utils/nationalTeams';
import { isImageUri } from '../utils/imageUri';

// ── Mapeos Match → contrato ───────────────────────────────────────────────────

/** Match.stateLabel ('1T'|'HT'|'2T'|'ET'|'PEN'|'SUSP'|'INT') + status → phase. */
export function phaseFromMatch(match: Match): LiveActivityPhase {
  if (match.status === 'finished') return 'FT';
  if (match.status === 'scheduled') return 'pre';
  if (match.status === 'interrupted') return 'SUSP';
  switch (match.stateLabel) {
    case '1T':   return '1H';
    case 'HT':   return 'HT';
    case '2T':   return '2H';
    case 'ET':   return 'ET';
    case 'PEN':  return 'PEN';
    case 'SUSP':
    case 'INT':  return 'SUSP';
    default:     return '1H'; // live sin label → asumir juego corriendo
  }
}

const TICKING: ReadonlySet<LiveActivityPhase> = new Set(['1H', '2H', 'ET']);

function teamToContract(team: Team, colorHex: string) {
  // Bandera emoji: primero por código FIFA (selecciones — WidgetKit no baja
  // imágenes, pero los emoji son texto); fallback al logo si ya es emoji.
  const logo = team.logo ?? '';
  const logoIsEmoji = !!logo && !isImageUri(logo) && logo !== '⚽' && logo !== '🕐';
  return {
    name: translateTeamName(team.name),
    shortName: team.shortName,
    colorHex,
    flagEmoji: teamFlagEmoji(team.shortName) ?? (logoIsEmoji ? logo : undefined),
  };
}

export function buildActivityAttributes(match: Match): MatchActivityAttributes {
  const { home, away } = resolveMatchColors(
    match.homeTeam.shortName,
    match.awayTeam.shortName,
  );
  return {
    matchId: String(match.id),
    home: teamToContract(match.homeTeam, home),
    away: teamToContract(match.awayTeam, away),
    leagueName: match.league,
  };
}

/** Kickoff en unix seconds desde startingAtUtc ("YYYY-MM-DD HH:MM:SS" UTC). */
export function kickoffUnixSeconds(match: Match): number | undefined {
  if (!match.startingAtUtc) return undefined;
  const ms = new Date(match.startingAtUtc.replace(' ', 'T') + 'Z').getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

/** Ventana del botón: en vivo, o por comenzar dentro de ≤4 h (el presupuesto
 *  de ~8 h de una Live Activity cubre previa + partido completo de sobra). */
export function canFollowMatch(match: Match): boolean {
  if (match.status === 'live') return true;
  if (match.status !== 'scheduled') return false;
  const kickoff = kickoffUnixSeconds(match);
  if (!kickoff) return false;
  const secsToKickoff = kickoff - Date.now() / 1000;
  return secsToKickoff > -30 * 60 && secsToKickoff < 4 * 3600;
}

/** Attributes para la notificación Android (subset con logos URL — la
 *  notificación sí puede cargar imágenes remotas, a diferencia de WidgetKit). */
export function buildLiveScoreAttributes(match: Match): LiveScoreAttributes {
  return {
    matchId: String(match.id),
    home: {
      name: match.homeTeam.name,
      shortName: match.homeTeam.shortName,
      logo: match.homeTeam.logo,
    },
    away: {
      name: match.awayTeam.name,
      shortName: match.awayTeam.shortName,
      logo: match.awayTeam.logo,
    },
    leagueName: match.league,
  };
}

export function buildActivityState(match: Match): MatchActivityState {
  const phase = phaseFromMatch(match);
  const anchor = match.liveClock;
  const ticks = TICKING.has(phase) && !!anchor && anchor.periodStartedAt > 0;
  return {
    homeScore: match.homeScore ?? 0,
    awayScore: match.awayScore ?? 0,
    phase,
    periodStartedAt: ticks ? anchor!.periodStartedAt : undefined,
    periodMinuteOffset: ticks ? anchor!.periodMinuteOffset : undefined,
    kickoffAt: phase === 'pre' ? kickoffUnixSeconds(match) : undefined,
    penHome: typeof match.homePenScore === 'number' ? match.homePenScore : undefined,
    penAway: typeof match.awayPenScore === 'number' ? match.awayPenScore : undefined,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLiveActivity(match: Match) {
  const matchId = String(match.id);
  // uid REAL de Firebase Auth — los invitados también lo tienen (anonymous
  // auth). Las reglas exigen userId == request.auth.uid; sin uid no hay
  // registro remoto (la Activity funciona local igualmente).
  const uid = auth.currentUser?.uid ?? null;

  // iOS → ActivityKit (Live Activity real). Android → notificación ongoing
  // con cronómetro (notifee). Ambos requieren binario 1.4.0+ (guards OTA).
  const supported =
    Platform.OS === 'ios' ? isLiveActivitySupported() : isAndroidLiveScoreSupported();
  const [following, setFollowing] = useState(false);

  // Estado inicial (persiste entre reinicios del app): iOS pregunta a
  // ActivityKit; Android busca la notificación desplegada.
  useEffect(() => {
    if (!supported) return;
    if (Platform.OS === 'ios') {
      setFollowing(getActiveMatchIds().includes(matchId));
      return;
    }
    let alive = true;
    isLiveScoreDisplayed(matchId).then(shown => {
      if (alive) setFollowing(shown);
    });
    return () => { alive = false; };
  }, [supported, matchId]);

  // Auto-sync en FOREGROUND: la pantalla del partido está suscrita a Firestore,
  // así que `match` se refresca solo; si estamos siguiendo, replicamos cada
  // cambio (pre→1H, gol, MT, FT…) a la Activity. Con la app CERRADA esto lo
  // hará el push del backend (Fase 2). Al FT terminamos (marcador final visible
  // 30 min más por la dismissal policy del módulo).
  useEffect(() => {
    if (!supported || !following) return;
    if (Platform.OS === 'android') {
      // Android: la notificación se actualiza con el mismo estado; en FT el
      // servicio la vuelve descartable (equivalente del linger de iOS).
      showOrUpdateLiveScore(
        buildLiveScoreAttributes(match),
        buildActivityState(match),
      ).catch(() => {});
      return;
    }
    if (match.status === 'finished') {
      // Fin natural: dejar el marcador final visible un rato (linger 10 min).
      endMatchActivity(matchId, buildActivityState(match), false).catch(() => {});
      return;
    }
    updateMatchActivity(matchId, buildActivityState(match)).catch(() => {});
  }, [
    supported,
    following,
    matchId,
    match.status,
    match.stateLabel,
    match.homeScore,
    match.awayScore,
    match.liveClock?.periodStartedAt,
  ]);

  // Push token de la Activity → upsert del registro en Firestore. El token
  // puede llegar tarde o rotar, por eso el doc se upsertea con merge cada vez.
  // Solo iOS: en Android el único token es el FCM del device (va en start()).
  useEffect(() => {
    if (!supported || Platform.OS !== 'ios') return;
    const sub = addPushTokenListener(async ({ matchId: tokenMatchId, token }) => {
      if (tokenMatchId !== matchId || !uid) return;
      try {
        await setDoc(
          doc(db, 'liveActivities', `${tokenMatchId}_${uid}`),
          { activityPushToken: token, userId: uid, matchId: tokenMatchId },
          { merge: true },
        );
      } catch {
        // Best-effort: sin registro remoto la Activity sigue viva localmente
        // (el usuario la ve; solo no recibiría updates con el app cerrada).
      }
    });
    return () => sub.remove();
  }, [supported, matchId, uid]);

  /** Registro en Firestore para los pushes con app cerrada (ambas plataformas). */
  const registerForRemoteUpdates = useCallback(async (platform: 'ios' | 'android') => {
    try {
      if (!uid) return;
      const fcmToken = await getSavedFCMToken();
      await setDoc(
        doc(db, 'liveActivities', `${matchId}_${uid}`),
        {
          fcmToken: fcmToken ?? null,
          matchId,
          platform,
          userId: uid,
          createdAt: serverTimestamp(),
          ended: false,
        },
        { merge: true },
      );
    } catch {
      // Best-effort: sin registro remoto el marcador sigue vivo localmente
      // (solo no recibiría updates con el app cerrada).
    }
  }, [matchId, uid]);

  const start = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    try {
      const state = buildActivityState(match);

      // ── ANDROID: notificación ongoing con cronómetro ──
      if (Platform.OS === 'android') {
        await showOrUpdateLiveScore(buildLiveScoreAttributes(match), state);
        setFollowing(true);
        await registerForRemoteUpdates('android');
        return true;
      }

      // ── iOS: Live Activity (ActivityKit) ──
      if (!areActivitiesEnabled()) return false;
      const attrs = buildActivityAttributes(match);

      // Escudos reales (clubes y selecciones con crest URL): descargarlos al
      // App Group ANTES de iniciar, para que el widget ya los encuentre en el
      // primer render. Best-effort — fallback: bandera emoji / punto de color.
      const homeUrl = isImageUri(match.homeTeam.logo) ? match.homeTeam.logo : null;
      const awayUrl = isImageUri(match.awayTeam.logo) ? match.awayTeam.logo : null;
      if (homeUrl || awayUrl) {
        await prepareTeamCrests(matchId, homeUrl, awayUrl);
      }

      const activityId = await startMatchActivity(attrs, state);
      if (!activityId) return false;
      setFollowing(true);
      // El activityPushToken llega por el listener; el registro base va ya.
      await registerForRemoteUpdates('ios');
      return true;
    } catch {
      return false;
    }
  }, [supported, match, matchId, registerForRemoteUpdates]);

  const end = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        // Toggle manual → la notificación se retira al instante.
        await cancelLiveScore(matchId);
      } else {
        // Toggle manual del usuario → la Activity desaparece AL INSTANTE de
        // lock screen e Isla (immediate), no linger.
        await endMatchActivity(matchId, buildActivityState(match), true);
      }
    } catch {}
    setFollowing(false);
    try {
      if (uid) {
        await setDoc(
          doc(db, 'liveActivities', `${matchId}_${uid}`),
          { ended: true, userId: uid, matchId },
          { merge: true },
        );
      }
    } catch {}
  }, [matchId, match, uid]);

  return { supported, following, start, end };
}
