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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, type DocumentReference } from 'firebase/firestore';
import { captureFirestoreRejection } from '../services/sentry';
import { auth, db } from '../services/firebase';
import { getSavedFCMToken } from '../services/fcmInit';
import {
  isAndroidLiveScoreSupported,
  requestLiveScorePermission,
  showOrUpdateLiveScore,
  cancelLiveScore,
  clearCanceledMarker,
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
import { getLeagueDisplayName } from '../config/leagues';
import { resolveMatchColors, teamFlagEmoji } from '../utils/teamColors';
import { translateTeamName, isNationalTeam } from '../utils/nationalTeams';
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
    case 'ETB':  return 'ET'; // break pre/entre prórroga
    case 'PEN':  return 'PEN';
    case 'SUSP':
    case 'INT':  return 'SUSP';
    default:     return '1H'; // live sin label → asumir juego corriendo
  }
}

const TICKING: ReadonlySet<LiveActivityPhase> = new Set(['1H', '2H', 'ET']);

/** uid al MOMENTO de la acción, esperando (acotado) la restauración de sesión.
 *  En arranque en frío auth.currentUser puede ser null unos segundos aunque
 *  haya sesión (anónima o real) — sin esto, un tap temprano en "Seguir"
 *  mostraba el marcador pero jamás creaba el registro remoto (UI viva pero
 *  congelada con la app cerrada). */
function getUidEventually(timeoutMs = 8000): Promise<string | null> {
  const now = auth.currentUser?.uid;
  if (now) return Promise.resolve(now);
  return new Promise(resolve => {
    const timer = setTimeout(() => { unsub(); resolve(null); }, timeoutMs);
    const unsub = onAuthStateChanged(auth, user => {
      if (user) { clearTimeout(timer); unsub(); resolve(user.uid); }
    });
  });
}

/** Id estable por INSTALACIÓN — el doc de registro es matchId_uid_deviceId.
 *  Sin el sufijo, dos dispositivos del mismo usuario siguiendo el mismo
 *  partido se robaban los tokens entre sí (el último write ganaba y el otro
 *  dispositivo dejaba de recibir updates). */
let cachedDeviceId: string | null = null;
async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const KEY = 'liveActivity.deviceId';
  try {
    let id = await AsyncStorage.getItem(KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      await AsyncStorage.setItem(KEY, id);
    }
    cachedDeviceId = id;
    return id;
  } catch {
    cachedDeviceId = 'dev0';
    return cachedDeviceId;
  }
}

/** Ruta del doc de registro para este usuario+dispositivo. null sin sesión. */
async function registrationRef(matchId: string) {
  const uid = await getUidEventually();
  if (!uid) return null;
  const deviceId = await getDeviceId();
  return { ref: doc(db, 'liveActivities', `${matchId}_${uid}_${deviceId}`), uid };
}

/** setDoc del registro con 1 reintento (5s) + reporte a Sentry. El registro
 *  remoto es lo ÚNICO que conecta la Activity local con los pushes del
 *  servidor: si esta escritura se pierde en silencio, el marcador queda vivo
 *  pero congelado con la app cerrada — nunca llega el FINAL (incidente
 *  España-Bélgica, 10 jul 2026: el reloj siguió hasta 104' tras el FT). */
async function writeRegistration(
  ref: DocumentReference,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await setDoc(ref, payload, { merge: true });
  } catch (err) {
    captureFirestoreRejection('liveActivity.register', err);
    await new Promise(r => setTimeout(r, 5000));
    try {
      await setDoc(ref, payload, { merge: true });
    } catch (err2) {
      captureFirestoreRejection('liveActivity.register.retry', err2);
      throw err2;
    }
  }
}

function teamToContract(team: Team, colorHex: string) {
  // Bandera emoji: SOLO para selecciones nacionales (los códigos cortos de
  // CLUBES colisionan con códigos FIFA — Cancún FC = "CAN" = Canadá 🇨🇦,
  // reporte del dueño 4 jul 2026); fallback al logo si ya es emoji.
  const logo = team.logo ?? '';
  const logoIsEmoji = !!logo && !isImageUri(logo) && logo !== '⚽' && logo !== '🕐';
  const flag = isNationalTeam(team.name) ? teamFlagEmoji(team.shortName) : undefined;
  return {
    name: translateTeamName(team.name),
    shortName: team.shortName,
    colorHex,
    flagEmoji: flag ?? (logoIsEmoji ? logo : undefined),
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
    leagueName: getLeagueDisplayName(match.leagueId ?? '', match.league ?? ''),
  };
}

/** Kickoff en unix seconds desde startingAtUtc ("YYYY-MM-DD HH:MM:SS" UTC). */
export function kickoffUnixSeconds(match: Match): number | undefined {
  if (!match.startingAtUtc) return undefined;
  const ms = new Date(match.startingAtUtc.replace(' ', 'T') + 'Z').getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

/** Ventana del botón: en vivo, o por comenzar dentro de ≤2 h.
 *
 *  Presupuesto ActivityKit: 8 h "activa" (reloj + pushes) + 4 h "terminada"
 *  (resultado visible, sin updates). El peor caso ACTIVO — eliminatoria con
 *  prórroga + penales exagerados — es ~3h17m desde el kickoff (el linger de 30'
 *  post-final corre en la ventana "terminada", no gasta las 8 h). Con la
 *  ventana en 2 h: 2h + 3h17m = 5h17m ≪ 8h → ~2h43m de colchón. Antes eran 4 h
 *  (sobrevivía, pero con solo 43' de margen) y además era estorbo en el lock
 *  screen. Un solo valor cubre TODO: un partido de liga sin prórroga/penales
 *  termina en ~100' — el sistema se adapta solo porque el reloj y su tope se
 *  manejan con los períodos reales de SportMonks, no con lógica "es copa". */
export function canFollowMatch(match: Match): boolean {
  if (match.status === 'live') return true;
  if (match.status !== 'scheduled') return false;
  const kickoff = kickoffUnixSeconds(match);
  if (!kickoff) return false;
  const secsToKickoff = kickoff - Date.now() / 1000;
  return secsToKickoff > -30 * 60 && secsToKickoff < 2 * 3600;
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
    leagueName: getLeagueDisplayName(match.leagueId ?? '', match.league ?? ''),
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
    // Fallback sin ancla (espejo de buildStateFromMatchDoc del server):
    // minuto estático en el widget cuando la fase corre pero SM no manda
    // el ancla del período (amistosos de bajo perfil).
    minute: !ticks && TICKING.has(phase) && typeof match.minute === 'number'
      ? match.minute
      : undefined,
    kickoffAt: phase === 'pre' ? kickoffUnixSeconds(match) : undefined,
    penHome: typeof match.homePenScore === 'number' ? match.homePenScore : undefined,
    penAway: typeof match.awayPenScore === 'number' ? match.awayPenScore : undefined,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLiveActivity(match: Match) {
  const matchId = String(match.id);

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
    // Penales: sin estas deps la tanda no se replicaba por el path local.
    match.homePenScore,
    match.awayPenScore,
    match.liveClock?.periodStartedAt,
  ]);

  // Push token de la Activity → upsert del registro en Firestore. El token
  // puede llegar tarde o rotar, por eso el doc se upsertea con merge cada vez.
  // Solo iOS: en Android el único token es el FCM del device (va en start()).
  useEffect(() => {
    if (!supported || Platform.OS !== 'ios') return;
    const sub = addPushTokenListener(async ({ matchId: tokenMatchId, token }) => {
      if (tokenMatchId !== matchId) return;
      try {
        // uid al momento del evento (el token inicial puede llegar dentro de
        // la ventana de arranque en frío, antes de que la sesión restaure).
        const reg = await registrationRef(tokenMatchId);
        if (!reg) return;
        await writeRegistration(reg.ref, {
          activityPushToken: token,
          userId: reg.uid,
          matchId: tokenMatchId,
          platform: 'ios',
          ended: false,
        });
      } catch {
        // Best-effort: sin registro remoto la Activity sigue viva localmente
        // (el usuario la ve; solo no recibiría updates con el app cerrada).
      }
    });
    return () => sub.remove();
  }, [supported, matchId]);

  /** Registro en Firestore para los pushes con app cerrada (ambas plataformas).
   *  uid al momento de la llamada (espera acotada de la sesión) + doc por
   *  dispositivo — ver getUidEventually/getDeviceId arriba. */
  const registerForRemoteUpdates = useCallback(async (platform: 'ios' | 'android') => {
    try {
      const reg = await registrationRef(matchId);
      if (!reg) return;
      const fcmToken = await getSavedFCMToken();
      await writeRegistration(reg.ref, {
        fcmToken: fcmToken ?? null,
        matchId,
        platform,
        userId: reg.uid,
        createdAt: serverTimestamp(),
        ended: false,
      });
    } catch {
      // Best-effort: sin registro remoto el marcador sigue vivo localmente
      // (solo no recibiría updates con el app cerrada).
    }
  }, [matchId]);

  const start = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    try {
      const state = buildActivityState(match);

      // ── ANDROID: notificación ongoing con cronómetro ──
      if (Platform.OS === 'android') {
        // Android 13+: sin permiso de notificaciones no hay marcador — pedirlo
        // (no-op si ya está concedido); negado → botón regresa a Desactivado.
        const granted = await requestLiveScorePermission();
        if (!granted) return false;
        // Re-follow: volver a aceptar pushes remotos de este partido.
        await clearCanceledMarker(matchId);
        await showOrUpdateLiveScore(buildLiveScoreAttributes(match), state);
        setFollowing(true);
        // Fire-and-forget: el registro espera (acotado) la sesión en cold
        // start; no bloquear el botón por ello.
        registerForRemoteUpdates('android').catch(() => {});
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
      // El activityPushToken llega por el listener; el registro base va
      // fire-and-forget (espera acotada de sesión en cold start).
      registerForRemoteUpdates('ios').catch(() => {});
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
      const reg = await registrationRef(matchId);
      if (reg) {
        await setDoc(
          reg.ref,
          { ended: true, userId: reg.uid, matchId },
          { merge: true },
        );
      }
    } catch {}
  }, [matchId, match]);

  return { supported, following, start, end };
}
