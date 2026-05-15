import {
  createContext, useContext, useState, useCallback,
  useEffect, useRef, ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

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
  followedPlayerIds: string[];
  isFollowingPlayer: (playerId: string) => boolean;
  toggleFollowPlayer: (playerId: string) => void;
  followedLeagueIds: string[];
  isFollowingLeague: (leagueId: string) => boolean;
  toggleFollowLeague: (leagueId: string) => void;
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
  followedPlayerIds: [],
  isFollowingPlayer: () => false,
  toggleFollowPlayer: () => {},
  followedLeagueIds: [],
  isFollowingLeague: () => false,
  toggleFollowLeague: () => {},
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
      try { const v = JSON.parse(m ?? '[]'); if (Array.isArray(v)) setFavoriteIds(v); } catch {}
      try { const v = JSON.parse(t ?? '[]'); if (Array.isArray(v)) setFollowedTeamIds(v); } catch {}
      try { const v = JSON.parse(p ?? '[]'); if (Array.isArray(v)) setFollowedPlayerIds(v); } catch {}
      try { const v = JSON.parse(l ?? '[]'); if (Array.isArray(v)) setFollowedLeagueIds(v); } catch {}
    });
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
      const next = prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId];
      AsyncStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(next));
      persistToFirestore({ matchIds: matchRef.current, teamIds: next, playerIds: playerRef.current, leagueIds: leagueRef.current });
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
      const next = prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId];
      AsyncStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(next));
      persistToFirestore({ matchIds: matchRef.current, teamIds: teamRef.current, playerIds: next, leagueIds: leagueRef.current });
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
      const next = prev.includes(leagueId) ? prev.filter(id => id !== leagueId) : [...prev, leagueId];
      AsyncStorage.setItem(LEAGUE_STORAGE_KEY, JSON.stringify(next));
      persistToFirestore({ matchIds: matchRef.current, teamIds: teamRef.current, playerIds: playerRef.current, leagueIds: next });
      return next;
    });
  }, []);

  return (
    <FavoritesContext.Provider value={{
      favoriteIds, isFavorite, toggleFavorite,
      followedTeamIds, isFollowingTeam, toggleFollowTeam,
      followedPlayerIds, isFollowingPlayer, toggleFollowPlayer,
      followedLeagueIds, isFollowingLeague, toggleFollowLeague,
      isSyncing,
    }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  return useContext(FavoritesContext);
}
