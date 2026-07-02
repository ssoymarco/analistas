// ── AppIconScreen — alternate app-icon picker (Titular / Pro only) ────────────
// Lets Pro users switch the home-screen icon between the bundled alternates.
// The icons are declared natively via the expo-dynamic-app-icon config plugin
// (see app.json); this screen only flips between them at runtime. It's reached
// from the Perfil "App Icon" row, which gates entry to Pro users (non-Pro go
// to the paywall instead).
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../theme/useTheme';
import type { PerfilStackParamList } from '../navigation/AppNavigator';

// Chevron back arrow (matches the inline style used across the app's screens).
function BackArrow({ color }: { color: string }) {
  return (
    <View style={{
      width: 11, height: 11,
      borderLeftWidth: 2.5, borderBottomWidth: 2.5,
      borderColor: color, transform: [{ rotate: '45deg' }],
    }} />
  );
}

// ── Native-module guard (OTA cross-runtime safety) ───────────────────────────
// `expo-dynamic-app-icon` is a NATIVE module — it only exists in binaries built
// with the config plugin (build 39+). This same JS bundle is OTA-published to
// runtime 1.3.0, which ALSO covers older build 38 (no native module). A static
// import would crash those builds at launch (requireNativeModule throws), so we
// require it lazily inside try/catch and no-op when it's absent.
let setAppIcon: ((name: string) => string | false) | null = null;
let getAppIcon: (() => string) | null = null;
try {
  const mod = require('expo-dynamic-app-icon');
  setAppIcon = mod.setAppIcon;
  getAppIcon = mod.getAppIcon;
} catch { /* native module absent — icon switching unavailable on this build */ }

// key === the name declared in app.json's expo-dynamic-app-icon config.
// 'DEFAULT' is the plugin's sentinel for the original (stock) icon.
const ICONS: { key: string; label: string; source: any }[] = [
  { key: 'DEFAULT',   label: 'Original',   source: require('../../assets/icon.png') },
  { key: 'Mexico',    label: 'México',     source: require('../../assets/appIcons/Mexico.png') },
  { key: 'Argentina', label: 'Argentina',  source: require('../../assets/appIcons/Argentina.png') },
  { key: 'Portugal',  label: 'Portugal',   source: require('../../assets/appIcons/Portugal.png') },
  { key: 'Aguilas',   label: 'Águilas',    source: require('../../assets/appIcons/America.png') },
  { key: 'Rebano',    label: 'Rebaño',     source: require('../../assets/appIcons/Chivas.png') },
  { key: 'Blaugrana', label: 'Blaugrana',  source: require('../../assets/appIcons/Barca.png') },
  { key: 'Madrid',    label: 'Madrid',     source: require('../../assets/appIcons/Madrid.png') },
  { key: 'City',      label: 'City',       source: require('../../assets/appIcons/City.png') },
  { key: 'Dorado',    label: 'Dorado',     source: require('../../assets/appIcons/Dorado.png') },
  { key: 'Blanco',    label: 'Blanco',     source: require('../../assets/appIcons/Blanco.png') },
  { key: 'Futbol',    label: 'Fútbol',     source: require('../../assets/appIcons/Futbol.png') },
  { key: 'Clasico',   label: 'Clásico',    source: require('../../assets/appIcons/Version2.png') },
];

// Map our display keys → the exact names registered in app.json. Countries and
// generic ones match 1:1; the color-named ones map to their source file's key.
const NATIVE_KEY: Record<string, string> = {
  Aguilas: 'America', Rebano: 'Chivas', Blaugrana: 'Barca',
  Clasico: 'Version2',
};

function toNativeKey(key: string): string {
  return NATIVE_KEY[key] ?? key;
}

export const AppIconScreen: React.FC = () => {
  const c = useThemeColors();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<PerfilStackParamList>>();

  const [current, setCurrent] = useState<string>(() => {
    try { return getAppIcon?.() ?? 'DEFAULT'; } catch { return 'DEFAULT'; }
  });

  const apply = useCallback((displayKey: string) => {
    if (!setAppIcon) return; // native module unavailable on this build — no-op
    const native = toNativeKey(displayKey);
    // Reading getAppIcon after set keeps us in sync with what iOS actually
    // applied (it returns 'DEFAULT' when no alternate is active).
    try {
      const result = setAppIcon(native);
      if (result !== false) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        // Reflect the icon iOS reports as active (normalizes back to our display key).
        const active = getAppIcon?.() ?? native;
        setCurrent(active);
      }
    } catch { /* no-op: alternate icons unsupported on this device */ }
  }, []);

  // Which display key is active? getAppIcon returns the native key; map it back.
  const activeDisplayKey = (() => {
    const inverse = Object.entries(NATIVE_KEY).find(([, nat]) => nat === current);
    return inverse ? inverse[0] : current;
  })();

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: c.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={[s.backBtn, { backgroundColor: c.surface }]} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <BackArrow color={c.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.title, { color: c.textPrimary }]}>{t('appIcon.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
        <Text style={[s.subtitle, { color: c.textSecondary }]}>{t('appIcon.subtitle')}</Text>
        <View style={s.gridInner}>
          {ICONS.map(icon => {
            const selected = activeDisplayKey === icon.key;
            return (
              <TouchableOpacity
                key={icon.key}
                style={s.cell}
                activeOpacity={0.8}
                onPress={() => apply(icon.key)}
              >
                <View style={[
                  s.iconWrap,
                  { borderColor: selected ? c.accent : 'transparent', backgroundColor: c.card },
                ]}>
                  <Image source={icon.source} style={s.iconImg} contentFit="cover" />
                </View>
                <Text style={[s.label, { color: selected ? c.accent : c.textSecondary }]} numberOfLines={1}>
                  {icon.label}
                </Text>
                {/* Radio selector below the icon — X-style */}
                <View style={[
                  s.radio,
                  selected ? { backgroundColor: c.accent, borderColor: c.accent } : { borderColor: c.textTertiary },
                ]}>
                  {selected && <Text style={s.radioMark}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        {Platform.OS === 'android' && (
          <Text style={[s.note, { color: c.textTertiary }]}>{t('appIcon.androidNote')}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const CELL = '30%';
const s = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '800' },
  subtitle: { fontSize: 13, textAlign: 'center', marginBottom: 20, paddingHorizontal: 20, lineHeight: 19 },
  grid: { padding: 16, paddingBottom: 40 },
  gridInner: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16 },
  cell: { width: CELL, alignItems: 'center', marginBottom: 8 },
  iconWrap: {
    width: '100%', aspectRatio: 1, borderRadius: 18, borderWidth: 2.5,
    overflow: 'hidden', position: 'relative',
  },
  iconImg: { width: '100%', height: '100%', borderRadius: 15 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, marginTop: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  radioMark: { color: '#000', fontSize: 12, fontWeight: '900' },
  note: { fontSize: 11, textAlign: 'center', marginTop: 20, paddingHorizontal: 20, lineHeight: 16 },
});
