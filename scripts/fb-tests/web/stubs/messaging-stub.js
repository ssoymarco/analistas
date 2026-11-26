// Web test harness only: @react-native-firebase/messaging with a device token,
// so flows that need one (Modo Estadio per match) can be walked through.
// Nothing is sent anywhere: topic calls resolve and no message ever arrives.
const off = () => () => {};
const api = {
  getToken: async () => 'web-harness-fcm-token-0123456789',
  getAPNSToken: async () => 'web-harness-apns-token',
  requestPermission: async () => 1,
  hasPermission: async () => 1,
  subscribeToTopic: async () => {},
  unsubscribeFromTopic: async () => {},
  getInitialNotification: async () => null,
  onMessage: off, onNotificationOpenedApp: off, onTokenRefresh: off,
  setBackgroundMessageHandler: () => {},
};
function messaging() { return api; }
messaging.AuthorizationStatus = { NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 };
module.exports = messaging;
module.exports.default = messaging;
module.exports.__esModule = true;
