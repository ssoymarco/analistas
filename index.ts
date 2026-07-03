import { registerRootComponent } from 'expo';

import App from './App';

// ── Live Activities Android: background handler de FCM ───────────────────────
// Los data messages de marcador (functions/src/live-activities.ts →
// sendAndroid) despiertan la app en modo HEADLESS aunque esté cerrada; aquí se
// actualiza/cancela la notificación ongoing. DEBE registrarse en el entry
// point, fuera del ciclo de React. Solo actúa en Android (el servicio es no-op
// en iOS y en binarios sin notifee — guard OTA cross-runtime). Blindado: un
// fallo aquí jamás debe impedir el arranque del app.
try {
  const { Platform } = require('react-native');
  if (Platform.OS === 'android') {
    const messaging = require('@react-native-firebase/messaging').default;
    const dispatch = async (remoteMessage: { data?: Record<string, string> }) => {
      try {
        const data = remoteMessage?.data;
        if (!data?.type?.startsWith('live_activity_')) return; // no es nuestro
        const {
          handleLiveScoreDataMessage,
        } = require('./src/services/liveScoreNotification');
        await handleLiveScoreDataMessage(data);
      } catch {
        // swallow — jamás crashear por un payload inesperado
      }
    };
    // App cerrada / en background → headless.
    messaging().setBackgroundMessageHandler(dispatch);
    // App en FOREGROUND pero en otra pantalla: el hook solo vive en la
    // pantalla del partido — sin esto, la notificación se congelaba mientras
    // el usuario navegaba en el resto del app.
    messaging().onMessage(dispatch);
  }
} catch {
  // messaging ausente/instalación parcial — arrancar el app igual
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
