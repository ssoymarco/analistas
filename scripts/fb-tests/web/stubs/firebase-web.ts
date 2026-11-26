// Web test harness only: the app's Firebase module, pointed at local emulators.
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const fresh = getApps().length === 0;
const app = fresh
  ? initializeApp({ apiKey: 'demo-key', projectId: 'demo-analistas', appId: '1:1:web:demo', authDomain: 'demo-analistas.firebaseapp.com' })
  : getApps()[0];
export const auth = getAuth(app);
export const db = getFirestore(app);
if (fresh) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8085);
  connectFunctionsEmulator(getFunctions(app, 'us-central1'), '127.0.0.1', 5055);
}
export default app;
