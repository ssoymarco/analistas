// Stand-in for src/services/firebase.ts: a plain web-SDK app pointed at the
// Firestore emulator (the real module wires React Native auth persistence).
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-analistas', apiKey: 'fake', appId: 'fake' });
export const db = getFirestore(app);
connectFirestoreEmulator(db, host, Number(port));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auth: any = { currentUser: null };
export default app;
