// Metro config of the web UI test harness (scripts/fb-tests/web). build.sh copies it to the
// repo root as metro.config.js for the duration of a web export and removes it afterwards —
// the app's real builds never see it.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const config = getDefaultConfig(__dirname);
const W = path.join(__dirname, 'scripts/fb-tests/web/stubs');
const NATIVE = [
  /^react-native-google-mobile-ads/, /^@react-native-firebase\//, /^@notifee\//, /^@react-native-google-signin\//,
  /^react-native-purchases/, /^@sentry\/react-native/, /^expo-dynamic-app-icon/, /^react-native-view-shot/,
  /^expo-media-library/, /^expo-tracking-transparency/,
];
const FIREBASE = path.join(__dirname, 'src/services/firebase');
const USE_PRODUCTION = process.env.HARNESS_FIREBASE === 'production';
config.resolver.resolveRequest = (ctx, name, platform) => {
  if (platform === 'web') {
    if (/^react-native-view-shot/.test(name)) return { type: 'sourceFile', filePath: path.join(W, 'viewshot-stub.js') };
    if (/^@react-native-community\/netinfo/.test(name)) return { type: 'sourceFile', filePath: path.join(W, 'netinfo-stub.js') };
    if (/^@react-native-firebase\/messaging$/.test(name)) return { type: 'sourceFile', filePath: path.join(W, 'messaging-stub.js') };
    if (NATIVE.some(r => r.test(name))) return { type: 'sourceFile', filePath: path.join(W, 'native-stub.js') };
    if (/exports\/InteractionManager(\/index)?$/.test(name) && /react-native-web/.test(ctx.originModulePath)) {
      return { type: 'sourceFile', filePath: path.join(W, 'interaction-stub.js') };
    }
    // HARNESS_FIREBASE=production keeps the app's real Firebase module (a guest
    // session against the live project); the default points at the emulators.
    if (!USE_PRODUCTION && name.startsWith('.') && path.resolve(path.dirname(ctx.originModulePath), name) === FIREBASE) {
      return { type: 'sourceFile', filePath: path.join(W, 'firebase-web.ts') };
    }
  }
  return ctx.resolveRequest(ctx, name, platform);
};
module.exports = config;
