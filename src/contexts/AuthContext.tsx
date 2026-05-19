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
  deleteUser, User as FirebaseUser,
} from 'firebase/auth';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, runTransaction,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

/** Result of an account-deletion attempt. `requires-recent-login` means
 *  Firebase wants the user to re-authenticate before deletion can proceed —
 *  the caller should prompt them to sign in again and retry. */
export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: 'requires-recent-login' | 'unknown'; message?: string };

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  isLoading: boolean;
  login: (method: AuthMethod, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<DeleteAccountResult>;
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
  deleteAccount: async () => ({ ok: false, reason: 'unknown' }),
  updateProfile: async () => {}, checkUsernameAvailable: async () => false,
});

/** AsyncStorage keys NOT to wipe on account deletion — these are device-level
 *  preferences that should survive (language, theme, time format) so the
 *  device behaves the same after a user signs out, not be jarringly reset
 *  to defaults. Everything else under the `analistas` prefix is user data
 *  and gets cleared. */
const PRESERVE_ON_DELETE = new Set<string>([
  'analistas_language',
  'analistas_time_format',
  'analistas-dark-mode',
]);

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

  // ── deleteAccount ──────────────────────────────────────────────────────────
  //
  // Apple App Store and Google Play require apps that allow account creation
  // to also allow in-app deletion (no "email us" loophole). This is the
  // implementation.
  //
  // Order matters:
  //   1) Firestore — delete the user doc + free up the username so it can be
  //      claimed again. We delete these BEFORE the auth user because once
  //      `deleteUser` succeeds we lose the credentials needed to write.
  //   2) AsyncStorage — wipe user data (favourites, streak, viewing
  //      history, notification prefs) while keeping device-level UX
  //      preferences (language, theme, time format).
  //   3) Firebase Auth — the destructive step. Apple/Google credentials
  //      linked to this Firebase user are dropped server-side.
  //
  // Apple-specific note: full revocation of the Apple ID token requires a
  // backend call to https://appleid.apple.com/auth/revoke with the original
  // authorization code. That code isn't available client-side once the
  // session is established, so we rely on `deleteUser()` severing the
  // Firebase ↔ Apple binding. The user can also revoke Analistas under
  // Settings → Apple ID → Sign in with Apple. This is the same compromise
  // every Firebase + Apple Sign In app makes; App Store review accepts it.
  const deleteAccount = useCallback(async (): Promise<DeleteAccountResult> => {
    const fbUser = auth.currentUser;
    if (!fbUser || !user) return { ok: false, reason: 'unknown', message: 'no-user' };

    // 1) Firestore cleanup — username doc first, then user doc.
    //    Wrapped in try/catch individually so a missing/already-gone doc
    //    doesn't block the deletion chain.
    if (user.username) {
      try { await deleteDoc(doc(db, 'usernames', user.username)); } catch {}
    }
    try { await deleteDoc(doc(db, 'users', user.id)); } catch {}

    // 2) Local AsyncStorage cleanup — wipe everything under the `analistas`
    //    prefix except the device-level preferences listed above.
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const toRemove = allKeys.filter(
        k => k.startsWith('analistas') && !PRESERVE_ON_DELETE.has(k),
      );
      if (toRemove.length > 0) {
        await AsyncStorage.multiRemove(toRemove);
      }
    } catch {}

    // 3) Firebase Auth — the destructive step. Throws
    //    `auth/requires-recent-login` if the user's session is too old
    //    to delete without re-authentication. The caller catches that and
    //    prompts the user to sign in again.
    try {
      await deleteUser(fbUser);
      setUser(null);
      return { ok: true };
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/requires-recent-login') {
        return { ok: false, reason: 'requires-recent-login' };
      }
      return { ok: false, reason: 'unknown', message: String(code ?? err) };
    }
  }, [user]);

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
      deleteAccount,
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
