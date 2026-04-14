/**
 * firebase.ts
 *
 * Firebase app initialization for Analistas.
 * Uses the JS SDK v10+ (modular) — compatible with Expo Go and managed workflow.
 *
 * Auth persistence: getReactNativePersistence(AsyncStorage) keeps the user
 * logged in across app restarts without requiring re-authentication.
 */

import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth } from 'firebase/auth';
import { getReactNativePersistence } from '@firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey:            'AIzaSyAc4GY4VxjW5XBnTVGmIQxZnZyZKYj8UXo',
  authDomain:        'analistas-8ba26.firebaseapp.com',
  projectId:         'analistas-8ba26',
  storageBucket:     'analistas-8ba26.firebasestorage.app',
  messagingSenderId: '562270448336',
  appId:             '1:562270448336:web:d674e37d3a016bf7ef8cd5',
  measurementId:     'G-8JQ9VW8R4Q',
};

// Guard against duplicate initialization (hot reload, fast refresh)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);

export default app;
