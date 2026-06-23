import React from 'react';
import { Platform, View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

const IOS_UNIT_ID = 'ca-app-pub-8947149240597843/9316266162';
const ANDROID_UNIT_ID = 'ca-app-pub-8947149240597843/5516917107';

const adUnitId = __DEV__
  ? TestIds.BANNER
  : Platform.select({ ios: IOS_UNIT_ID, android: ANDROID_UNIT_ID }) ?? IOS_UNIT_ID;

export default function AdMobBanner() {
  return (
    <View style={{ alignItems: 'center' }}>
      <BannerAd
        unitId={adUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
      />
    </View>
  );
}
