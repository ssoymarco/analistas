// ATTModal — App Tracking Transparency pre-permission bottom sheet
// Shows 7s after first home mount. Only shown once (AsyncStorage flag).
// Compliant with App Store Review Guidelines 5.1.2.

import React, { useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  Animated, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useDarkMode } from '../contexts/DarkModeContext';

interface ATTModalProps {
  visible: boolean;
  onContinue: () => void;
  onSkip: () => void;
}

const ATTModal: React.FC<ATTModalProps> = ({ visible, onContinue, onSkip }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { isDark } = useDarkMode();
  const slideAnim = useRef(new Animated.Value(400)).current;
  const prevVisible = useRef(false);

  if (visible && !prevVisible.current) {
    prevVisible.current = true;
    Animated.spring(slideAnim, {
      toValue: 0, useNativeDriver: true, tension: 65, friction: 11,
    }).start();
  }

  const dismiss = (cb: () => void) => {
    Animated.timing(slideAnim, {
      toValue: 400, duration: 220, useNativeDriver: true,
    }).start(() => {
      prevVisible.current = false;
      slideAnim.setValue(400);
      cb();
    });
  };

  const bg = isDark ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = isDark ? '#FFFFFF' : '#000000';
  const textSecondary = isDark ? '#8E8E93' : '#6B7280';
  const handleColor = isDark ? '#48484A' : '#D1D1D6';

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <View style={s.backdrop}>
        <Animated.View
          style={[
            s.sheet,
            { backgroundColor: bg, paddingBottom: insets.bottom + 24 },
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={[s.handle, { backgroundColor: handleColor }]} />

          <View style={s.iconWrap}>
            <Text style={{ fontSize: 44 }}>🎯</Text>
          </View>

          <Text style={[s.title, { color: textPrimary }]}>
            {t('onboarding.attTitle')}
          </Text>

          <Text style={[s.body, { color: textSecondary }]}>
            {t('onboarding.attBody')}
          </Text>

          <TouchableOpacity
            style={s.continueBtn}
            onPress={() => dismiss(onContinue)}
            activeOpacity={0.85}
          >
            <Text style={s.continueBtnText}>{t('onboarding.attContinue')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.skipBtn}
            onPress={() => dismiss(onSkip)}
            activeOpacity={0.7}
          >
            <Text style={[s.skipText, { color: textSecondary }]}>
              {t('onboarding.attSkip')}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 16,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 4,
  },
  iconWrap: { alignItems: 'center', paddingVertical: 4 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 23, textAlign: 'center' },
  continueBtn: {
    backgroundColor: '#2E7CF6',
    borderRadius: 16, paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#2E7CF6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  continueBtnText: {
    fontSize: 17, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5,
  },
  skipBtn: { alignItems: 'center', paddingVertical: 4 },
  skipText: { fontSize: 14, fontWeight: '500' },
});

export default ATTModal;
