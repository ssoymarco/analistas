import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { isAdsReady, onAdsReady } from '../services/adMobService';
import { Sentry } from '../services/sentry';
import { useSubscription } from '../contexts/SubscriptionContext';

const IOS_UNIT_ID = 'ca-app-pub-8947149240597843/6829998779';
const ANDROID_UNIT_ID = 'ca-app-pub-8947149240597843/5516917107';

const adUnitId = __DEV__
  ? TestIds.BANNER
  : Platform.select({ ios: IOS_UNIT_ID, android: ANDROID_UNIT_ID }) ?? IOS_UNIT_ID;

export default function AdMobBanner() {
  const { isProUser } = useSubscription();
  const [ready, setReady] = useState(isAdsReady());
  // Collapse to 0 height until an ad actually fills — avoids a blank strip on
  // no-fill. The BannerAd stays mounted (clipped) so it can still request.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (ready) return;
    return onAdsReady(() => setReady(true));
  }, [ready]);

  if (isProUser || !ready) return null;

  return (
    <View style={{ alignItems: 'center', height: loaded ? undefined : 0, overflow: 'hidden' }}>
      <BannerAd
        unitId={adUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdLoaded={() => setLoaded(true)}
        onAdFailedToLoad={error => {
          setLoaded(false);
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
