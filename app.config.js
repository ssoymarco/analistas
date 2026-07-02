// Dynamic Expo config layered on top of app.json.
//
// Purpose: exclude the `expo-dynamic-app-icon` config plugin from ANDROID
// builds. The custom app-icon picker is a PREMIUM feature, and premium is
// disabled on Android for now (no Play Billing / RevenueCat Android yet), so the
// plugin adds zero user-facing value there — and it was breaking the Android
// Gradle build under Expo SDK 54. iOS keeps the plugin (premium is live on iOS).
//
// app.json stays the single source of truth for everything else: Expo passes its
// parsed contents in as `config`, and we only touch the plugin list for Android.
module.exports = ({ config }) => {
  if (process.env.EAS_BUILD_PLATFORM === 'android' && Array.isArray(config.plugins)) {
    config.plugins = config.plugins.filter((p) => {
      const name = Array.isArray(p) ? p[0] : p;
      return !(typeof name === 'string' && name.includes('dynamic-app-icon'));
    });
  }
  return config;
};
