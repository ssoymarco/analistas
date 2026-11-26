import {
  createContext, useContext, useState, useCallback,
  useEffect, useRef, ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { logEvent, ANALYTICS_EVENTS } from '../services/analytics';
import { captureFirestoreRejection } from '../services/sentry';
import {
  subscribeTeamTopics, unsubscribeTeamTopics,
  subscribeLeagueTopics, unsubscribeLeagueTopics, purgeLegacyLeagueTopics,
  subscribePlayerTopics, unsubscribePlayerTopics,
  subscribeRivalTopics, unsubscribeRivalTopics,
  reconcileSubscriptions,
  unsubscribeLegacyTopics,
  rivalEventsFromPrefs,
  teamEventsFromPrefs,
  type DelayBucket,
  type RivalEvent,
  type TeamEventClass,
} from '../services/fcmTopics';
import { useNotificationPrefs } from './NotificationPrefsContext';
import { refreshEstadioWants } from '../services/estadio';
import {
  FAVORITES_KEYS, clearPendingPlayers, migrateRemoteFavorites, readLegacyBackup, readLocalFavorites,
  resolvePendingPlayers,
} from '../services/football/legacyMigration';
import { SM_TO_AF_LEAGUE } from '../../functions/src/shared/football/leagues';

// The ids stored under these keys are API-Sports ids. A device that still held
// ids of the previous data provider had them carried over before this provider
// mounted (see services/football/legacyMigration.ts and DataMigrationGate).
const MATCH_STORAGE_KEY  = FAVORITES_KEYS.matches;
const TEAM_STORAGE_KEY   = FAVORITES_KEYS.teams;
const PLAYER_STORAGE_KEY = FAVORITES_KEYS.players;
const LEAGUE_STORAGE_KEY = FAVORITES_KEYS.leagues;
const RIVAL_STORAGE_KEY  = FAVORITES_KEYS.rivals;

/** Cloud field holding the favorites in the current id space. The older
 *  `favorites` field keeps the previous provider's ids for devices still on an
 *  old build — this build never writes it. */
const CLOUD_FIELD = 'favoritesFb';

interface FavoritesContextType {
  favoriteIds: string[];
  isFavorite: (matchId: string) => boolean;
  toggleFavorite: (matchId: string) => void;
  followedTeamIds: string[];
  isFollowingTeam: (teamId: string) => boolean;
  toggleFollowTeam: (teamId: string) => void;
  /** Replace the entire followed-teams list (used by onboarding to commit the
   *  user's picks WITHOUT accumulating previous-session selections). */
  replaceFollowedTeams: (teamIds: string[]) => void;
  followedPlayerIds: string[];
  isFollowingPlayer: (playerId: string) => boolean;
  toggleFollowPlayer: (playerId: string) => void;
  /** Replace the entire followed-players list (used by onboarding). */
  replaceFollowedPlayers: (playerIds: string[]) => void;
  followedLeagueIds: string[];
  isFollowingLeague: (leagueId: string) => boolean;
  toggleFollowLeague: (leagueId: string) => void;
  /** Replace the entire followed-leagues list (used by onboarding). */
  replaceFollowedLeagues: (leagueIds: string[]) => void;
  // ── Modo Rival ──
  rivalTeamIds: string[];
  isRivalTeam: (teamId: string) => boolean;
  /** Toggle a team as a rival. Mutually exclusive with following the same team. */
  toggleRivalTeam: (teamId: string) => void;
  /** True while the initial Firestore sync is in progress */
  isSyncing: boolean;
}

const FavoritesContext = createContext<FavoritesContextType>({
  favoriteIds: [],
  isFavorite: () => false,
  toggleFavorite: () => {},
  followedTeamIds: [],
  isFollowingTeam: () => false,
  toggleFollowTeam: () => {},
  replaceFollowedTeams: () => {},
  followedPlayerIds: [],
  isFollowingPlayer: () => false,
  toggleFollowPlayer: () => {},
  replaceFollowedPlayers: () => {},
  followedLeagueIds: [],
  isFollowingLeague: () => false,
  toggleFollowLeague: () => {},
  replaceFollowedLeagues: () => {},
  rivalTeamIds: [],
  isRivalTeam: () => false,
  toggleRivalTeam: () => {},
  isSyncing: false,
});

// ── Firestore favorites shape (users/{uid}.favoritesFb) ──────────────────────
interface FirestoreFavorites {
  matchIds?:  string[];
  teamIds?:   string[];
  playerIds?: string[];
  leagueIds?: string[];
  rivalTeamIds?: string[];
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favoriteIds,      setFavoriteIds]      = useState<string[]>([]);
  const [followedTeamIds,  setFollowedTeamIds]  = useState<string[]>([]);
  const [followedPlayerIds,setFollowedPlayerIds]= useState<string[]>([]);
  const [followedLeagueIds,setFollowedLeagueIds]= useState<string[]>([]);
  const [rivalTeamIds,     setRivalTeamIds]     = useState<string[]>([]);
  const [isSyncing,        setIsSyncing]        = useState(false);

  // Modo Estadio prefs — FavoritesProvider is nested INSIDE NotificationPrefsProvider
  // (see App.tsx), so this hook call is always valid.
  const { prefs, isHydrated, mutedMatchIds } = useNotificationPrefs();
  // Modo Estadio ya no mueve los topics: es por partido y lo entrega el
  // servidor (services/estadio.ts). Esta build vive SIEMPRE en el bucket
  // inmediato; quien traía el modo global prendido de una build anterior
  // vuelve a `d0` en el primer reconcile (el sweep lo saca de d2/d5/d10).
  const delayBucket: DelayBucket = 'd0';
  // Keep a ref so async callbacks can read the current bucket without stale closures
  const delayBucketRef = useRef<DelayBucket>(delayBucket);
  useEffect(() => { delayBucketRef.current = delayBucket; }, [delayBucket]);

  // ── Clases de evento de equipo habilitadas (derivadas de prefs) ──
  // El enforcement real de los toggles de notificaciones: gatean qué topics
  // FCM se suscriben por equipo. Antes eran decorativos (auditoría 10 jul).
  const teamEvents: TeamEventClass[] = teamEventsFromPrefs(prefs);
  const teamEventsSig = `${teamEvents.join(',')}|${prefs.notificationsEnabled}`;
  const teamEventsRef = useRef<TeamEventClass[]>(teamEvents);
  useEffect(() => { teamEventsRef.current = teamEvents; }, [teamEventsSig]); // eslint-disable-line react-hooks/exhaustive-deps
  const notifsEnabledRef = useRef<boolean>(prefs.notificationsEnabled);
  useEffect(() => { notifsEnabledRef.current = prefs.notificationsEnabled; }, [prefs.notificationsEnabled]);

  // Partidos silenciados (Fase 2): sus topics mute_{id} viajan en el reconcile
  // para que el sweep no los desuscriba. La suscripción/desuscripción directa
  // la hace toggleMatchMute; aquí solo se preservan.
  const mutedSig = [...mutedMatchIds].sort().join(',');
  const mutedRef = useRef<string[]>([...mutedMatchIds]);
  useEffect(() => { mutedRef.current = [...mutedMatchIds]; }, [mutedSig]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ref mirror of isHydrated for async/event callbacks (foreground handler).
  const isHydratedRef = useRef(isHydrated);
  useEffect(() => { isHydratedRef.current = isHydrated; }, [isHydrated]);
  // True once the favorites AsyncStorage load resolves — gates the reconcile so
  // it never runs with a not-yet-loaded (empty) follow list.
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);

  // ── Modo Rival enabled events (derived from notification prefs) ──
  // Which rival "bad news" classes the user wants. Threaded into reconcile so
  // toggling a rival setting subscribes/unsubscribes that class across every
  // rival team. Signature string drives the re-reconcile effect below.
  const rivalEvents: RivalEvent[] = rivalEventsFromPrefs(prefs);
  const rivalEventsSig = `${prefs.rivalResult}|${prefs.rivalRedCard}|${prefs.rivalPenMiss}`;
  const rivalEventsRef = useRef<RivalEvent[]>(rivalEvents);
  useEffect(() => { rivalEventsRef.current = rivalEvents; }, [rivalEventsSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refs keep latest values accessible inside async callbacks without stale closures
  const matchRef  = useRef<string[]>([]);
  const teamRef   = useRef<string[]>([]);
  const playerRef = useRef<string[]>([]);
  const leagueRef = useRef<string[]>([]);
  const rivalRef  = useRef<string[]>([]);
  const uidRef    = useRef<string | null>(null);

  // A match with Modo Estadio on is served by the server from what this device
  // follows: tell it when that changes (does nothing without a session).
  useEffect(() => {
    if (favoritesLoaded) refreshEstadioWants();
  }, [followedTeamIds, followedPlayerIds, rivalTeamIds, favoritesLoaded]);

  // Keep refs in sync with state
  useEffect(() => { matchRef.current  = favoriteIds;       }, [favoriteIds]);
  useEffect(() => { teamRef.current   = followedTeamIds;   }, [followedTeamIds]);
  useEffect(() => { playerRef.current = followedPlayerIds; }, [followedPlayerIds]);
  useEffect(() => { leagueRef.current = followedLeagueIds; }, [followedLeagueIds]);
  useEffect(() => { rivalRef.current  = rivalTeamIds;      }, [rivalTeamIds]);

  // ── Load from AsyncStorage on mount ─────────────────────────────────────────
  useEffect(() => {
    // Through the migration module: it also serves the lists it translated
    // but couldn't store (device storage failing).
    readLocalFavorites().catch(() => null).then(lists => {
      if (lists) {
        setFavoriteIds(lists.matchIds);
        setFollowedTeamIds(lists.teamIds);
        setFollowedPlayerIds(lists.playerIds);
        setFollowedLeagueIds(lists.leagueIds);
        setRivalTeamIds(lists.rivalTeamIds);
      }

      // Favorites are loaded. The unified reconcile effect below fires once prefs
      // are ALSO hydrated, so it always runs with the authoritative delay bucket
      // (never the pre-hydration default 'd0', which would nuke the right bucket).
      setFavoritesLoaded(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Unified FCM reconcile — single authoritative entry point ───────────────
  // Fires for: cold start (once prefs+favorites are loaded), Modo Estadio bucket
  // changes, and rival-event toggles.
  //
  // ⚠️ SAFETY-CRITICAL gate on isHydrated && favoritesLoaded: the reconcile is
  // authoritative — it force-unsubscribes every delay-bucket sibling that isn't
  // the target. If it ran before prefs hydrate (when delayBucket is still the
  // DEFAULT 'd0'), it would actively unsubscribe the user's correct delayed
  // bucket, breaking a perfectly-configured device on every launch. Gating
  // guarantees the bucket + follow list are always authoritative.
  //
  // Intentionally does NOT depend on the follow-list arrays: per-team
  // follow/unfollow is handled by toggleFollowTeam's targeted subscribe, so a
  // single tap never triggers a full sweep of every followed team. Onboarding's
  // replace* helpers reconcile explicitly (they bypass toggleFollowTeam).
  useEffect(() => {
    if (!isHydrated || !favoritesLoaded) return;
    reconcileSubscriptions({
      teamIds:      teamRef.current,
      leagueIds:    leagueRef.current,
      playerIds:    playerRef.current,
      rivalTeamIds: rivalRef.current,
      rivalEvents:  rivalEventsRef.current,
      teamEvents:   teamEventsRef.current,
      enabled:      notifsEnabledRef.current,
      muteMatchIds: mutedRef.current,
      delayBucket:  delayBucket,
    }).catch(() => {});
    // Purga única de topics league_{id}_start/_finals heredados de builds
    // viejos (persisten en FCM aunque el subscribe sea no-op) — el dueño
    // recibió kickoffs de Champions por seguir la liga (4-ago-2026). Esos
    // topics llevan ids de liga del proveedor anterior.
    purgeLegacyLeagueTopics(Object.keys(SM_TO_AF_LEAGUE).map(Number)).catch(() => {});
  }, [isHydrated, favoritesLoaded, delayBucket, rivalEventsSig, teamEventsSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tail of the provider migration (background, once per install) ──────────
  // The favorites lists were translated before this provider mounted. Two
  // things can't happen offline/instantly and finish here:
  //   1. leave the push topics of the previous id space (needs the FCM token);
  //   2. followed players the device couldn't translate on its own — the
  //      backend matches them and they rejoin the followed list.
  useEffect(() => {
    if (!isHydrated || !favoritesLoaded) return;
    let cancelled = false;
    (async () => {
      const legacy = await readLegacyBackup();
      if (legacy) {
        unsubscribeLegacyTopics({
          teamIds: legacy.teamIds,
          rivalTeamIds: legacy.rivalTeamIds,
          playerIds: legacy.playerIds,
          muteMatchIds: legacy.mutedMatchIds,
        }).catch(() => {});
      }
      const recovered = await resolvePendingPlayers().catch(() => [] as string[]);
      if (cancelled || recovered.length === 0) return;
      const next = Array.from(new Set([...playerRef.current, ...recovered]));
      if (next.length === playerRef.current.length) return;
      playerRef.current = next;
      setFollowedPlayerIds(next);
      AsyncStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      persistToFirestore({ playerIds: next });
      recovered.forEach(id => { subscribePlayerTopics(id).catch(() => {}); });
    })();
    return () => { cancelled = true; };
  }, [isHydrated, favoritesLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AppState foreground → re-reconcile to heal any mid-flip desync ─────────
  // Heals subscriptions that drifted while backgrounded (e.g. a Modo Estadio
  // change whose reconcile didn't complete). Gated on isHydrated so it never
  // runs the authoritative reconcile with a pre-hydration default bucket.
  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === 'active' && isHydratedRef.current) {
        reconcileSubscriptions({
          teamIds:      teamRef.current,
          leagueIds:    leagueRef.current,
          playerIds:    playerRef.current,
          rivalTeamIds: rivalRef.current,
          rivalEvents:  rivalEventsRef.current,
          teamEvents:   teamEventsRef.current,
          enabled:      notifsEnabledRef.current,
          muteMatchIds: mutedRef.current,
          delayBucket:  delayBucketRef.current,
        }).catch(() => {});
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, []);

  // ── Firestore sync on auth change ────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async fbUser => {
      const newUid = (fbUser && !fbUser.isAnonymous) ? fbUser.uid : null;

      const prevUid = uidRef.current;
      if (newUid === prevUid) return;
      uidRef.current = newUid;

      if (!newUid) {
        // Transición logueado → sign-out: limpiar los favoritos locales para
        // que el siguiente usuario del dispositivo no los herede (la rama de
        // migración los subiría a SU cuenta). Los invitados y el arranque en
        // frío nunca pasan por aquí (prevUid es null en ambos).
        if (prevUid) {
          setFavoriteIds([]); setFollowedTeamIds([]); setFollowedPlayerIds([]);
          setFollowedLeagueIds([]); setRivalTeamIds([]);
          matchRef.current = []; teamRef.current = []; playerRef.current = [];
          leagueRef.current = []; rivalRef.current = [];
          Promise.all([
            AsyncStorage.removeItem(MATCH_STORAGE_KEY),
            AsyncStorage.removeItem(TEAM_STORAGE_KEY),
            AsyncStorage.removeItem(PLAYER_STORAGE_KEY),
            AsyncStorage.removeItem(LEAGUE_STORAGE_KEY),
            AsyncStorage.removeItem(RIVAL_STORAGE_KEY),
            // Player lookups queued for the outgoing account must not land on
            // the next one.
            clearPendingPlayers(),
          ]).catch(() => {});
          // Desuscribir los topics FCM del usuario saliente — sin esto el
          // device seguía recibiendo los pushes de la cuenta anterior
          // (auditoría 10 jul 2026). Con listas vacías, el reconcile remueve
          // todo lo que el caché conoce.
          reconcileSubscriptions({
            teamIds: [], leagueIds: [], playerIds: [], rivalTeamIds: [],
            delayBucket: delayBucketRef.current,
          }).catch(() => {});
        }
        return; // guest or logged out — AsyncStorage is enough
      }

      setIsSyncing(true);
      try {
        const snap = await getDoc(doc(db, 'users', newUid));
        const cloud = snap.exists() ? snap.data() : null;
        let remote = (cloud?.[CLOUD_FIELD] ?? null) as FirestoreFavorites | null;
        // First time this account is opened by a build on the current data
        // source: its cloud favorites still carry the previous provider's ids.
        // Translate them once; from here on they live in CLOUD_FIELD.
        let translatedLegacyCloud = false;
        if (!remote && cloud?.favorites) {
          remote = await migrateRemoteFavorites(cloud.favorites as FirestoreFavorites);
          translatedLegacyCloud = true;
        }

        // Caché local leído DIRECTO de AsyncStorage — no de los refs: este
        // handler puede disparar antes de que la hidratación de arranque
        // resuelva, cuando los refs aún están vacíos (usarlos aquí haría ver
        // "local vacío" y adoptar un remoto rancio aunque el teléfono sí
        // tuviera datos).
        const parse = (raw: string | null): string[] => {
          try { const v = JSON.parse(raw ?? '[]'); return Array.isArray(v) ? v.map(String) : []; }
          catch { return []; }
        };
        const [lm, lt, lp, ll, lr] = await Promise.all([
          AsyncStorage.getItem(MATCH_STORAGE_KEY),
          AsyncStorage.getItem(TEAM_STORAGE_KEY),
          AsyncStorage.getItem(PLAYER_STORAGE_KEY),
          AsyncStorage.getItem(LEAGUE_STORAGE_KEY),
          AsyncStorage.getItem(RIVAL_STORAGE_KEY),
        ]);
        const local = { m: parse(lm), t: parse(lt), p: parse(lp), l: parse(ll), rv: parse(lr) };

        if (remote && (remote.matchIds?.length || remote.teamIds?.length ||
                       remote.playerIds?.length || remote.leagueIds?.length ||
                       remote.rivalTeamIds?.length)) {
          // Unión local ∪ remoto por lista. Si lo local tiene elementos que el
          // remoto no (cambios que nunca llegaron a la nube: el bug de rules
          // del 3 jul 2026, escrituras offline, la carrera pre-auth), NO se
          // adopta el remoto rancio: se SANA la nube con la unión. Trade-off
          // aceptado y acotado: un unfollow hecho en otro device puede
          // resucitar desde este — preferible mil veces a borrar favoritos
          // legítimos en silencio.
          const union = (a: string[], b: string[]) => Array.from(new Set([...b, ...a]));
          const m  = union(local.m,  (remote.matchIds  ?? []).map(String));
          const t  = union(local.t,  (remote.teamIds   ?? []).map(String));
          const p  = union(local.p,  (remote.playerIds ?? []).map(String));
          const l  = union(local.l,  (remote.leagueIds ?? []).map(String));
          const rv = union(local.rv, (remote.rivalTeamIds ?? []).map(String));

          const grew =
            m.length  > (remote.matchIds?.length  ?? 0) ||
            t.length  > (remote.teamIds?.length   ?? 0) ||
            p.length  > (remote.playerIds?.length ?? 0) ||
            l.length  > (remote.leagueIds?.length ?? 0) ||
            rv.length > (remote.rivalTeamIds?.length ?? 0);
          if (grew || translatedLegacyCloud) {
            updateDoc(doc(db, 'users', newUid), {
              [CLOUD_FIELD]: { matchIds: m, teamIds: t, playerIds: p, leagueIds: l, rivalTeamIds: rv },
            }).catch(err => captureFirestoreRejection('favorites.heal', err));
          }

          setFavoriteIds(m);
          setFollowedTeamIds(t);
          setFollowedPlayerIds(p);
          setFollowedLeagueIds(l);
          setRivalTeamIds(rv);

          // Keep AsyncStorage cache in sync
          await Promise.all([
            AsyncStorage.setItem(MATCH_STORAGE_KEY,  JSON.stringify(m)),
            AsyncStorage.setItem(TEAM_STORAGE_KEY,   JSON.stringify(t)),
            AsyncStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(p)),
            AsyncStorage.setItem(LEAGUE_STORAGE_KEY, JSON.stringify(l)),
            AsyncStorage.setItem(RIVAL_STORAGE_KEY,  JSON.stringify(rv)),
          ]);

          // Reconcile FCM topic subscriptions against the freshly-loaded
          // cloud favorites + current Modo Estadio bucket — without this,
          // signing in on a new device would leave the user subscribed to the
          // wrong topics (or nothing) for their actual favorites.
          reconcileSubscriptions({
            teamIds: t, leagueIds: l, playerIds: p, rivalTeamIds: rv,
            rivalEvents: rivalEventsRef.current,
            teamEvents:  teamEventsRef.current,
            enabled:     notifsEnabledRef.current,
            muteMatchIds: mutedRef.current,
            delayBucket: delayBucketRef.current,
          }).catch(() => {});
        } else {
          // First login (or empty cloud) — migrate local favorites to Firestore
          const favs: FirestoreFavorites = {
            matchIds:  local.m,
            teamIds:   local.t,
            playerIds: local.p,
            leagueIds: local.l,
            rivalTeamIds: local.rv,
          };
          const userRef = doc(db, 'users', newUid);
          if (snap.exists()) {
            await updateDoc(userRef, { [CLOUD_FIELD]: favs });
          } else {
            // users/{uid} aún NO existe: ensureUserProfile (AuthContext) lo
            // está creando en paralelo con displayName/createdAt — que la
            // rule de create EXIGE, así que escribir aquí un create con solo
            // {favorites} sería rechazado (setDoc+merge sobre doc inexistente
            // ES un create para las rules — bug de primer login, 3 jul 2026).
            // Esperar a que exista y entonces update; si el timeout vence, el
            // siguiente arranque auto-repara por la rama updateDoc.
            await new Promise<void>(resolve => {
              const timer = setTimeout(() => { unsub(); resolve(); }, 15000);
              const unsub = onSnapshot(userRef, s => {
                if (s.exists()) {
                  clearTimeout(timer); unsub();
                  updateDoc(userRef, { [CLOUD_FIELD]: favs })
                    .catch(err => captureFirestoreRejection('favorites.migrate', err));
                  resolve();
                }
              }, () => { clearTimeout(timer); resolve(); });
            });
          }
        }
      } catch (err) {
        // Firestore unavailable — continue offline with local data. Reportar
        // (filtro-safe) para que un fallo sistémico nunca vuelva a ser
        // invisible como el bug de rules.
        captureFirestoreRejection('favorites.reconcile', err);
      } finally {
        setIsSyncing(false);
      }
    });
    return unsubscribe;
  }, []);

  // ── Firestore write helper ───────────────────────────────────────────────────
  // Writes replace the entire favorites object, so any field the caller omits
  // would be wiped. To avoid that (and to spare every caller from having to pass
  // every list), missing fields fall back to the current ref value. `?? ref`
  // only triggers on null/undefined — an explicit empty array is preserved.
  function persistToFirestore(favs: FirestoreFavorites) {
    // uid al momento de la llamada, con fallback a auth.currentUser: cubre el
    // upgrade invitado→Google/Apple vía linkWithCredential, que puede no
    // re-disparar onAuthStateChanged (uidRef se quedaría null toda la sesión).
    const uid =
      uidRef.current ??
      ((auth.currentUser && !auth.currentUser.isAnonymous) ? auth.currentUser.uid : null);
    if (!uid) return;
    const full: FirestoreFavorites = {
      matchIds:     favs.matchIds     ?? matchRef.current,
      teamIds:      favs.teamIds      ?? teamRef.current,
      playerIds:    favs.playerIds    ?? playerRef.current,
      leagueIds:    favs.leagueIds    ?? leagueRef.current,
      rivalTeamIds: favs.rivalTeamIds ?? rivalRef.current,
    };
    const userRef = doc(db, 'users', uid);
    const write = () => updateDoc(userRef, { [CLOUD_FIELD]: full });
    write().catch(err => {
      const code = (err as { code?: string })?.code;
      if (code === 'not-found') {
        // users/{uid} aún no existe (ensureUserProfile en vuelo durante el
        // primer sign-in — el token de Auth tarda en propagarse a Firestore).
        // Un timeout fijo de 2.5s no alcanzaba a cubrir esta carrera (infló
        // Sentry con pushToken.persist el 4 jul 2026) — esperar a que el doc
        // EXISTA (onSnapshot, hasta 20s) en vez de adivinar un tiempo fijo.
        const timer = setTimeout(() => { unsub(); }, 20000);
        const unsub = onSnapshot(userRef, snap => {
          if (snap.exists()) {
            clearTimeout(timer); unsub();
            write().catch(e2 => captureFirestoreRejection('favorites.persist.retry', e2));
          }
        }, () => clearTimeout(timer));
        return;
      }
      // NUNCA tragar esto en silencio: así fue invisible durante semanas el
      // bug de rules que borraba favoritos (3 jul 2026).
      captureFirestoreRejection('favorites.persist', err);
    });
  }

  // ── Match favorites ──────────────────────────────────────────────────────────
  const isFavorite = useCallback(
    (matchId: string) => favoriteIds.includes(matchId),
    [favoriteIds],
  );

  const toggleFavorite = useCallback((matchId: string) => {
    setFavoriteIds(prev => {
      const next = prev.includes(matchId) ? prev.filter(id => id !== matchId) : [...prev, matchId];
      AsyncStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify(next));
      persistToFirestore({ matchIds: next, teamIds: teamRef.current, playerIds: playerRef.current, leagueIds: leagueRef.current });
      return next;
    });
  }, []);

  // ── Team following ───────────────────────────────────────────────────────────
  const isFollowingTeam = useCallback(
    (teamId: string) => followedTeamIds.includes(teamId),
    [followedTeamIds],
  );

  const toggleFollowTeam = useCallback((teamId: string) => {
    setFollowedTeamIds(prev => {
      const isFollowing = prev.includes(teamId);
      const next = isFollowing ? prev.filter(id => id !== teamId) : [...prev, teamId];
      teamRef.current = next;
      AsyncStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(next));
      // Mirror the change into FCM topic subscriptions. Subscribe to the
      // correct Modo Estadio delay bucket. Best-effort — notification
      // reliability shouldn't ever block UI state updates.
      if (isFollowing) {
        unsubscribeTeamTopics(teamId).catch(() => {});
        logEvent(ANALYTICS_EVENTS.UNFOLLOW_TEAM, { team_id: teamId });
      } else {
        subscribeTeamTopics(teamId, delayBucketRef.current, teamEventsRef.current).catch(() => {});
        logEvent(ANALYTICS_EVENTS.FOLLOW_TEAM, { team_id: teamId });
        // Mutual exclusivity: you don't "follow" a rival — drop it if present.
        if (rivalRef.current.includes(teamId)) {
          const nextRivals = rivalRef.current.filter(id => id !== teamId);
          rivalRef.current = nextRivals;
          setRivalTeamIds(nextRivals);
          AsyncStorage.setItem(RIVAL_STORAGE_KEY, JSON.stringify(nextRivals));
          unsubscribeRivalTopics(teamId).catch(() => {});
        }
      }
      // rivalTeamIds is picked up from rivalRef inside persistToFirestore.
      persistToFirestore({ teamIds: next });
      return next;
    });
  }, []);

  // ── Modo Rival ───────────────────────────────────────────────────────────────
  const isRivalTeam = useCallback(
    (teamId: string) => rivalTeamIds.includes(teamId),
    [rivalTeamIds],
  );

  const toggleRivalTeam = useCallback((teamId: string) => {
    setRivalTeamIds(prev => {
      const isRival = prev.includes(teamId);
      const next = isRival ? prev.filter(id => id !== teamId) : [...prev, teamId];
      rivalRef.current = next;
      AsyncStorage.setItem(RIVAL_STORAGE_KEY, JSON.stringify(next));
      if (isRival) {
        unsubscribeRivalTopics(teamId).catch(() => {});
      } else {
        subscribeRivalTopics(teamId, rivalEventsRef.current).catch(() => {});
        // Mutual exclusivity: a rival isn't a followed team — drop the follow.
        if (teamRef.current.includes(teamId)) {
          const nextTeams = teamRef.current.filter(id => id !== teamId);
          teamRef.current = nextTeams;
          setFollowedTeamIds(nextTeams);
          AsyncStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(nextTeams));
          unsubscribeTeamTopics(teamId).catch(() => {});
        }
      }
      // teamIds is picked up from teamRef inside persistToFirestore.
      persistToFirestore({ rivalTeamIds: next });
      return next;
    });
  }, []);

  // ── Player following ─────────────────────────────────────────────────────────
  const isFollowingPlayer = useCallback(
    (playerId: string) => followedPlayerIds.includes(playerId),
    [followedPlayerIds],
  );

  const toggleFollowPlayer = useCallback((playerId: string) => {
    setFollowedPlayerIds(prev => {
      const isFollowing = prev.includes(playerId);
      const next = isFollowing ? prev.filter(id => id !== playerId) : [...prev, playerId];
      AsyncStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(next));
      persistToFirestore({ matchIds: matchRef.current, teamIds: teamRef.current, playerIds: next, leagueIds: leagueRef.current });
      if (isFollowing) {
        unsubscribePlayerTopics(playerId).catch(() => {});
      } else {
        subscribePlayerTopics(playerId).catch(() => {});
      }
      return next;
    });
  }, []);

  // ── League following ─────────────────────────────────────────────────────────
  const isFollowingLeague = useCallback(
    (leagueId: string) => followedLeagueIds.includes(leagueId),
    [followedLeagueIds],
  );

  const toggleFollowLeague = useCallback((leagueId: string) => {
    setFollowedLeagueIds(prev => {
      const isFollowing = prev.includes(leagueId);
      const next = isFollowing ? prev.filter(id => id !== leagueId) : [...prev, leagueId];
      AsyncStorage.setItem(LEAGUE_STORAGE_KEY, JSON.stringify(next));
      persistToFirestore({ matchIds: matchRef.current, teamIds: teamRef.current, playerIds: playerRef.current, leagueIds: next });
      if (isFollowing) {
        unsubscribeLeagueTopics(leagueId).catch(() => {});
      } else {
        subscribeLeagueTopics(leagueId).catch(() => {});
      }
      return next;
    });
  }, []);

  // ── Replace helpers (used by onboarding) ───────────────────────────────────
  // The onboarding bridge in Screen 9 needs to OVERWRITE the followed lists
  // with the user's freshly-picked selections instead of merging on top of
  // whatever was already there. Without these, repeated onboarding sessions
  // (or completing onboarding when AsyncStorage still has data from a
  // previous build / test session) accumulated stale picks — the user ended
  // up "following" 11 teams after selecting only 1, etc.
  //
  // Deduplicated and string-cast at the boundary so callers can pass mixed
  // numeric/string ID arrays safely. Firestore + AsyncStorage are kept in
  // sync the same way the toggle methods do.

  const replaceFollowedTeams = useCallback((teamIds: string[]) => {
    const next = Array.from(new Set(teamIds.map(String)));
    setFollowedTeamIds(next);
    teamRef.current = next; // keep ref in sync immediately so persistToFirestore sees it
    AsyncStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(next));
    persistToFirestore({
      matchIds:  matchRef.current,
      teamIds:   next,
      playerIds: playerRef.current,
      leagueIds: leagueRef.current,
    });
    // Onboarding uses this instead of toggleFollowTeam, so it bypasses the
    // per-team subscribe. The unified effect doesn't key off the follow list,
    // so reconcile explicitly here to subscribe the freshly-picked teams.
    reconcileSubscriptions({
      teamIds:      next,
      leagueIds:    leagueRef.current,
      playerIds:    playerRef.current,
      rivalTeamIds: rivalRef.current,
      rivalEvents:  rivalEventsRef.current,
      teamEvents:   teamEventsRef.current,
      enabled:      notifsEnabledRef.current,
      muteMatchIds: mutedRef.current,
      delayBucket:  delayBucketRef.current,
    }).catch(() => {});
  }, []);

  const replaceFollowedPlayers = useCallback((playerIds: string[]) => {
    const next = Array.from(new Set(playerIds.map(String)));
    setFollowedPlayerIds(next);
    playerRef.current = next;
    AsyncStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(next));
    persistToFirestore({
      matchIds:  matchRef.current,
      teamIds:   teamRef.current,
      playerIds: next,
      leagueIds: leagueRef.current,
    });
  }, []);

  const replaceFollowedLeagues = useCallback((leagueIds: string[]) => {
    const next = Array.from(new Set(leagueIds.map(String)));
    setFollowedLeagueIds(next);
    leagueRef.current = next;
    AsyncStorage.setItem(LEAGUE_STORAGE_KEY, JSON.stringify(next));
    persistToFirestore({
      matchIds:  matchRef.current,
      teamIds:   teamRef.current,
      playerIds: playerRef.current,
      leagueIds: next,
    });
  }, []);

  return (
    <FavoritesContext.Provider value={{
      favoriteIds, isFavorite, toggleFavorite,
      followedTeamIds, isFollowingTeam, toggleFollowTeam, replaceFollowedTeams,
      followedPlayerIds, isFollowingPlayer, toggleFollowPlayer, replaceFollowedPlayers,
      followedLeagueIds, isFollowingLeague, toggleFollowLeague, replaceFollowedLeagues,
      rivalTeamIds, isRivalTeam, toggleRivalTeam,
      isSyncing,
    }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  return useContext(FavoritesContext);
}
