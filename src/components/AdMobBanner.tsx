import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { isAdsReady, onAdsReady } from '../services/adMobService';
import { Sentry } from '../services/sentry';

const IOS_UNIT_ID = 'ca-app-pub-8947149240597843/6829998779';
const ANDROID_UNIT_ID = 'ca-app-pub-8947149240597843/5516917107';

const adUnitId = __DEV__
  ? TestIds.BANNER
  : Platform.select({ ios: IOS_UNIT_ID, android: ANDROID_UNIT_ID }) ?? IOS_UNIT_ID;

export default function AdMobBanner() {
  const [ready, setReady] = useState(isAdsReady());

  useEffect(() => {
    if (ready) return;
    return onAdsReady(() => setReady(true));
  }, [ready]);

  if (!ready) return null;

  return (
    <View style={{ alignItems: 'center' }}>
      <BannerAd
        unitId={adUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdFailedToLoad={error => {
          const code = String((error as unknown as { code?: string }).code ?? '');
          if (!code || code.includes('no-fill') || code.includes('timeout') ||
              error.message?.includes('No fill') || error.message?.includes('timeout')) return;
          Sentry.captureMessage(`[AdMob ${Platform.OS}] banner failed: ${code}`, {
            level: 'error',
            tags: { platform: Platform.OS, adUnitId },
            extra: { message: error.message },
          });
        }}
      />
    </View>
  );
}
