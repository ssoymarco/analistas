/**
 * authGoogle.ts
 *
 * Google Sign-In via expo-auth-session + Firebase credential.
 * Works in Expo Go (browser-based OAuth flow).
 *
 * Flow:
 *  1. Open Google OAuth in the system browser via expo-auth-session
 *  2. Receive id_token back via redirect
 *  3. Create Firebase GoogleAuthProvider credential
 *  4. signInWithCredential(auth, credential) → Firebase user
 */

import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, signInWithCredential, linkWithCredential } from 'firebase/auth';
import { auth } from './firebase';

// Required: warms up the browser on Android for faster auth
WebBrowser.maybeCompleteAuthSession();

// Client IDs from Firebase Console / GoogleService-Info.plist
// iOS Client ID: from GoogleService-Info.plist → CLIENT_ID
const IOS_CLIENT_ID =
  '562270448336-mpuuee0qov1j96eea9g5idh6b0eh79m3.apps.googleusercontent.com';

// Web Client ID: Firebase Console → Authentication → Sign-in method
// → Google → Web SDK configuration → Web client ID
const WEB_CLIENT_ID =
  '562270448336-d3ae5g54347do4nrmsoagjf7jsbc4d38.apps.googleusercontent.com';

export function useGoogleAuth() {
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: IOS_CLIENT_ID,
    webClientId: WEB_CLIENT_ID,
  });

  const signInWithGoogle = async (): Promise<void> => {
    const result = await promptAsync();

    if (result.type !== 'success') {
      if (result.type === 'cancel') throw new Error('cancelled');
      throw new Error('Google sign-in failed');
    }

    const { id_token } = result.params;
    if (!id_token) throw new Error('No id_token received from Google');

    const credential = GoogleAuthProvider.credential(id_token);
    await signInWithCredential(auth, credential);
    // After this, onAuthStateChanged in AuthContext fires with the real Firebase user
  };

  /**
   * Links the current anonymous session to a Google account.
   * Falls back to a normal sign-in if the Google account already exists
   * (auth/credential-already-in-use), in which case Firestore favorites
   * from the existing account take precedence.
   */
  const upgradeWithGoogle = async (): Promise<'linked' | 'signed_in'> => {
    const result = await promptAsync();
    if (result.type !== 'success') {
      if (result.type === 'cancel') throw new Error('cancelled');
      throw new Error('Google sign-in failed');
    }
    const { id_token } = result.params;
    if (!id_token) throw new Error('No id_token received from Google');

    const credential = GoogleAuthProvider.credential(id_token);
    const currentUser = auth.currentUser;

    if (currentUser?.isAnonymous) {
      try {
        await linkWithCredential(currentUser, credential);
        return 'linked';
      } catch (err: unknown) {
        const firebaseErr = err as { code?: string };
        if (firebaseErr.code === 'auth/credential-already-in-use') {
          // Google account exists — sign in to it; FavoritesContext will load its data
          await signInWithCredential(auth, credential);
          return 'signed_in';
        }
        throw err;
      }
    }

    await signInWithCredential(auth, credential);
    return 'signed_in';
  };

  return { signInWithGoogle, upgradeWithGoogle, googleAuthReady: !!request };
}
