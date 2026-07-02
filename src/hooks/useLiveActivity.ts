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
  endMatchActivity,
  addPushTokenListener,
} from '../../modules/expo-live-activity';
import type {
  LiveActivityPhase,
  MatchActivityAttributes,
  MatchActivityState,
} from '../data/liveActivityContract';
import type { Match, Team } from '../data/types';
import { resolveMatchColors } from '../utils/teamColors';
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
  // flagEmoji solo si el "logo" es un emoji real (no URL, no placeholders).
  const logo = team.logo ?? '';
  const isEmoji = !!logo && !isImageUri(logo) && logo !== '⚽' && logo !== '🕐';
  return {
    name: translateTeamName(team.name),
    shortName: team.shortName,
    colorHex,
    flagEmoji: isEmoji ? logo : undefined,
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
