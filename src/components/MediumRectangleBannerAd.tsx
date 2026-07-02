import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { isAdsReady, onAdsReady } from '../services/adMobService';
import { Sentry } from '../services/sentry';
import { useSubscription } from '../contexts/SubscriptionContext';

const IOS_UNIT_ID     = 'ca-app-pub-8947149240597843/4685450078';
const ANDROID_UNIT_ID = 'ca-app-pub-8947149240597843/3343045871';

const adUnitId = __DEV__
  ? TestIds.BANNER
  : Platform.select({ ios: IOS_UNIT_ID, android: ANDROID_UNIT_ID }) ?? IOS_UNIT_ID;

export default function MediumRectangleBannerAd() {
  const { isProUser } = useSubscription();
  const [ready, setReady] = useState(isAdsReady());
  // Only reserve layout space once an ad actually fills. AdMob no-fills often,
  // and reserving the 300×250 box up-front left a blank gap. We keep the
  // BannerAd mounted (clipped to 0) so it can still request; on load we expand,
  // on no-fill/error it stays collapsed → no empty space.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (ready) return;
    return onAdsReady(() => setReady(true));
  }, [ready]);

  if (isProUser || !ready) return null;

  return (
    <View style={{ width: '100%', alignItems: 'center', marginVertical: loaded ? 8 : 0 }}>
      {/* 300×250 frame — a MEDIUM_RECTANGLE is exactly this size. Height is 0
          until an ad loads (no blank gap on no-fill); boxing also keeps the ad
          from stretching/cutting off and centers it on any screen width. */}
      <View style={{ width: 300, height: loaded ? 250 : 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <BannerAd
        unitId={adUnitId}
        size={BannerAdSize.MEDIUM_RECTANGLE}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdLoaded={() => setLoaded(true)}
        onAdFailedToLoad={error => {
          setLoaded(false);
          const code = String((error as unknown as { code?: string }).code ?? '');
          if (!code || code.includes('no-fill') || code.includes('timeout') ||
              error.message?.includes('No fill') || error.message?.includes('timeout')) return;
          Sentry.captureMessage(`[AdMob ${Platform.OS}] MREC failed: ${code}`, {
            level: 'error',
            tags: { platform: Platform.OS, adUnitId },
            extra: { message: error.message },
          });
        }}
      />
      </View>
    </View>
  );
}
