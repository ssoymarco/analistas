// ── ExpoLiveActivity — API JS del puente ActivityKit ─────────────────────────
//
// ⚠️ GUARD OTA CROSS-RUNTIME (mismo patrón que SubscriptionContext /
// AppIconScreen): este bundle JS se publica por OTA también a runtimes cuyo
// binario NO trae el módulo nativo (1.2.x / 1.3.0). `requireNativeModule`
// lanzaría — por eso se resuelve lazy dentro de try/catch y toda la API
// degrada a no-op con isSupported() === false. El botón "Seguir en vivo"
// simplemente no aparece en binarios viejos.

import { Platform } from 'react-native';
import type {
  MatchActivityAttributes,
  MatchActivityState,
} from '../../src/data/liveActivityContract';

type PushTokenEvent = { matchId: string; activityId: string; token: string };

interface NativeLiveActivityModule {
  isSupported(): boolean;
  areActivitiesEnabled(): boolean;
  getActiveMatchIds(): string[];
  prepareTeamCrests(
    matchId: string,
    homeUrl: string | null,
    awayUrl: string | null,
  ): Promise<[boolean, boolean]>;
  startMatchActivity(attrsJson: string, stateJson: string): Promise<string>;
  updateMatchActivity(matchId: string, stateJson: string): Promise<void>;
  endMatchActivity(matchId: string, finalStateJson: string | null): Promise<void>;
  addListener(
    event: 'onActivityPushToken',
    listener: (e: PushTokenEvent) => void,
  ): { remove: () => void };
}

let native: NativeLiveActivityModule | null = null;
if (Platform.OS === 'ios') {
  try {
    // Lazy require para que Metro no lo resuelva en runtimes sin el módulo.
    const { requireNativeModule } = require('expo-modules-core');
    native = requireNativeModule('ExpoLiveActivity');
  } catch {
    native = null; // binario sin el módulo (runtime viejo) → feature apagada
  }
}

/** true solo si: iOS + binario con el módulo + iOS 16.2+. */
export function isLiveActivitySupported(): boolean {
  try {
    return !!native && native.isSupported();
  } catch {
    return false;
  }
}

/** El usuario puede tener las Live Activities apagadas en Ajustes de iOS. */
export function areActivitiesEnabled(): boolean {
  try {
    return !!native && native.areActivitiesEnabled();
  } catch {
    return false;
  }
}

/** matchIds con Activity viva (persiste entre reinicios del app). */
export function getActiveMatchIds(): string[] {
  try {
    return native ? native.getActiveMatchIds() : [];
  } catch {
    return [];
  }
}

/** Descarga los escudos al App Group (best-effort) ANTES de iniciar la
 *  Activity — el widget no puede hacer red; los lee del contenedor. */
export async function prepareTeamCrests(
  matchId: string,
  homeUrl: string | null,
  awayUrl: string | null,
): Promise<void> {
  if (!native) return;
  try {
    await native.prepareTeamCrests(matchId, homeUrl, awayUrl);
  } catch {
    // Sin escudos el widget cae a bandera emoji / punto de color.
  }
}

/** Inicia (o reutiliza) la Activity del partido. Devuelve activityId. */
export async function startMatchActivity(
  attrs: MatchActivityAttributes,
  state: MatchActivityState,
): Promise<string | null> {
  if (!native) return null;
  return native.startMatchActivity(JSON.stringify(attrs), JSON.stringify(state));
}

/** Update local (foreground). Los updates remotos van por APNs. */
export async function updateMatchActivity(
  matchId: string,
  state: MatchActivityState,
): Promise<void> {
  if (!native) return;
  return native.updateMatchActivity(matchId, JSON.stringify(state));
}

/** Termina la Activity (marcador final visible 30 min más). */
export async function endMatchActivity(
  matchId: string,
  finalState?: MatchActivityState,
): Promise<void> {
  if (!native) return;
  return native.endMatchActivity(
    matchId,
    finalState ? JSON.stringify(finalState) : null,
  );
}

/** Push token de la Activity (puede rotar — upsertear registro cada vez). */
export function addPushTokenListener(
  listener: (e: PushTokenEvent) => void,
): { remove: () => void } {
  if (!native) return { remove: () => {} };
  try {
    return native.addListener('onActivityPushToken', listener);
  } catch {
    return { remove: () => {} };
  }
}
