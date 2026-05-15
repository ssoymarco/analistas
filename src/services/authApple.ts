/**
 * authApple.ts
 *
 * Sign In with Apple via expo-apple-authentication + Firebase credential.
 * Requires a native dev build (does NOT work in Expo Go).
 *
 * Flow:
 *  1. Call AppleAuthentication.signInAsync() → native Apple sheet
 *  2. Receive identityToken back from Apple
 *  3. Create Firebase OAuthProvider credential with the token
 *  4. signInWithCredential(auth, credential) → Firebase user
 *
 * Apple Developer setup (required once):
 *  1. developer.apple.com → Certificates, Identifiers & Profiles
 *     → Identifiers → app.analistas → Enable "Sign In with Apple"
 *  2. Keys → "+" → Sign In with Apple → Download .p8 key (keep it safe!)
 *  3. Firebase Console → Authentication → Sign-in method → Apple
 *     → Service ID: app.analistas
 *     → Apple Team ID: (from developer.apple.com → Membership)
 *     → Key ID + Private Key: from step 2
 *
 * Note: Sign In with Apple is only available on real iOS devices and
 * simulators running iOS 13+. Always check isAppleAuthAvailable() first.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import {
  OAuthProvider,
  signInWithCredential,
  linkWithCredential,
} from 'firebase/auth';
import { auth } from './firebase';

// ── Availability ──────────────────────────────────────────────────────────────

/**
 * Returns true if Sign In with Apple is available on this device.
 * Always false on Android and on iOS < 13.
 */
export async function isAppleAuthAvailable(): Promise<boolean> {
  return AppleAuthentication.isAvailableAsync();
}

// ── Core sign-in ──────────────────────────────────────────────────────────────

/**
 * Full Sign In with Apple flow.
 * Triggers the native Apple authentication sheet, exchanges the resulting
 * identity token for a Firebase credential, and signs the user in.
 *
 * Throws:
 *  - { code: 'ERR_REQUEST_CANCELED' } if the user dismissed the sheet
 *  - Firebase errors if the token exchange fails
 */
export async function signInWithApple(): Promise<void> {
  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  const { identityToken } = appleCredential;
  if (!identityToken) throw new Error('No identity token received from Apple');

  const provider = new OAuthProvider('apple.com');
  const firebaseCredential = provider.credential({ idToken: identityToken });

  await signInWithCredential(auth, firebaseCredential);
  // onAuthStateChanged in AuthContext fires automatically after this
}

// ── Guest upgrade ─────────────────────────────────────────────────────────────

/**
 * Links the current anonymous session to an Apple account.
 * Falls back to a normal sign-in if the Apple account already has a Firebase
 * user (auth/credential-already-in-use), keeping that account's data.
 *
 * Returns:
 *  - 'linked'    if the anonymous session was upgraded successfully
 *  - 'signed_in' if we switched to an existing Apple-linked Firebase account
 */
export async function upgradeWithApple(): Promise<'linked' | 'signed_in'> {
  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  const { identityToken } = appleCredential;
  if (!identityToken) throw new Error('No identity token received from Apple');

  const provider = new OAuthProvider('apple.com');
  const firebaseCredential = provider.credential({ idToken: identityToken });

  const currentUser = auth.currentUser;

  if (currentUser?.isAnonymous) {
    try {
      await linkWithCredential(currentUser, firebaseCredential);
      return 'linked';
    } catch (err: unknown) {
      const firebaseErr = err as { code?: string };
      if (firebaseErr.code === 'auth/credential-already-in-use') {
        // Apple account already has a Firebase user — sign in to it
        await signInWithCredential(auth, firebaseCredential);
        return 'signed_in';
      }
      throw err;
    }
  }

  await signInWithCredential(auth, firebaseCredential);
  return 'signed_in';
}
