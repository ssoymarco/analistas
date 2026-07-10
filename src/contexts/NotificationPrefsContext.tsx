import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { captureFirestoreRejection } from '../services/sentry';
import { cancelAllNotificationsForMatch, PUSH_TOKEN_KEY } from '../services/notifications';
import { subscribeMatchMute, unsubscribeMatchMute } from '../services/fcmTopics';

export interface NotificationPrefs {
  /** Master kill-switch. When `false`, no notification is dispatched
   *  regardless of the per-event toggles below. Phrased positively so the
   *  UI label reads naturally ("Recibir notificaciones" ON by default). */
  notificationsEnabled: boolean;
  /** ⏰ Pre-match reminder — fires `matchReminderMinutes` before kickoff
   *  for followed matches. */
  matchReminder: boolean;
  /** How many minutes before kickoff the reminder fires (5 | 15 | 30). */
  matchReminderMinutes: number;
  goals: boolean;
  matchStart: boolean;
  halftime: boolean;
  matchEnd: boolean;
  lineups: boolean;
  yellowCards: boolean;
  redCards: boolean;
  substitutions: boolean;
  var: boolean;
  /** 🏟️ Modo Estadio: retrasa notificaciones de eventos en vivo */
  estadioMode: boolean;
  /** Delay in minutes when Modo Estadio is active (1 | 2 | 5 | 10) */
  estadioDelay: number;
  // ── 😈 Modo Rival — which "bad news" about rival teams to receive ──────────
  /** Rival lost a match (covers normal losses AND goleadas). */
  rivalResult: boolean;
  /** A rival player was sent off. */
  rivalRedCard: boolean;
  /** Rival missed a penalty (in-play). */
  rivalPenMiss: boolean;
}

/** Subset of NotificationPrefs that the user can override on a per-match
 *  basis from the bell in MatchDetailScreen. Excludes things that don't
 *  make sense per-match (notificationsEnabled is global, estadioMode has
 *  its own per-match API, reminder/estadio delays are minute values). */
export type MatchEventPrefKey =
  | 'matchReminder' | 'goals' | 'matchStart' | 'halftime' | 'matchEnd'
  | 'lineups' | 'yellowCards' | 'redCards' | 'substitutions' | 'var';

export const MATCH_EVENT_KEYS: MatchEventPrefKey[] = [
  'matchReminder', 'goals', 'matchStart', 'halftime', 'matchEnd',
  'lineups', 'redCards', 'yellowCards', 'substitutions', 'var',
];

export type MatchEventOverrides = Record<string /* matchId */, Partial<Record<MatchEventPrefKey, boolean>>>;

// Defaults aligned with the notification spec the user signed off on
// 2026-05-28 (see also functions/src/detect-changes.ts).
//
// CORE EVENTS — on by default:
//   goals, matchStart, halftime, matchEnd, redCards, var
//
// OPT-IN — off by default (too noisy / niche for first-time users):
//   yellowCards, substitutions, lineups, matchReminder
//
// Modo Estadio defaults off; delay default = 2 min (the second of the four
// presets shown in the UI: 1 / 2 / 5 / 10).
const DEFAULT_PREFS: NotificationPrefs = {
  notificationsEnabled: true,
  matchReminder: false,
  matchReminderMinutes: 15,
  goals: true, matchStart: true, halftime: true,
  matchEnd: true, lineups: false,
  yellowCards: false, redCards: true,
  substitutions: false, var: true,
  estadioMode: false,
  estadioDelay: 2,
  rivalResult: true,
  rivalRedCard: true,
  rivalPenMiss: true,
};

interface NotificationPrefsContextType {
  prefs: NotificationPrefs;
  /** True once prefs have been read from AsyncStorage (the multiGet resolved).
   *  Until then, `prefs` is DEFAULT_PREFS (estadioMode:false → bucket 'd0').
   *  SAFETY-CRITICAL for FCM: the authoritative reconcile must NOT run before
   *  this is true, or it would unsubscribe the user's correct delay-bucket
   *  topics thinking the default 'd0' is the truth. See FavoritesContext. */
  isHydrated: boolean;
  togglePref: (key: keyof Pick<NotificationPrefs, 'notificationsEnabled' | 'matchReminder' | 'goals' | 'matchStart' | 'halftime' | 'matchEnd' | 'lineups' | 'yellowCards' | 'redCards' | 'substitutions' | 'var' | 'estadioMode' | 'rivalResult' | 'rivalRedCard' | 'rivalPenMiss'>) => void;
  /** Actualiza varias prefs de un golpe (toggles agrupados de la UI honesta). */
  updatePrefs: (partial: Partial<NotificationPrefs>) => void;
  /** Set the Modo Estadio delay in minutes */
  setEstadioDelay: (minutes: number) => void;
  /** Set how many minutes before kickoff the match reminder fires */
  setMatchReminderMinutes: (minutes: number) => void;
  mutedMatchIds: Set<string>;
  toggleMatchMute: (matchId: string) => void;
  isMatchMuted: (matchId: string) => boolean;
  /** Per-match Modo Estadio — overrides global setting for a specific match */
  estadioMatchIds: Set<string>;
  toggleMatchEstadio: (matchId: string) => void;
  isMatchEstadio: (matchId: string) => boolean;
  /** Per-match delay in minutes. Falls back to prefs.estadioDelay if not set. */
  estadioMatchDelays: Record<string, number>;
  setMatchEstadioDelay: (matchId: string, minutes: number) => void;
  getMatchEstadioDelay: (matchId: string) => number;
  /** Per-match event overrides — let the user customize a single match
   *  without affecting their global preferences. Missing keys fall back to
   *  the global pref. */
  matchEventOverrides: MatchEventOverrides;
  setMatchEventOverride: (matchId: string, key: MatchEventPrefKey, value: boolean) => void;
  clearMatchEventOverride: (matchId: string, key: MatchEventPrefKey) => void;
  clearAllMatchEventOverrides: (matchId: string) => void;
  /** Returns the effective bool for an event on a given match — override if
   *  set, otherwise the global pref. */
  getEffectiveMatchEventPref: (matchId: string, key: MatchEventPrefKey) => boolean;
  /** Whether the user has set any per-event override OR muted this match. */
  hasMatchCustomization: (matchId: string) => boolean;
  /** Expo Push Token — null until permissions are granted */
  pushToken: string | null;
  setPushToken: (token: string | null) => void;
  /** Permission status — 'undetermined' until the OS dialog has been shown */
  permissionStatus: 'undetermined' | 'granted' | 'denied';
  setPermissionStatus: (status: 'undetermined' | 'granted' | 'denied') => void;
}

// ── Puente para la acción "Silenciar este partido" de la notificación ───────
// iOS entrega la acción (long-press → botón) despertando la app en background
// — a veces sin montar React. Si el provider está vivo, actualiza su estado;
// si no, persiste directo a AsyncStorage + suscribe el topic de mute, y el
// provider lo hidrata en el próximo arranque. (Fase 3 de la auditoría,
// 10 jul 2026.)
let externalMuteHandler: ((matchId: string) => void) | null = null;

export function requestMatchMuteFromNotification(matchId: string): void {
  if (externalMuteHandler) {
    externalMuteHandler(matchId);
    return;
  }
  // Provider no montado (background wake): camino directo e idempotente.
  AsyncStorage.getItem(MUTED_KEY)
    .then(raw => {
      const arr: string[] = raw ? JSON.parse(raw) : [];
      if (!arr.includes(matchId)) {
        arr.push(matchId);
        return AsyncStorage.setItem(MUTED_KEY, JSON.stringify(arr));
      }
      return undefined;
    })
    .catch(() => {});
  subscribeMatchMute(matchId).catch(() => {});
}

const NotificationPrefsContext = createContext<NotificationPrefsContextType>({
  prefs: DEFAULT_PREFS,
  isHydrated: false,
  togglePref: () => {},
  updatePrefs: () => {},
  setEstadioDelay: () => {},
  setMatchReminderMinutes: () => {},
  mutedMatchIds: new Set(),
  toggleMatchMute: () => {},
  isMatchMuted: () => false,
  estadioMatchIds: new Set(),
  toggleMatchEstadio: () => {},
  isMatchEstadio: () => false,
  estadioMatchDelays: {},
  setMatchEstadioDelay: () => {},
  getMatchEstadioDelay: () => 2,
  matchEventOverrides: {},
  setMatchEventOverride: () => {},
  clearMatchEventOverride: () => {},
  clearAllMatchEventOverrides: () => {},
  getEffectiveMatchEventPref: () => true,
  hasMatchCustomization: () => false,
  pushToken: null,
  setPushToken: () => {},
  permissionStatus: 'undetermined',
  setPermissionStatus: () => {},
});

// Exportadas: fcmInit.ts las lee directo de AsyncStorage para filtrar los
// pushes de FOREGROUND por prefs/mute/overrides (el onMessage vive fuera del
// árbol de React y no puede usar el hook).
export const PREFS_KEY     = 'analistas_notif_prefs';
export const MUTED_KEY     = 'analistas_muted_matches';
export const OVERRIDES_KEY = 'analistas_match_event_overrides';
const ESTADIO_KEY        = 'analistas_estadio_matches';
const ESTADIO_DELAYS_KEY = 'analistas_estadio_delays';
const PERM_KEY           = 'analistas_notif_permission';

export function NotificationPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [mutedMatchIds, setMutedMatchIds] = useState<Set<string>>(new Set());
  const [estadioMatchIds, setEstadioMatchIds] = useState<Set<string>>(new Set());
  const [estadioMatchDelays, setEstadioMatchDelays] = useState<Record<string, number>>({});
  const [matchEventOverrides, setMatchEventOverrides] = useState<MatchEventOverrides>({});
  const [pushToken, setPushTokenState] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatusState] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');
  // Flips true once the AsyncStorage multiGet below resolves. Gates the
  // authoritative FCM reconcile (FavoritesContext) so it never runs with the
  // pre-hydration default bucket.
  const [isHydrated, setIsHydrated] = useState(false);

  // Stable refs so the cross-device Firestore sync writes the latest values
  // without re-creating the effect on every state change.
  const prefsRef = useRef<NotificationPrefs>(DEFAULT_PREFS);
  const uidRef   = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);
  useEffect(() => { tokenRef.current = pushToken; }, [pushToken]);

  /** Guarda el token FCM del dispositivo en users/{uid}.pushToken (solo
   *  usuarios logueados). Habilita pushes dirigidos/masivos desde el backend —
   *  la key ya estaba permitida en las rules pero NUNCA se escribía, por eso
   *  el 3 jul 2026 no hubo forma de avisar a los usuarios afectados por el bug
   *  de favoritos. Fire-and-forget, con espera al doc (ver nota abajo). */
  const syncPushTokenToCloud = useCallback((token: string) => {
    const uid = uidRef.current;
    if (!uid) return;
    const userRef = doc(db, 'users', uid);
    const write = () => setDoc(userRef, { pushToken: token }, { merge: true });
    write().catch(err => {
      // ⚠️ El 4 jul 2026 esto infló Sentry con ~1.5K "permission-denied" en un
      // día: un solo retry a 2.5s fijos no alcanzaba a cubrir la MISMA carrera
      // que AuthContext.ensureUserProfile YA documenta como esperada — el
      // token de Auth tarda en propagarse a Firestore en el primer login, y
      // el doc users/{uid} genuinamente no existe todavía (setDoc+merge sobre
      // un doc inexistente ES un create, que las rules rechazan sin
      // displayName/createdAt). Fix: esperar a que el doc EXISTA (onSnapshot,
      // hasta 20s) en vez de un timeout fijo — igual que la migración de
      // favoritos. Solo se reporta si de verdad nunca llegó a existir.
      if ((err as { code?: string })?.code !== 'permission-denied') {
        captureFirestoreRejection('pushToken.persist', err);
        return;
      }
      const timer = setTimeout(() => { unsub(); }, 20000);
      const unsub = onSnapshot(userRef, snap => {
        if (snap.exists()) {
          clearTimeout(timer); unsub();
          write().catch(e2 => captureFirestoreRejection('pushToken.persist', e2));
        }
      }, () => clearTimeout(timer));
    });
  }, []);

  /** Persist the full prefs object to Firestore under users/{uid}.notificationPrefs.
   *  Fire-and-forget — UI must never block on cloud sync. */
  const syncPrefsToCloud = useCallback((next: NotificationPrefs) => {
    const uid = uidRef.current;
    if (!uid) return;
    const userRef = doc(db, 'users', uid);
    const write = () => setDoc(userRef, { notificationPrefs: next }, { merge: true });
    write().catch(err => {
      // setDoc(merge) sobre un users/{uid} que aún NO existe ES un create para
      // las rules (exigen displayName/createdAt) → rechazado durante la
      // ventana del primer sign-in mientras ensureUserProfile crea el doc.
      // Un timeout fijo de 2.5s no alcanzaba a cubrir esta carrera (infló
      // Sentry con pushToken.persist el 4 jul 2026, mismo patrón) — esperar
      // a que el doc EXISTA (onSnapshot, hasta 20s) en vez de adivinar un
      // tiempo fijo. Solo se reporta si de verdad nunca llegó a existir.
      if ((err as { code?: string })?.code !== 'permission-denied') {
        captureFirestoreRejection('notifPrefs.persist', err);
        return;
      }
      const timer = setTimeout(() => { unsub(); }, 20000);
      const unsub = onSnapshot(userRef, snap => {
        if (snap.exists()) {
          clearTimeout(timer); unsub();
          write().catch(e2 => captureFirestoreRejection('notifPrefs.persist', e2));
        }
      }, () => clearTimeout(timer));
    });
  }, []);

  useEffect(() => {
    AsyncStorage.multiGet([PREFS_KEY, MUTED_KEY, ESTADIO_KEY, ESTADIO_DELAYS_KEY, OVERRIDES_KEY, PUSH_TOKEN_KEY, PERM_KEY]).then(
      ([[, rawPrefs], [, rawMuted], [, rawEstadio], [, rawDelays], [, rawOverrides], [, savedToken], [, savedPerm]]) => {
        if (rawPrefs) {
          try {
            const parsed = { ...DEFAULT_PREFS, ...JSON.parse(rawPrefs) } as NotificationPrefs;
            // Migración (auditoría 10 jul 2026): la UI ofrecía retraso de
            // "1 min", que suscribía al bucket d1 — un bucket que el servidor
            // JAMÁS publica → silencio total. Se elimina la opción y cualquier
            // valor almacenado < 2 se normaliza a 2.
            if (parsed.estadioDelay < 2) {
              parsed.estadioDelay = 2;
              AsyncStorage.setItem(PREFS_KEY, JSON.stringify(parsed)).catch(() => {});
            }
            setPrefs(parsed);
          } catch {}
        }
        if (rawMuted) {
          try { setMutedMatchIds(new Set(JSON.parse(rawMuted))); } catch {}
        }
        if (rawEstadio) {
          try { setEstadioMatchIds(new Set(JSON.parse(rawEstadio))); } catch {}
        }
        if (rawDelays) {
          try { setEstadioMatchDelays(JSON.parse(rawDelays)); } catch {}
        }
        if (rawOverrides) {
          try { setMatchEventOverrides(JSON.parse(rawOverrides)); } catch {}
        }
        if (savedToken) setPushTokenState(savedToken);
        if (savedPerm === 'granted' || savedPerm === 'denied') {
          setPermissionStatusState(savedPerm);
        }
        // Mark hydrated AFTER all setState calls above so any reconcile that
        // keys off isHydrated reads the loaded prefs (correct delay bucket),
        // never the DEFAULT_PREFS 'd0'.
        setIsHydrated(true);
      },
    ).catch(() => {
      // Even on read failure we must unblock the reconcile; it will use
      // DEFAULT_PREFS (Modo Estadio off) which is the safe fallback.
      setIsHydrated(true);
    });
  }, []);

  const togglePref = useCallback((key: keyof NotificationPrefs) => {
    setPrefs(p => {
      const next = { ...p, [key]: !p[key] };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
      syncPrefsToCloud(next);
      return next;
    });
  }, [syncPrefsToCloud]);

  /** Actualiza varias prefs de un golpe — usado por los toggles agrupados de
   *  la UI honesta (p. ej. "Tarjetas" = yellowCards + redCards juntas, que es
   *  la granularidad REAL del topic team_X_cards). */
  const updatePrefs = useCallback((partial: Partial<NotificationPrefs>) => {
    setPrefs(p => {
      const next = { ...p, ...partial };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
      syncPrefsToCloud(next);
      return next;
    });
  }, [syncPrefsToCloud]);

  const setEstadioDelay = useCallback((minutes: number) => {
    setPrefs(p => {
      // Solo retrasos con bucket real en el servidor (d2/d5/d10) — ver
      // bucketForDelay en fcmTopics.ts. Un valor < 2 suscribiría a un bucket
      // fantasma y silenciaría todo.
      const next = { ...p, estadioDelay: Math.max(2, minutes) };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
      syncPrefsToCloud(next);
      return next;
    });
  }, [syncPrefsToCloud]);

  const setMatchReminderMinutes = useCallback((minutes: number) => {
    setPrefs(p => {
      const next = { ...p, matchReminderMinutes: minutes };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
      syncPrefsToCloud(next);
      return next;
    });
  }, [syncPrefsToCloud]);

  // ── Firestore cross-device sync ─────────────────────────────────────────────
  // On non-anonymous auth, pull cloud prefs as authoritative and overwrite the
  // local cache. After that, every togglePref / setEstadioDelay /
  // setMatchReminderMinutes also writes to Firestore via syncPrefsToCloud.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async fbUser => {
      const newUid = (fbUser && !fbUser.isAnonymous) ? fbUser.uid : null;
      if (newUid === uidRef.current) return;
      uidRef.current = newUid;
      if (!newUid) return; // guest — AsyncStorage is the source of truth

      try {
        const snap = await getDoc(doc(db, 'users', newUid));
        const remote = snap.exists()
          ? (snap.data() as { notificationPrefs?: Partial<NotificationPrefs> }).notificationPrefs
          : null;
        if (remote && Object.keys(remote).length > 0) {
          // Cloud wins on first sync. Merge over DEFAULT_PREFS so any
          // newly-introduced fields (added to the schema after the user's
          // last save) default to the new default rather than being undefined.
          const merged: NotificationPrefs = { ...DEFAULT_PREFS, ...remote };
          if (merged.estadioDelay < 2) merged.estadioDelay = 2; // bucket d1 no existe en el server
          setPrefs(merged);
          AsyncStorage.setItem(PREFS_KEY, JSON.stringify(merged)).catch(() => {});
        } else {
          // No cloud entry yet — push the current local prefs up so the user's
          // setup survives a reinstall / cross-device sign-in.
          syncPrefsToCloud(prefsRef.current);
        }
        // El token puede haberse obtenido ANTES del sign-in (arranque como
        // invitado) — subirlo ahora que hay uid.
        if (tokenRef.current) syncPushTokenToCloud(tokenRef.current);
      } catch {/* offline — keep local prefs */}
    });
    return unsub;
  }, [syncPrefsToCloud]);

  const toggleMatchMute = useCallback((matchId: string) => {
    setMutedMatchIds(prev => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
        // Fase 2 (10 jul 2026): reabrir el grifo — el servidor deja de
        // excluirnos de los envíos de este partido.
        unsubscribeMatchMute(matchId).catch(() => {});
      } else {
        next.add(matchId);
        // Cancel any scheduled local notifications for this match
        cancelAllNotificationsForMatch(matchId).catch(() => {});
        // Fase 2: suscribirse al topic mute_{matchId} — el servidor agrega
        // "&& !('mute_X' in topics)" a cada envío del partido, así el
        // silencio funciona TAMBIÉN con la app cerrada (antes el mute era
        // un flag local que nada consultaba — auditoría 10 jul 2026).
        subscribeMatchMute(matchId).catch(() => {});
      }
      AsyncStorage.setItem(MUTED_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const isMatchMuted = useCallback(
    (matchId: string) => mutedMatchIds.has(matchId),
    [mutedMatchIds],
  );

  // Registro del puente para la acción de notificación (mute idempotente —
  // NO toggle: si el partido ya estaba silenciado, se queda silenciado).
  useEffect(() => {
    externalMuteHandler = (matchId: string) => {
      setMutedMatchIds(prev => {
        if (prev.has(matchId)) return prev;
        const next = new Set(prev);
        next.add(matchId);
        AsyncStorage.setItem(MUTED_KEY, JSON.stringify([...next])).catch(() => {});
        return next;
      });
      subscribeMatchMute(matchId).catch(() => {});
      cancelAllNotificationsForMatch(matchId).catch(() => {});
    };
    return () => { externalMuteHandler = null; };
  }, []);

  const toggleMatchEstadio = useCallback((matchId: string) => {
    setEstadioMatchIds(prev => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      AsyncStorage.setItem(ESTADIO_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const isMatchEstadio = useCallback(
    (matchId: string) => estadioMatchIds.has(matchId),
    [estadioMatchIds],
  );

  const setMatchEstadioDelay = useCallback((matchId: string, minutes: number) => {
    setEstadioMatchDelays(prev => {
      const next = { ...prev, [matchId]: minutes };
      AsyncStorage.setItem(ESTADIO_DELAYS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const getMatchEstadioDelay = useCallback(
    (matchId: string) => estadioMatchDelays[matchId] ?? prefs.estadioDelay,
    [estadioMatchDelays, prefs.estadioDelay],
  );

  // ── Per-match event overrides ───────────────────────────────────────────
  const persistOverrides = useCallback((next: MatchEventOverrides) => {
    AsyncStorage.setItem(OVERRIDES_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const setMatchEventOverride = useCallback(
    (matchId: string, key: MatchEventPrefKey, value: boolean) => {
      setMatchEventOverrides(prev => {
        const matchPrev = prev[matchId] ?? {};
        const next: MatchEventOverrides = {
          ...prev,
          [matchId]: { ...matchPrev, [key]: value },
        };
        persistOverrides(next);
        return next;
      });
    },
    [persistOverrides],
  );

  const clearMatchEventOverride = useCallback(
    (matchId: string, key: MatchEventPrefKey) => {
      setMatchEventOverrides(prev => {
        const matchPrev = prev[matchId];
        if (!matchPrev || !(key in matchPrev)) return prev;
        const { [key]: _drop, ...rest } = matchPrev;
        const next: MatchEventOverrides = { ...prev };
        if (Object.keys(rest).length === 0) {
          delete next[matchId];
        } else {
          next[matchId] = rest;
        }
        persistOverrides(next);
        return next;
      });
    },
    [persistOverrides],
  );

  const clearAllMatchEventOverrides = useCallback(
    (matchId: string) => {
      setMatchEventOverrides(prev => {
        if (!prev[matchId]) return prev;
        const next: MatchEventOverrides = { ...prev };
        delete next[matchId];
        persistOverrides(next);
        return next;
      });
    },
    [persistOverrides],
  );

  const getEffectiveMatchEventPref = useCallback(
    (matchId: string, key: MatchEventPrefKey): boolean => {
      const override = matchEventOverrides[matchId]?.[key];
      if (override !== undefined) return override;
      return prefs[key];
    },
    [matchEventOverrides, prefs],
  );

  const hasMatchCustomization = useCallback(
    (matchId: string) => {
      if (mutedMatchIds.has(matchId)) return true;
      const overrides = matchEventOverrides[matchId];
      return !!overrides && Object.keys(overrides).length > 0;
    },
    [mutedMatchIds, matchEventOverrides],
  );

  const setPushToken = useCallback((token: string | null) => {
    setPushTokenState(token);
    tokenRef.current = token;
    // AsyncStorage persistence is handled by requestPermissionsAndGetToken in the service.
    // This setter just syncs reactive state so components can read the token.
    if (token) {
      AsyncStorage.setItem(PUSH_TOKEN_KEY, token).catch(() => {});
      syncPushTokenToCloud(token);
    }
  }, [syncPushTokenToCloud]);

  const setPermissionStatus = useCallback((status: 'undetermined' | 'granted' | 'denied') => {
    setPermissionStatusState(status);
    AsyncStorage.setItem(PERM_KEY, status).catch(() => {});
  }, []);

  return (
    <NotificationPrefsContext.Provider
      value={{
        prefs, isHydrated, togglePref, updatePrefs, setEstadioDelay, setMatchReminderMinutes,
        mutedMatchIds, toggleMatchMute, isMatchMuted,
        estadioMatchIds, toggleMatchEstadio, isMatchEstadio,
        estadioMatchDelays, setMatchEstadioDelay, getMatchEstadioDelay,
        matchEventOverrides,
        setMatchEventOverride, clearMatchEventOverride, clearAllMatchEventOverrides,
        getEffectiveMatchEventPref, hasMatchCustomization,
        pushToken, setPushToken,
        permissionStatus, setPermissionStatus,
      }}
    >
      {children}
    </NotificationPrefsContext.Provider>
  );
}

export function useNotificationPrefs() {
  return useContext(NotificationPrefsContext);
}
