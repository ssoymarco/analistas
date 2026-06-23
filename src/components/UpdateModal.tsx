import React, { useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  Animated, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useDarkMode } from '../contexts/DarkModeContext';
import type { UpdateStatus } from '../hooks/useVersionCheck';

interface UpdateModalProps {
  visible: boolean;
  status: UpdateStatus;
  storeUrl: string;
  latestVersion: string;
  onDismiss: () => void;
}

const UpdateModal: React.FC<UpdateModalProps> = ({
  visible, status, storeUrl, latestVersion, onDismiss,
}) => {
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

  const handleUpdate = () => {
    Linking.openURL(storeUrl).catch(() => {});
  };

  const isRequired = status === 'required';
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
          {!isRequired && (
            <View style={[s.handle, { backgroundColor: handleColor }]} />
          )}

          <View style={s.iconWrap}>
            <View style={s.iconCircle}>
              <Text style={s.iconText}>⚽</Text>
            </View>
          </View>

          <Text style={[s.title, { color: textPrimary }]}>
            {t(isRequired ? 'update.requiredTitle' : 'update.optionalTitle')}
          </Text>

          <Text style={[s.version, { color: '#00E096' }]}>
            v{latestVersion}
          </Text>

          <Text style={[s.body, { color: textSecondary }]}>
            {t(isRequired ? 'update.requiredBody' : 'update.optionalBody')}
          </Text>

          <TouchableOpacity
            style={s.updateBtn}
            onPress={handleUpdate}
            activeOpacity={0.85}
          >
            <Text style={s.updateBtnText}>{t('update.updateNow')}</Text>
          </TouchableOpacity>

          {!isRequired && (
            <TouchableOpacity
              style={s.laterBtn}
              onPress={() => dismiss(onDismiss)}
              activeOpacity={0.7}
            >
              <Text style={[s.laterText, { color: textSecondary }]}>
                {t('update.later')}
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 4,
  },
  iconWrap: { alignItems: 'center', paddingTop: 8 },
  iconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#1E1E1E',
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { fontSize: 36 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  version: { fontSize: 13, fontWeight: '700', textAlign: 'center', letterSpacing: 0.5 },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  updateBtn: {
    backgroundColor: '#00E096',
    borderRadius: 16, paddingVertical: 18,
    alignItems: 'center', marginTop: 4,
    shadowColor: '#00E096',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  updateBtnText: {
    fontSize: 17, fontWeight: '900', color: '#0D0D0D', letterSpacing: 0.5,
  },
  laterBtn: { alignItems: 'center', paddingVertical: 8 },
  laterText: { fontSize: 14, fontWeight: '500' },
});

export default UpdateModal;
