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
    messaging().setBackgroundMessageHandler(async (remoteMessage: {
      data?: Record<string, string>;
    }) => {
      try {
        const data = remoteMessage?.data;
        if (!data?.type?.startsWith('live_activity_')) return; // no es nuestro
        const {
          showOrUpdateLiveScore,
          cancelLiveScore,
        } = require('./src/services/liveScoreNotification');
        if (data.type === 'live_activity_update' && data.attributes && data.state) {
          await showOrUpdateLiveScore(JSON.parse(data.attributes), JSON.parse(data.state));
        } else if (data.type === 'live_activity_end') {
          // El 'end' llega CON estado final → mostrar FINAL descartable
          // (equivalente del linger de iOS); sin estado → retirar sin más.
          if (data.attributes && data.state) {
            await showOrUpdateLiveScore(JSON.parse(data.attributes), JSON.parse(data.state));
          } else if (data.matchId) {
            await cancelLiveScore(data.matchId);
          }
        }
      } catch {
        // swallow — headless no debe crashear por un payload inesperado
      }
    });
  }
} catch {
  // messaging ausente/instalación parcial — arrancar el app igual
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
