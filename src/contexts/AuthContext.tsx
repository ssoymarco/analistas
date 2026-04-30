/**
 * AuthContext.tsx
 *
 * Real Firebase Auth — replaces the previous mock implementation.
 *
 * Supports:
 *  - Google Sign-In (via expo-auth-session, works in Expo Go)
 *  - Apple Sign-In (via expo-apple-authentication, needs dev build)
 *  - Anonymous / Guest
 *  - Unique @username system (Firestore usernames/{username} → uid)
 *  - Edit display name + username
 *  - Persistent session via Firebase + AsyncStorage
 */

import {
  createContext, useContext, useState, useCallback,
  useEffect, useRef, ReactNode,
} from 'react';
import {
  onAuthStateChanged, signOut, signInAnonymously,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc, getDoc, setDoc, updateDoc,
  serverTimestamp, runTransaction,
} from 'firebase/firestore';
import { auth, db } from '../services/firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuthMethod = 'google' | 'apple' | 'guest' | null;

export interface AuthUser {
  id: string;           // Firebase UID
  name: string;         // displayName
  email?: string;
  avatar?: string;      // photoURL or initials fallback
  method: AuthMethod;
  isGuest: boolean;
  username?: string;    // @username (unique, stored in Firestore)
  createdAt?: Date;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  isLoading: boolean;
  login: (method: AuthMethod, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: { displayName?: string; username?: string }) => Promise<void>;
  checkUsernameAvailable: (username: string) => Promise<boolean>;
}

// ── Username helpers ──────────────────────────────────────────────────────────

const USERNAME_REGEX = /^[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$/;

function normalizeUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 20);
}

async function generateUniqueUsername(baseName: string): Promise<string> {
  const base = normalizeUsername(baseName.split(' ')[0]) || 'analista';
  let candidate = base;
  let suffix = 1;
  while (true) {
    const ref = doc(db, 'usernames', candidate);
    const snap = await getDoc(ref);
    if (!snap.exists()) return candidate;
    candidate = `${base}${suffix}`;
    suffix += 1;
    if (suffix > 999) return `${base}${Date.now() % 10000}`;
  }
}

function mapFirebaseUser(fbUser: FirebaseUser, profile: FirestoreProfile): AuthUser {
  const method: AuthMethod =
    fbUser.isAnonymous ? 'guest'
    : fbUser.providerData[0]?.providerId === 'google.com' ? 'google'
    : fbUser.providerData[0]?.providerId === 'apple.com' ? 'apple'
    : 'guest';

  return {
    id:        fbUser.uid,
    name:      profile.displayName || fbUser.displayName || 'Analista',
    email:     profile.email ?? fbUser.email ?? undefined,
    avatar:    fbUser.photoURL ?? undefined,
    method,
    isGuest:   fbUser.isAnonymous,
    username:  profile.username,
    createdAt: profile.createdAt?.toDate?.() ?? new Date(),
  };
}

interface FirestoreProfile {
  displayName: string;
  username?: string;
  email?: string | null;
  authMethod?: string;
  createdAt?: { toDate: () => Date };
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType>({
  user: null, isAuthenticated: false, isGuest: false, isLoading: true,
  login: async () => {}, logout: async () => {},
  updateProfile: async () => {}, checkUsernameAvailable: async () => false,
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pendingNameRef = useRef<string | undefined>(undefined);

  // ── Firestore profile helpers ──────────────────────────────────────────────

  async function ensureUserProfile(fbUser: FirebaseUser, displayNameOverride?: string): Promise<AuthUser> {
    const userRef = doc(db, 'users', fbUser.uid);
    const snap    = await getDoc(userRef);

    if (snap.exists()) {
      const profile = snap.data() as FirestoreProfile;

      // If upgrading from guest → Google/Apple, pull the real name from the provider
      const isNowReal   = !fbUser.isAnonymous;
      const wasGuest    = profile.authMethod === 'guest';
      const hasRealName = !!fbUser.displayName;
      const hasDefaultName = !profile.displayName || profile.displayName === 'Analista';

      if (isNowReal && hasRealName && (wasGuest || hasDefaultName)) {
        const updates = {
          displayName: fbUser.displayName!,
          authMethod:  fbUser.providerData[0]?.providerId ?? profile.authMethod,
          email:       fbUser.email ?? profile.email ?? null,
          updatedAt:   serverTimestamp(),
        };
        await updateDoc(userRef, updates);
        return mapFirebaseUser(fbUser, { ...profile, ...updates });
      }

      return mapFirebaseUser(fbUser, profile);
    }

    // First sign-in — create profile
    const baseName = displayNameOverride || fbUser.displayName || 'Analista';
    const username = await generateUniqueUsername(baseName);

    const profile: Record<string, unknown> = {
      displayName: baseName,
      username,
      email:       fbUser.email ?? null,
      authMethod:  fbUser.isAnonymous ? 'guest'
                   : fbUser.providerData[0]?.providerId ?? 'guest',
      createdAt:   serverTimestamp(),
      updatedAt:   serverTimestamp(),
    };

    // Batch: create user doc + reserve username
    await Promise.all([
      setDoc(userRef, profile),
      setDoc(doc(db, 'usernames', username), { uid: fbUser.uid }),
    ]);

    return mapFirebaseUser(fbUser, {
      ...profile,
      username,
    } as unknown as FirestoreProfile);
  }

  // ── onAuthStateChanged ─────────────────────────────────────────────────────

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async fbUser => {
      if (!fbUser) {
        setUser(null);
        setIsLoading(false);
        return;
      }
      try {
        const appUser = await ensureUserProfile(fbUser, pendingNameRef.current);
        pendingNameRef.current = undefined;
        setUser(appUser);
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    });
    return unsubscribe;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── login ──────────────────────────────────────────────────────────────────

  const login = useCallback(async (method: AuthMethod, displayName?: string) => {
    pendingNameRef.current = displayName;

    if (method === 'guest') {
      await signInAnonymously(auth);
      return;
    }

    // Google and Apple sign-in are triggered externally (useGoogleAuth / signInWithApple).
    // This function handles the 'guest' case and stores the display name for
    // onAuthStateChanged to pick up on first sign-in.
  }, []);

  // ── logout ─────────────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    await signOut(auth);
    setUser(null);
  }, []);

  // ── updateProfile ──────────────────────────────────────────────────────────

  const updateProfile = useCallback(async (updates: { displayName?: string; username?: string }) => {
    if (!user) return;
    const userRef = doc(db, 'users', user.id);

    if (updates.username && updates.username !== user.username) {
      // Atomic swap: delete old username doc, create new, update user doc
      const newUsername = normalizeUsername(updates.username);
      if (!USERNAME_REGEX.test(newUsername)) throw new Error('username_invalid');

      await runTransaction(db, async tx => {
        const newRef = doc(db, 'usernames', newUsername);
        const newSnap = await tx.get(newRef);
        if (newSnap.exists()) throw new Error('username_taken');

        // Only delete old username doc if it actually exists
        if (user.username) {
          const oldRef  = doc(db, 'usernames', user.username);
          const oldSnap = await tx.get(oldRef);
          if (oldSnap.exists()) tx.delete(oldRef);
        }
        tx.set(newRef, { uid: user.id });
        tx.update(userRef, {
          ...(updates.displayName ? { displayName: updates.displayName } : {}),
          username: newUsername,
          updatedAt: serverTimestamp(),
        });
      });

      setUser(prev => prev
        ? { ...prev, username: newUsername, name: updates.displayName ?? prev.name }
        : prev
      );
    } else if (updates.displayName) {
      await updateDoc(userRef, { displayName: updates.displayName, updatedAt: serverTimestamp() });
      setUser(prev => prev ? { ...prev, name: updates.displayName! } : prev);
    }
  }, [user]);

  // ── checkUsernameAvailable ─────────────────────────────────────────────────

  const checkUsernameAvailable = useCallback(async (username: string): Promise<boolean> => {
    const normalized = normalizeUsername(username);
    if (!USERNAME_REGEX.test(normalized)) return false;
    const snap = await getDoc(doc(db, 'usernames', normalized));
    return !snap.exists();
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isGuest: user?.isGuest ?? false,
      isLoading,
      login,
      logout,
      updateProfile,
      checkUsernameAvailable,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
