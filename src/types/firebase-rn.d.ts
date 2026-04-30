/**
 * firebase-rn.d.ts
 *
 * Module augmentation to expose React Native–specific Firebase Auth APIs
 * that are only present in @firebase/auth's RN build (dist/rn/index.rn.d.ts).
 *
 * TypeScript resolves '@firebase/auth' via the 'types' condition in package.json
 * exports (auth-public.d.ts), which predates the react-native condition and
 * doesn't include getReactNativePersistence. Metro bundler resolves correctly
 * at runtime via the 'react-native' condition → dist/rn/index.js.
 *
 * This augmentation bridges the gap so tsc is happy.
 */
import type { Persistence } from 'firebase/auth';

declare module '@firebase/auth' {
  /**
   * Returns a persistence object backed by AsyncStorage (React Native).
   * Pass AsyncStorage from @react-native-async-storage/async-storage.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function getReactNativePersistence(storage: any): Persistence;
}
