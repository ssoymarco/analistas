/**
 * admin-init.ts
 *
 * Centralised Firebase Admin initialization. Importing this module guarantees
 * that `admin.initializeApp()` has been called before any other module touches
 * `admin.firestore()` (or any other Admin service).
 *
 * Every file that needs Firestore should `import { db } from './admin-init'`
 * instead of calling `admin.firestore()` directly at module load — otherwise
 * we hit "The default Firebase app does not exist" during code analysis.
 */
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

export { admin };
export const db = admin.firestore();
