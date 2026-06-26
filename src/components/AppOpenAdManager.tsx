import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useAppOpenAd, TestIds } from 'react-native-google-mobile-ads';

// ⚠️  Replace these with real App Open unit IDs from AdMob before enabling.
//     AdMob → tu app → Bloques de anuncios → Añadir bloque → App Open.
//     Create one for iOS and one for Android.
const IOS_UNIT_ID = 'ca-app-pub-8947149240597843/8618605047';
const ANDROID_UNIT_ID = 'ca-app-pub-8947149240597843/7984180229';

const adUnitId = __DEV__
  ? TestIds.APP_OPEN
  : Platform.select({ ios: IOS_UNIT_ID, android: ANDROID_UNIT_ID }) ?? IOS_UNIT_ID;

const MIN_MS_BETWEEN_SHOWS = 4 * 60 * 60 * 1000; // 4 hours — respects user experience

export default function AppOpenAdManager() {
  const { isLoaded, isClosed, load, show } = useAppOpenAd(adUnitId, {
    requestNonPersonalizedAdsOnly: true,
  });

  const lastShownAt = useRef(0);
  const appStateRef = useRef(AppState.currentState);

  // Pre-load on mount
  useEffect(() => {
    load();
  }, [load]);

  // Reload after user closes the ad so next foreground has one ready
  useEffect(() => {
    if (isClosed) {
      load();
    }
  }, [isClosed, load]);

  // Show when the app comes from background to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      appStateRef.current = nextState;

      if (wasBackground && nextState === 'active') {
        const now = Date.now();
        if (isLoaded && now - lastShownAt.current >= MIN_MS_BETWEEN_SHOWS) {
          lastShownAt.current = now;
          show();
        }
      }
    });
    return () => sub.remove();
  }, [isLoaded, show]);

  return null;
}
