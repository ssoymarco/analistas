// ── OfflineBanner ──────────────────────────────────────────────────────────────
// Slides down from the top when the device goes offline.
// Shows a brief "Conexión restaurada" confirmation when coming back online,
// then slides back up automatically.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNetwork } from '../contexts/NetworkContext';

const BANNER_H = 44;
const RESTORE_SHOW_MS = 2200; // how long "restored" message stays visible

export function OfflineBanner() {
  const { isConnected, isOffline } = useNetwork();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(-BANNER_H - 20)).current;
  const [restored, setRestored] = useState(false);
  const restoredTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track previous connection state to detect the online→transition
  const wasOffline = useRef(false);

  useEffect(() => {
    if (isConnected === null) return; // still checking on mount

    if (isOffline) {
      // Going offline → slide in
      wasOffline.current = true;
      setRestored(false);
      if (restoredTimer.current) clearTimeout(restoredTimer.current);
      Animated.spring(slideY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();
    } else {
      // Back online
      if (wasOffline.current) {
        // Was offline before → show "restored" briefly
        wasOffline.current = false;
        setRestored(true);
        Animated.spring(slideY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }).start();
        restoredTimer.current = setTimeout(() => {
          Animated.timing(slideY, {
            toValue: -BANNER_H - insets.top - 20,
            duration: 300,
            useNativeDriver: true,
          }).start(() => setRestored(false));
        }, RESTORE_SHOW_MS);
      } else {
        // Was already online on mount → keep banner hidden
        slideY.setValue(-BANNER_H - insets.top - 20);
      }
    }

    return () => {
      if (restoredTimer.current) clearTimeout(restoredTimer.current);
    };
  }, [isConnected, isOffline, insets.top, slideY]);

  // Don't render anything until we know the connection state
  if (isConnected === null && !isOffline) return null;

  const isRestored = restored && !isOffline;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.banner,
        {
          top: insets.top,
          transform: [{ translateY: slideY }],
          backgroundColor: isRestored ? '#10b981' : '#1f2937',
          borderColor: isRestored ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.08)',
        },
      ]}
    >
      <Text style={styles.icon}>{isRestored ? '✓' : '📡'}</Text>
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: isRestored ? '#fff' : '#f9fafb' }]}>
          {isRestored ? t('offline.backOnline') : t('offline.noConnection')}
        </Text>
        {!isRestored && (
          <Text style={styles.sub}>{t('offline.showingCached')}</Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 9999,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  icon: {
    fontSize: 18,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
  },
  sub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 1,
  },
});
