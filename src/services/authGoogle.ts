/**
 * authGoogle.ts
 *
 * Google Sign-In via the native @react-native-google-signin/google-signin
 * SDK + Firebase credential. This is the path Firebase officially recommends
 * for React Native apps.
 *
 * Flow:
 *  1. GoogleSignin.signIn() opens the platform-native account picker
 *     (Google Play Services on Android, ASAuthorizationController on iOS).
 *  2. The SDK returns a real id_token directly — no OAuth code exchange,
 *     no browser detour, no custom URI scheme dance.
 *  3. We hand that id_token to Firebase via GoogleAuthProvider.credential
 *     and signInWithCredential.
 *  4. onAuthStateChanged in AuthContext fires with the real Firebase user.
 *
 * Why we migrated from expo-auth-session/providers/google:
 *  - That library uses the OAuth authorization-code flow with PKCE on
 *    native, so Google's response only contains `code`, never `id_token`.
 *    Our code expected id_token and broke at the last step (see commit
 *    23c3898 for the diagnostic build that proved this — alert showed
 *    "No id_token received from Google (params keys: state, iss, code,
 *    scope, authuser, prompt)").
 *  - The native SDK doesn't have that problem.
 *
 * Required setup (all already done, recorded here for posterity):
 *  - Firebase Console → Authentication → Google provider enabled.
 *  - Android: SHA-1 of Play app signing key registered in Firebase
 *    (0f24...), google-services.json downloaded to project root.
 *  - iOS: GoogleService-Info.plist at project root, CLIENT_ID and
 *    REVERSED_CLIENT_ID match. The native SDK reads the plist
 *    automatically — no manual iOS Client ID needed in JS.
 *  - app.json plugin: "@react-native-google-signin/google-signin"
 *    (added automatically by `npx expo install`).
 *  - Web Client ID below is required so the id_token we get can be
 *    validated against the Firebase project's web OAuth client.
 */

import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {
  GoogleAuthProvider,
  signInWithCredential,
  linkWithCredential,
} from 'firebase/auth';
import { auth } from './firebase';

// Web Client ID from Firebase Console → Project Settings → General →
// Your apps → Web SDK configuration. The native SDK uses this to mint
// id_tokens that Firebase will accept (the audience of the id_token is
// the web client, not the platform-specific Android/iOS clients).
const WEB_CLIENT_ID =
  '562270448336-d3ae5g54347do4nrmsoagjf7jsbc4d38.apps.googleusercontent.com';

// Configure the native SDK once at module load. Safe to call repeatedly;
// the SDK ignores subsequent calls if config didn't change.
GoogleSignin.configure({
  webClientId: WEB_CLIENT_ID,
  // offlineAccess: false → don't request a serverAuthCode; we only need
  // the id_token for Firebase. Set to true only if we add a backend that
  // needs to make Google API calls on the user's behalf.
  offlineAccess: false,
});

/**
 * Pull an id_token out of the native sign-in result. The SDK has changed
 * shape across major versions (v10 returned { idToken } at the top level,
 * v13+ returns { type, data: { idToken } }), so check both.
 */
function extractIdToken(result: unknown): string | null {
  const r = result as {
    idToken?: string | null;
    data?: { idToken?: string | null };
  };
  return r?.idToken ?? r?.data?.idToken ?? null;
}

export function useGoogleAuth() {
  const signInWithGoogle = async (): Promise<void> => {
    try {
      // hasPlayServices throws on Android if Play Services is missing/outdated.
      // No-op on iOS.
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      const result = await GoogleSignin.signIn();
      const idToken = extractIdToken(result);

      if (!idToken) {
        throw new Error('No idToken returned from native Google Sign-In SDK');
      }

      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(auth, credential);
      // AuthContext.onAuthStateChanged picks up the new Firebase user.
    } catch (err: unknown) {
      throw normalizeError(err);
    }
  };

  /**
   * Links the current anonymous session to a Google account.
   * Falls back to a normal sign-in if the Google account already exists
   * (auth/credential-already-in-use), in which case Firestore favorites
   * from the existing account take precedence over the anonymous data.
   */
  const upgradeWithGoogle = async (): Promise<'linked' | 'signed_in'> => {
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      const result = await GoogleSignin.signIn();
      const idToken = extractIdToken(result);
      if (!idToken) {
        throw new Error('No idToken returned from native Google Sign-In SDK');
      }

      const credential = GoogleAuthProvider.credential(idToken);
      const currentUser = auth.currentUser;

      if (currentUser?.isAnonymous) {
        try {
          await linkWithCredential(currentUser, credential);
          return 'linked';
        } catch (linkErr: unknown) {
          const e = linkErr as { code?: string };
          if (e.code === 'auth/credential-already-in-use') {
            // Existing Google account — sign in to it instead. FavoritesContext
            // will load its data and the anonymous data is abandoned.
            await signInWithCredential(auth, credential);
            return 'signed_in';
          }
          throw linkErr;
        }
      }

      await signInWithCredential(auth, credential);
      return 'signed_in';
    } catch (err: unknown) {
      throw normalizeError(err);
    }
  };

  return {
    signInWithGoogle,
    upgradeWithGoogle,
    // Kept for API compatibility with the old expo-auth-session implementation
    // — consumers can still gate their UI on these but they're always ready
    // with the native SDK.
    googleAuthReady: true,
    androidGoogleConfigured: true,
  };
}

/**
 * Convert native SDK errors and Firebase errors into a single Error shape
 * that the caller can pattern-match on. Notably, when the user dismisses
 * the picker the SDK throws with code SIGN_IN_CANCELLED — we re-throw as
 * Error('cancelled') so OnboardingScreen's existing check keeps working.
 */
function normalizeError(err: unknown): Error {
  const e = err as { code?: string | number; message?: string };

  // Native SDK cancellation codes — strings on iOS, numeric on Android in
  // older versions. Both map to the same logical "user backed out" state.
  if (
    e.code === statusCodes.SIGN_IN_CANCELLED ||
    e.code === 'SIGN_IN_CANCELLED' ||
    e.code === '-5' || // historical iOS cancel
    e.code === 12501 // historical Android cancel
  ) {
    return new Error('cancelled');
  }

  // Surface code + message so the diagnostic alert in OnboardingScreen
  // still shows actionable info if something else goes wrong.
  const code = e.code != null ? `[${e.code}] ` : '';
  const msg = e.message ?? String(err);
  return new Error(`${code}${msg}`);
}
