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
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { getSavedFCMToken } from '../services/fcmInit';
import { useAuth } from '../contexts/AuthContext';
import {
  isLiveActivitySupported,
  areActivitiesEnabled,
  getActiveMatchIds,
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
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLiveActivity(match: Match) {
  const { user } = useAuth();
  const matchId = String(match.id);

  const supported = isLiveActivitySupported();
  const [following, setFollowing] = useState(false);

  // Estado inicial desde ActivityKit (persiste entre reinicios del app).
  useEffect(() => {
    if (!supported) return;
    setFollowing(getActiveMatchIds().includes(matchId));
  }, [supported, matchId]);

  // Auto-sync en FOREGROUND: la pantalla del partido está suscrita a Firestore,
  // así que `match` se refresca solo; si estamos siguiendo, replicamos cada
  // cambio (pre→1H, gol, MT, FT…) a la Activity. Con la app CERRADA esto lo
  // hará el push del backend (Fase 2). Al FT terminamos (marcador final visible
  // 30 min más por la dismissal policy del módulo).
  useEffect(() => {
    if (!supported || !following) return;
    if (match.status === 'finished') {
      endMatchActivity(matchId, buildActivityState(match)).catch(() => {});
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
  useEffect(() => {
    if (!supported) return;
    const sub = addPushTokenListener(async ({ matchId: tokenMatchId, token }) => {
      if (tokenMatchId !== matchId) return;
      try {
        const userId = user?.id ?? 'guest';
        await setDoc(
          doc(db, 'liveActivities', `${tokenMatchId}_${userId}`),
          { activityPushToken: token },
          { merge: true },
        );
      } catch {
        // Best-effort: sin registro remoto la Activity sigue viva localmente
        // (el usuario la ve; solo no recibiría updates con el app cerrada).
      }
    });
    return () => sub.remove();
  }, [supported, matchId, user?.id]);

  const start = useCallback(async (): Promise<boolean> => {
    if (!supported || !areActivitiesEnabled()) return false;
    try {
      const attrs = buildActivityAttributes(match);
      const state = buildActivityState(match);
      const activityId = await startMatchActivity(attrs, state);
      if (!activityId) return false;
      setFollowing(true);

      // Registro base (el activityPushToken llega por el listener).
      try {
        const userId = user?.id ?? 'guest';
        const fcmToken = await getSavedFCMToken();
        await setDoc(
          doc(db, 'liveActivities', `${matchId}_${userId}`),
          {
            fcmToken: fcmToken ?? null,
            matchId,
            platform: 'ios',
            userId,
            createdAt: serverTimestamp(),
            ended: false,
          },
          { merge: true },
        );
      } catch {
        // Best-effort (ver arriba).
      }
      return true;
    } catch {
      return false;
    }
  }, [supported, match, matchId, user?.id]);

  const end = useCallback(async () => {
    try {
      await endMatchActivity(matchId, buildActivityState(match));
    } catch {}
    setFollowing(false);
    try {
      const userId = user?.id ?? 'guest';
      await setDoc(
        doc(db, 'liveActivities', `${matchId}_${userId}`),
        { ended: true },
        { merge: true },
      );
    } catch {}
  }, [matchId, match, user?.id]);

  return { supported, following, start, end };
}
