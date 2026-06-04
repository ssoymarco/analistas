import {
  createContext, useContext, useState, useCallback,
  useEffect, useRef, ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { logEvent, ANALYTICS_EVENTS } from '../services/analytics';
import {
  subscribeTeamTopics, unsubscribeTeamTopics,
  subscribeLeagueTopics, unsubscribeLeagueTopics,
  subscribePlayerTopics, unsubscribePlayerTopics,
  reconcileSubscriptions,
  type DelayBucket,
} from '../services/fcmTopics';
import { useNotificationPrefs } from './NotificationPrefsContext';

const MATCH_STORAGE_KEY  = 'analistas_match_favorites';
const TEAM_STORAGE_KEY   = 'analistas_team_favorites';
const PLAYER_STORAGE_KEY = 'analistas_player_favorites';
const LEAGUE_STORAGE_KEY = 'analistas_league_favorites';

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
  isSyncing: false,
});

// ── Firestore favorites shape (nested under users/{uid}) ─────────────────────
interface FirestoreFavorites {
  matchIds?:  string[];
  teamIds?:   string[];
  playerIds?: string[];
  leagueIds?: string[];
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favoriteIds,      setFavoriteIds]      = useState<string[]>([]);
  const [followedTeamIds,  setFollowedTeamIds]  = useState<string[]>([]);
  const [followedPlayerIds,setFollowedPlayerIds]= useState<string[]>([]);
  const [followedLeagueIds,setFollowedLeagueIds]= useState<string[]>([]);
  const [isSyncing,        setIsSyncing]        = useState(false);

  // Modo Estadio prefs — FavoritesProvider is nested INSIDE NotificationPrefsProvider
  // (see App.tsx), so this hook call is always valid.
  const { prefs } = useNotificationPrefs();
  const delayBucket: DelayBucket = prefs.estadioMode
    ? (`d${prefs.estadioDelay}` as DelayBucket)
    : 'd0';
  // Keep a ref so async callbacks can read the current bucket without stale closures
  const delayBucketRef = useRef<DelayBucket>(delayBucket);
  useEffect(() => { delayBucketRef.current = delayBucket; }, [delayBucket]);

  // Refs keep latest values accessible inside async callbacks without stale closures
  const matchRef  = useRef<string[]>([]);
  const teamRef   = useRef<string[]>([]);
  const playerRef = useRef<string[]>([]);
  const leagueRef = useRef<string[]>([]);
  const uidRef    = useRef<string | null>(null);

  // Keep refs in sync with state
  useEffect(() => { matchRef.current  = favoriteIds;       }, [favoriteIds]);
  useEffect(() => { teamRef.current   = followedTeamIds;   }, [followedTeamIds]);
  useEffect(() => { playerRef.current = followedPlayerIds; }, [followedPlayerIds]);
  useEffect(() => { leagueRef.current = followedLeagueIds; }, [followedLeagueIds]);

  // ── Load from AsyncStorage on mount ─────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(MATCH_STORAGE_KEY),
      AsyncStorage.getItem(TEAM_STORAGE_KEY),
      AsyncStorage.getItem(PLAYER_STORAGE_KEY),
      AsyncStorage.getItem(LEAGUE_STORAGE_KEY),
    ]).then(([m, t, p, l]) => {
      let parsedTeams:   string[] = [];
      let parsedPlayers: string[] = [];
      let parsedLeagues: string[] = [];
      try { const v = JSON.parse(m ?? '[]'); if (Array.isArray(v)) setFavoriteIds(v); } catch {}
      try { const v = JSON.parse(t ?? '[]'); if (Array.isArray(v)) { setFollowedTeamIds(v);   parsedTeams   = v; } } catch {}
      try { const v = JSON.parse(p ?? '[]'); if (Array.isArray(v)) { setFollowedPlayerIds(v); parsedPlayers = v; } } catch {}
      try { const v = JSON.parse(l ?? '[]'); if (Array.isArray(v)) { setFollowedLeagueIds(v); parsedLeagues = v; } } catch {}

      // Reconcile FCM topic subscriptions on cold start so the subscriptions
      // match the user's persisted favorites + current Modo Estadio bucket,
      // even if a previous session crashed mid-toggle or the user changed devices.
      // Fire-and-forget — FCM operations are network-bound, don't block first paint.
      reconcileSubscriptions({
        teamIds:     parsedTeams,
        leagueIds:   parsedLeagues,  // ignored inside reconcileSubscriptions (display-only)
        playerIds:   parsedPlayers,
        delayBucket: delayBucketRef.current,
      }).catch(() => {});
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Modo Estadio change → re-reconcile to switch delay buckets ─────────────
  // When the user changes estadioMode or estadioDelay, every team they follow
  // needs to migrate from its current bucket (e.g. _d0) to the new one (e.g. _d5).
  // The useEffect watches `delayBucket` which changes whenever either pref does.
  // Skipped on mount (the cold-start reconcile above already handles it).
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) { isFirstMount.current = false; return; }
    reconcileSubscriptions({
      teamIds:     teamRef.current,
      leagueIds:   leagueRef.current,
      playerIds:   playerRef.current,
      delayBucket: delayBucket,
    }).catch(() => {});
  }, [delayBucket]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AppState foreground → re-reconcile to heal any mid-flip desync ─────────
  // If the user changed their Modo Estadio delay while the app was backgrounded,
  // the subscription wipe+re-subscribe may not have completed. Re-running on
  // foreground ensures the device always ends up in exactly one bucket.
  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === 'active') {
        reconcileSubscriptions({
          teamIds:     teamRef.current,
          leagueIds:   leagueRef.current,
          playerIds:   playerRef.current,
          delayBucket: delayBucketRef.current,
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

      if (newUid === uidRef.current) return;
      uidRef.current = newUid;

      if (!newUid) return; // guest or logged out — AsyncStorage is enough

      setIsSyncing(true);
      try {
        const snap = await getDoc(doc(db, 'users', newUid));
        const remote = (snap.exists() ? snap.data().favorites : null) as FirestoreFavorites | null;

        if (remote && (remote.matchIds?.length || remote.teamIds?.length ||
                       remote.playerIds?.length || remote.leagueIds?.length)) {
          // Firestore is authoritative — replace local state
          const m = remote.matchIds  ?? [];
          const t = remote.teamIds   ?? [];
          const p = remote.playerIds ?? [];
          const l = remote.leagueIds ?? [];

          setFavoriteIds(m);
          setFollowedTeamIds(t);
          setFollowedPlayerIds(p);
          setFollowedLeagueIds(l);

          // Keep AsyncStorage cache in sync
          await Promise.all([
            AsyncStorage.setItem(MATCH_STORAGE_KEY,  JSON.stringify(m)),
            AsyncStorage.setItem(TEAM_STORAGE_KEY,   JSON.stringify(t)),
            AsyncStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(p)),
            AsyncStorage.setItem(LEAGUE_STORAGE_KEY, JSON.stringify(l)),
          ]);

          // Reconcile FCM topic subscriptions against the freshly-loaded
          // cloud favorites + current Modo Estadio bucket — without this,
          // signing in on a new device would leave the user subscribed to the
          // wrong topics (or nothing) for their actual favorites.
          reconcileSubscriptions({
            teamIds: t, leagueIds: l, playerIds: p,
            delayBucket: delayBucketRef.current,
          }).catch(() => {});
        } else {
          // First login (or empty cloud) — migrate local favorites to Firestore
          const favs: FirestoreFavorites = {
            matchIds:  matchRef.current,
            teamIds:   teamRef.current,
            playerIds: playerRef.current,
            leagueIds: leagueRef.current,
          };
          const userRef = doc(db, 'users', newUid);
          if (snap.exists()) {
            await updateDoc(userRef, { favorites: favs });
          } else {
            await setDoc(userRef, { favorites: favs }, { merge: true });
          }
        }
      } catch {
        // Firestore unavailable — continue offline with local data
      } finally {
        setIsSyncing(false);
      }
    });
    return unsubscribe;
  }, []);

  // ── Firestore write helper ───────────────────────────────────────────────────
  function persistToFirestore(favs: FirestoreFavorites) {
    const uid = uidRef.current;
    if (!uid) return;
    updateDoc(doc(db, 'users', uid), { favorites: favs }).catch(() => {});
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
      AsyncStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(next));
      persistToFirestore({ matchIds: matchRef.current, teamIds: next, playerIds: playerRef.current, leagueIds: leagueRef.current });
      // Mirror the change into FCM topic subscriptions. Subscribe to the
      // correct Modo Estadio delay bucket. Best-effort — notification
      // reliability shouldn't ever block UI state updates.
      if (isFollowing) {
        unsubscribeTeamTopics(teamId).catch(() => {});
        logEvent(ANALYTICS_EVENTS.UNFOLLOW_TEAM, { team_id: teamId });
      } else {
        subscribeTeamTopics(teamId, delayBucketRef.current).catch(() => {});
        logEvent(ANALYTICS_EVENTS.FOLLOW_TEAM, { team_id: teamId });
      }
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
      isSyncing,
    }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  return useContext(FavoritesContext);
}
