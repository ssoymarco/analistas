import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, TextInput,
  NativeSyntheticEvent, NativeScrollEvent, Share, Linking, Platform, Alert,
} from 'react-native';
import { haptics } from '../utils/haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PerfilStackParamList } from '../navigation/AppNavigator';
import { useThemeColors } from '../theme/useTheme';
import type { ColorPalette } from '../theme/colors';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useAuth } from '../contexts/AuthContext';
import { useOnboarding } from '../contexts/OnboardingContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { useUserStats } from '../contexts/UserStatsContext';
import { SkeletonPerfil } from '../components/Skeleton';
import { StreakModal } from '../components/StreakModal';
import { EditProfileModal } from '../components/EditProfileModal';
import { scheduleLocalNotification } from '../services/notifications';
import { useNotificationPrefs } from '../contexts/NotificationPrefsContext';
import { useTranslation } from 'react-i18next';
import i18n, { LANGUAGE_STORAGE_KEY } from '../i18n';

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('');
}

function IconCircle({ emoji, bg }: { emoji: string; bg: string }) {
  return (
    <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 16 }}>{emoji}</Text>
    </View>
  );
}

function MenuRow({ emoji, label, sublabel, iconBg, rightElement, onPress, accent, isLast, c }: {
  emoji: string; label: string; sublabel?: string; iconBg: string;
  rightElement?: React.ReactNode; onPress?: () => void;
  accent?: boolean; isLast?: boolean; c: ColorPalette;
}) {
  return (
    <TouchableOpacity
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
        !isLast && { borderBottomWidth: 1, borderBottomColor: c.border },
      ]}
      onPress={onPress} activeOpacity={onPress ? 0.7 : 1}
    >
      <IconCircle emoji={emoji} bg={iconBg} />
      <View style={{ flex: 1 }}>
        <Text style={[{ fontSize: 14, fontWeight: '500', color: c.textPrimary }, accent && { color: '#60a5fa', fontWeight: '600' }]}>{label}</Text>
        {sublabel && <Text style={{ fontSize: 11, color: c.textTertiary, marginTop: 1 }}>{sublabel}</Text>}
      </View>
      {rightElement ?? <Text style={{ fontSize: 22, color: accent ? '#60a5fa' : c.textTertiary }}>›</Text>}
    </TouchableOpacity>
  );
}

function SectionHeader({ label, c }: { label: string; c: ColorPalette }) {
  return (
    <Text style={{
      fontSize: 10, fontWeight: '700', color: c.textTertiary,
      letterSpacing: 1.5, textTransform: 'uppercase',
      marginBottom: 8, marginTop: 20, paddingHorizontal: 20,
    }}>{label}</Text>
  );
}

function AvatarView({ initials, size = 68 }: { initials: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.3, fontWeight: '900', color: '#ffffff' }}>{initials}</Text>
    </View>
  );
}

function CustomToggle({ value, onToggle, activeColor, icon }: {
  value: boolean; onToggle: () => void; activeColor: string; icon?: string;
}) {
  return (
    <TouchableOpacity
      style={{ width: 48, height: 28, borderRadius: 14, justifyContent: 'center', backgroundColor: value ? activeColor : 'rgba(128,128,128,0.25)' }}
      onPress={() => { haptics.light(); onToggle(); }} activeOpacity={0.8}
    >
      <View style={{
        width: 22, height: 22, borderRadius: 11, backgroundColor: '#ffffff',
        alignItems: 'center', justifyContent: 'center',
        transform: [{ translateX: value ? 22 : 3 }],
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
      }}>
        {icon ? <Text style={{ fontSize: 10 }}>{icon}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

// ── Bottom Sheet Modal ───────────────────────────────────────────────────────
function BottomSheet({ visible, onClose, c, children }: {
  visible: boolean; onClose: () => void; c: ColorPalette; children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={{
          backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '85%',
        }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 12 }} />
          <TouchableOpacity style={{ position: 'absolute', top: 16, right: 16, width: 28, height: 28, borderRadius: 14, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', zIndex: 10 }} onPress={onClose}>
            <Text style={{ fontSize: 14, color: c.textSecondary, fontWeight: '600' }}>✕</Text>
          </TouchableOpacity>
          {children}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Center Modal ─────────────────────────────────────────────────────────────
function CenterModal({ visible, onClose, c, children }: {
  visible: boolean; onClose: () => void; c: ColorPalette; children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 }} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={{ backgroundColor: c.card, borderRadius: 24, padding: 24, width: '100%', maxWidth: 340 }}>
          <TouchableOpacity style={{ position: 'absolute', top: 16, right: 16, width: 28, height: 28, borderRadius: 14, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', zIndex: 10 }} onPress={onClose}>
            <Text style={{ fontSize: 14, color: c.textSecondary, fontWeight: '600' }}>✕</Text>
          </TouchableOpacity>
          {children}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Modo Estadio Card ────────────────────────────────────────────────────────
const ESTADIO_DELAYS = [1, 2, 5, 10] as const;

function ModoEstadioCard({ c, isDark }: { c: ColorPalette; isDark: boolean }) {
  const { t } = useTranslation();
  const { prefs, togglePref, setEstadioDelay } = useNotificationPrefs();
  const { estadioMode, estadioDelay } = prefs;

  const accentGreen = '#00E096';
  const activeGreenBg = 'rgba(0,224,150,0.12)';
  const activeBorder = 'rgba(0,224,150,0.3)';

  return (
    <View style={{ marginHorizontal: 16, marginTop: 20, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: estadioMode ? activeBorder : c.border, backgroundColor: c.card }}>
      {/* Header strip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: estadioMode ? activeGreenBg : (isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'), alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 20 }}>🏟️</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary }}>{t('estadioMode.title')}</Text>
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(0,224,150,0.18)', borderWidth: 1, borderColor: 'rgba(0,224,150,0.3)' }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: accentGreen, letterSpacing: 0.8 }}>{t('estadioMode.badge')}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 11, color: estadioMode ? accentGreen : c.textTertiary, marginTop: 1, fontWeight: estadioMode ? '600' : '400' }}>
            {estadioMode ? t('estadioMode.enabled') : t('estadioMode.subtitle')}
          </Text>
        </View>
        <CustomToggle
          value={estadioMode}
          onToggle={() => { haptics.medium(); togglePref('estadioMode'); }}
          activeColor={accentGreen}
          icon="🏟️"
        />
      </View>

      {/* Description */}
      <View style={{ paddingHorizontal: 16, paddingBottom: estadioMode ? 0 : 14 }}>
        <Text style={{ fontSize: 12, color: c.textTertiary, lineHeight: 17 }}>
          {t('estadioMode.description')}
        </Text>
      </View>

      {/* Delay selector — visible only when mode is active */}
      {estadioMode && (
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 }}>
          <View style={{ height: 1, backgroundColor: c.border, marginBottom: 14 }} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: c.textTertiary, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
            {t('estadioMode.delay')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {ESTADIO_DELAYS.map(mins => {
              const active = estadioDelay === mins;
              return (
                <TouchableOpacity
                  key={mins}
                  style={{
                    flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center',
                    backgroundColor: active ? accentGreen : (isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'),
                    borderWidth: 1,
                    borderColor: active ? accentGreen : c.border,
                  }}
                  onPress={() => { haptics.selection(); setEstadioDelay(mins); }}
                  activeOpacity={0.75}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#000' : c.textSecondary }}>
                    {t('estadioMode.delayMinutes', { count: mins })}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Pre-match note */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}>
            <Text style={{ fontSize: 12 }}>💡</Text>
            <Text style={{ fontSize: 11, color: c.textTertiary, lineHeight: 15, flex: 1 }}>
              {t('estadioMode.preMatchNote')}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Promo Banner ─────────────────────────────────────────────────────────────
function PromoBanner({ onPress }: { onPress?: () => void }) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity style={{ marginHorizontal: 16, marginTop: 20, borderRadius: 16, backgroundColor: '#0d2b1a', overflow: 'hidden', padding: 16 }} activeOpacity={0.9} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <View style={{ backgroundColor: '#111', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 18, height: 18, borderRadius: 3, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>▼</Text>
            </View>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#ef4444', letterSpacing: 1 }}>{t('profile.substitute')}</Text>
          </View>
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 4 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 18, height: 18, borderRadius: 3, backgroundColor: '#22c55e', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>▲</Text>
            </View>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#4ade80', letterSpacing: 1 }}>{t('profile.starter')}</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(251,191,36,0.2)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)', marginBottom: 4 }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#fbbf24', letterSpacing: 1 }}>{t('profile.premium')}</Text>
          </View>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: -0.2 }}>{t('profile.promoTitle')}</Text>
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{t('profile.promoSubtitle')}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'rgba(34,197,94,0.2)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.3)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 14 }}>⚡</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{t('profile.levelUp')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 10, fontWeight: '600', color: 'rgba(52,211,153,0.6)' }}>{t('profile.seePlans')}</Text>
          <Text style={{ fontSize: 12, color: '#34d399' }}>→</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Languages ────────────────────────────────────────────────────────────────
const LANGUAGES = [
  { id: 'es', flag: '🇲🇽', name: 'Español' },
  { id: 'en', flag: '🇺🇸', name: 'English' },
  { id: 'pt', flag: '🇧🇷', name: 'Português (BR)' },
  { id: 'fr', flag: '🇫🇷', name: 'Français' },
  { id: 'de', flag: '🇩🇪', name: 'Deutsch' },
  { id: 'it', flag: '🇮🇹', name: 'Italiano' },
  { id: 'tr', flag: '🇹🇷', name: 'Türkçe' },
];

// ══════════════════════════════════════════════════════════════════════════════
export const PerfilScreen: React.FC = () => {
  const { t } = useTranslation();
  const c = useThemeColors();
  const { isDark, toggleDark } = useDarkMode();
  const navigation = useNavigation<NativeStackNavigationProp<PerfilStackParamList>>();
  const { user, isAuthenticated, login, logout } = useAuth();
  const { resetOnboarding } = useOnboarding();
  const { followedTeamIds, followedPlayerIds, followedLeagueIds } = useFavorites();
  const { matchesViewed, newsRead, streakDays, streakNotifyEnabled, setStreakNotify } = useUserStats();
  const totalFavorites = followedTeamIds.length + followedPlayerIds.length + followedLeagueIds.length;

  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 400); return () => clearTimeout(t); }, []);
  const [showNameInHeader, setShowNameInHeader] = useState(false);
  const [timeFormat, setTimeFormat] = useState<'24h' | '12h'>('24h');
  const [momiosEnabled, setMomiosEnabled] = useState(true);
  const [selectedLang, setSelectedLang] = useState(i18n.language || 'es');
  const [streakModalVisible, setStreakModalVisible] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [aboutModalVisible, setAboutModalVisible] = useState(false);
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');

  const displayName = user?.name ?? 'Visitante';
  const displayEmail = user?.email ?? '';
  const displayUsername = isAuthenticated
    ? '@' + (user?.username ?? user?.name?.toLowerCase().replace(/\s+/g, '.') ?? 'analista')
    : '';
  const initials = getInitials(displayName);
  const currentLang = LANGUAGES.find(l => l.id === selectedLang);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => { setShowNameInHeader(e.nativeEvent.contentOffset.y > 90); }, []);

  // ── Dev-only: triple-tap streak card → fire test notification ───────────────
  const devTapCount = React.useRef(0);
  const devTapTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDevTap = __DEV__
    ? () => {
        devTapCount.current += 1;
        if (devTapTimer.current) clearTimeout(devTapTimer.current);
        devTapTimer.current = setTimeout(() => { devTapCount.current = 0; }, 600);
        if (devTapCount.current >= 3) {
          devTapCount.current = 0;
          Alert.alert(t('profile.testNotification'), 'Elige el tipo:', [
            {
              text: '⚽ Gol',
              onPress: () => scheduleLocalNotification({
                type: 'goal', matchId: 'test-001',
                homeTeam: 'Real Madrid', awayTeam: 'Barcelona',
                homeScore: 1, awayScore: 0,
                scorerName: 'Vinícius Jr.', minute: 23, teamSide: 'home',
              }, 3),
            },
            {
              text: '📣 Inicio',
              onPress: () => scheduleLocalNotification({
                type: 'matchStart', matchId: 'test-001',
                homeTeam: 'Real Madrid', awayTeam: 'Barcelona',
                league: 'LaLiga', kickoffUtc: new Date(Date.now() + 5 * 60_000).toISOString(),
              }, 3),
            },
            {
              text: '📋 Alineaciones',
              onPress: () => scheduleLocalNotification({
                type: 'lineups', matchId: 'test-001',
                homeTeam: 'Real Madrid', awayTeam: 'Barcelona',
                league: 'LaLiga', homeFormation: '4-3-3', awayFormation: '4-2-3-1',
              }, 3),
            },
            {
              text: '🏆 Resultado final',
              onPress: () => scheduleLocalNotification({
                type: 'finalResult', matchId: 'test-001',
                homeTeam: 'Real Madrid', awayTeam: 'Barcelona',
                homeScore: 2, awayScore: 1, league: 'LaLiga',
              }, 3),
            },
            { text: t('common.cancel'), style: 'cancel' },
          ]);
        }
      }
    : undefined;
  const handleLogout = () => { haptics.heavy(); setLogoutModalVisible(false); logout(); resetOnboarding(); };

  const handleShare = useCallback(async () => {
    try { await Share.share({ message: 'Descarga Analistas, la mejor app para seguir el fútbol en tiempo real ⚽\nhttps://analistas.app' }); } catch {}
  }, []);

  const handleContact = useCallback(() => { Linking.openURL('mailto:comercial@somosanalistas.com?subject=Contacto%20desde%20Analistas'); }, []);

  const handleRateApp = useCallback(() => {
    const url = Platform.OS === 'ios' ? 'https://apps.apple.com/app/analistas' : 'https://play.google.com/store/apps/details?id=com.analistas';
    Linking.openURL(url);
  }, []);

  const handleClearCache = useCallback(() => {
    Alert.alert(t('profile.clearCache'), t('profile.clearCacheConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.clearCache'), style: 'destructive', onPress: async () => {
        try { await AsyncStorage.multiRemove(['analistas_fixtures_cache', 'analistas_news_cache']); Alert.alert(t('common.done'), t('profile.cacheCleared')); } catch { Alert.alert(t('common.error'), t('profile.cacheClearError')); }
      }},
    ]);
  }, [t]);

  const handleRedeemCode = useCallback(() => {
    if (!redeemCode.trim()) return;
    haptics.success();
    Alert.alert(t('profile.codeEntered'), t('profile.codeEnteredBody', { code: redeemCode }));
    setCodeModalVisible(false); setRedeemCode('');
  }, [redeemCode, t]);

  const userCardBg = isDark ? '#161b27' : '#ffffff';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(168,85,247,0.15)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 14 }}>👤</Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary }}>{t('profile.title')}</Text>
          {showNameInHeader && isAuthenticated && (
            <>
              <Text style={{ fontSize: 15, color: c.textTertiary }}> · </Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary, maxWidth: 140 }} numberOfLines={1}>{displayName}</Text>
            </>
          )}
        </View>
      </View>

      {loading ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
          <SkeletonPerfil />
        </ScrollView>
      ) : (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={16}>
        {/* User Card */}
        <View style={{ backgroundColor: userCardBg, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
            <View style={{ position: 'relative', flexShrink: 0 }}>
              <AvatarView initials={initials} size={68} />
              {isAuthenticated && (
                <View style={{ position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: '#10b981', borderWidth: 2, borderColor: userCardBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 8, fontWeight: '900', color: '#fff' }}>✓</Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: c.textPrimary }}>{displayName}</Text>
              {isAuthenticated && <Text style={{ fontSize: 14, fontWeight: '500', color: '#60a5fa', marginTop: 1 }}>{displayUsername}</Text>}
              {!isAuthenticated && <Text style={{ fontSize: 13, color: c.textSecondary, marginTop: 2 }}>{t('profile.loginPrompt')}</Text>}
              {isAuthenticated && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#f59e0b' }}>🛡️ Nivel: Suplente</Text>
                  </View>
                </View>
              )}
              {isAuthenticated && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
                  <Text style={{ fontSize: 10, color: c.textTertiary }}>
                  📅 Analistas · Miembro desde {user?.createdAt
                    ? user.createdAt.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
                    : 'hoy'}
                </Text>
                </View>
              )}
            </View>
            {isAuthenticated && (
              <TouchableOpacity style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center', marginTop: 2 }} activeOpacity={0.7} onPress={() => setEditProfileVisible(true)}>
                <Text style={{ fontSize: 14 }}>✏️</Text>
              </TouchableOpacity>
            )}
          </View>

          {!isAuthenticated && (
            <TouchableOpacity style={{ backgroundColor: c.accent, paddingHorizontal: 28, paddingVertical: 11, borderRadius: 20, alignSelf: 'center', marginTop: 12 }} onPress={resetOnboarding} activeOpacity={0.8}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{t('profile.signIn')}</Text>
            </TouchableOpacity>
          )}

          {/* Streak pill */}
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.bg, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, marginTop: 16 }}
            activeOpacity={0.8}
            onPress={() => { handleDevTap?.(); setStreakModalVisible(true); }}
          >
            <Text style={{ fontSize: 14 }}>🔥</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: c.textTertiary }}>{t('profile.streakActive')}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#ff7a00' }}>{t('streak.days', { count: streakDays })} 🔥</Text>
              <Text style={{ fontSize: 18, color: c.textTertiary }}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={{ flexDirection: 'row', backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, marginTop: 16, borderWidth: isDark ? 0 : 1, borderColor: c.border, overflow: 'hidden' }}>
          {[
            { icon: '⭐', value: String(totalFavorites), label: t('favorites.count'), color: '#facc15' },
            { icon: '👁', value: String(matchesViewed), label: t('matches.matchesViewed'), color: '#60a5fa' },
            { icon: '📖', value: String(newsRead), label: t('news.newsRead'), color: '#a78bfa' },
          ].map((stat, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <View style={{ width: 1, backgroundColor: c.border, marginVertical: 12 }} />}
              <View style={{ flex: 1, alignItems: 'center', paddingVertical: 16 }}>
                <Text style={{ fontSize: 18, marginBottom: 4 }}>{stat.icon}</Text>
                <Text style={{ fontSize: 20, fontWeight: '900', color: stat.color }}>{stat.value}</Text>
                <Text style={{ fontSize: 10, color: c.textTertiary, marginTop: 2, textAlign: 'center' }}>{stat.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* Guest Banner */}
        {!isAuthenticated && (
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 16, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#1d4ed8' }} activeOpacity={0.9} onPress={resetOnboarding}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20 }}>👤</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{t('profile.guestMode')}</Text>
              <Text style={{ fontSize: 12, color: '#bfdbfe', marginTop: 2 }}>{t('profile.guestModeSub')}</Text>
            </View>
            <View style={{ backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1d4ed8' }}>{t('profile.register')}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Ajustes */}
        <SectionHeader label={t('profile.settings')} c={c} />
        <View style={{ backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, overflow: 'hidden', borderWidth: isDark ? 0 : 1, borderColor: c.border }}>
          <MenuRow c={c} emoji="🔔" label={t('profile.notifications')} iconBg="rgba(249,115,22,0.15)" />
          <MenuRow c={c} emoji={isDark ? '🌙' : '☀️'} label={t('profile.appearance')} sublabel={isDark ? t('profile.darkMode') : t('profile.lightMode')} iconBg={isDark ? 'rgba(99,102,241,0.15)' : 'rgba(234,179,8,0.15)'} rightElement={<CustomToggle value={isDark} onToggle={toggleDark} activeColor={isDark ? '#6366f1' : '#eab308'} icon={isDark ? '🌙' : '☀️'} />} />
          <MenuRow c={c} emoji="🕐" label={t('profile.timeFormat')} sublabel={timeFormat === '24h' ? '14:30' : '2:30 PM'} iconBg="rgba(6,182,212,0.15)" rightElement={
            <TouchableOpacity style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(6,182,212,0.15)', borderWidth: 1, borderColor: 'rgba(6,182,212,0.2)' }} onPress={() => { haptics.selection(); setTimeFormat(f => f === '24h' ? '12h' : '24h'); }} activeOpacity={0.7}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#06b6d4' }}>{timeFormat}</Text>
            </TouchableOpacity>
          } />
          <MenuRow c={c} emoji="📱" label={t('profile.appIcon')} sublabel={t('profile.appIconSub')} iconBg="rgba(168,85,247,0.15)" onPress={() => navigation.navigate('HazteTitular', { source: 'icon' })} />
          <MenuRow c={c} emoji="🎁" label={t('profile.redeemCode')} iconBg="rgba(236,72,153,0.15)" onPress={() => setCodeModalVisible(true)} />
          <MenuRow c={c} emoji="👥" label={t('profile.inviteFriends')} sublabel={t('profile.shareApp')} iconBg="rgba(99,102,241,0.15)" onPress={handleShare} />
          <MenuRow c={c} emoji="📊" label={t('profile.odds')} sublabel={momiosEnabled ? t('profile.oddsVisible') : t('profile.oddsHidden')} iconBg="rgba(16,185,129,0.15)" rightElement={<CustomToggle value={momiosEnabled} onToggle={() => {
            if (momiosEnabled) {
              // Trying to turn OFF → requires premium
              navigation.navigate('HazteTitular', { source: 'momios' });
            } else {
              setMomiosEnabled(true);
            }
          }} activeColor="#10b981" icon={momiosEnabled ? '📊' : '🔒'} />} />
          <MenuRow c={c} emoji="🗑️" label={t('profile.clearCache')} sublabel={t('profile.freeSpace')} iconBg="rgba(239,68,68,0.1)" isLast onPress={handleClearCache} />
        </View>

        <ModoEstadioCard c={c} isDark={isDark} />

        <PromoBanner onPress={() => navigation.navigate('HazteTitular', { source: 'promo' })} />

        {/* Información */}
        <SectionHeader label={t('profile.information')} c={c} />
        <View style={{ backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, overflow: 'hidden', borderWidth: isDark ? 0 : 1, borderColor: c.border }}>
          <MenuRow c={c} emoji="ℹ️" label={t('profile.aboutApp')} sublabel={t('profile.aboutAppSub')} iconBg="rgba(59,130,246,0.15)" onPress={() => setAboutModalVisible(true)} />
          <MenuRow c={c} emoji="⭐" label={t('profile.rateApp')} sublabel={t('profile.rateSub')} iconBg="rgba(234,179,8,0.15)" onPress={handleRateApp} />
          <MenuRow c={c} emoji="❓" label={t('profile.helpCenter')} iconBg="rgba(14,165,233,0.15)" />
          <MenuRow c={c} emoji="✉️" label={t('profile.contactUs')} iconBg="rgba(20,184,166,0.15)" onPress={handleContact} />
          <MenuRow c={c} emoji="🛡️" label={t('profile.privacy')} iconBg="rgba(34,197,94,0.15)" onPress={() => setPrivacyModalVisible(true)} />
          <MenuRow c={c} emoji="📄" label={t('profile.terms')} iconBg="rgba(107,114,128,0.15)" onPress={() => setTermsModalVisible(true)} />
          <MenuRow c={c} emoji="🌐" label={t('profile.language')} sublabel={`${currentLang?.flag ?? ''} ${currentLang?.name ?? ''}`} iconBg="rgba(59,130,246,0.15)" accent isLast onPress={() => setLangModalVisible(true)} />
        </View>

        {/* Cerrar sesión */}
        <View style={{ backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, marginTop: 16, overflow: 'hidden', borderWidth: isDark ? 0 : 1, borderColor: c.border }}>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 }} activeOpacity={0.7} onPress={() => isAuthenticated ? setLogoutModalVisible(true) : (logout(), resetOnboarding())}>
            <IconCircle emoji="→" bg="rgba(239,68,68,0.1)" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#ef4444' }}>{isAuthenticated ? t('profile.logout') : t('profile.exit')}</Text>
              {isAuthenticated && displayEmail ? <Text style={{ fontSize: 11, color: c.textTertiary, marginTop: 1 }}>{displayEmail}</Text> : null}
            </View>
            <Text style={{ fontSize: 22, color: 'rgba(239,68,68,0.5)' }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={{ alignItems: 'center', marginTop: 24, gap: 2 }}>
          <Text style={{ fontSize: 12, color: c.textTertiary, fontWeight: '500' }}>⚽ Analistas</Text>
          <Text style={{ fontSize: 10, color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }}>{t('profile.version', { version: '1.0.0', year: '2026' })}</Text>
          <Text style={{ fontSize: 10, color: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)', marginTop: 2 }}>{t('profile.madeIn')}</Text>
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
      )}

      {/* ── MODALS ── */}

      {/* Streak */}
      <StreakModal
        visible={streakModalVisible}
        onClose={() => setStreakModalVisible(false)}
        streakDays={streakDays}
        streakNotifyEnabled={streakNotifyEnabled}
        onToggleNotify={setStreakNotify}
        c={c}
        isDark={isDark}
      />

      {/* Edit Profile */}
      <EditProfileModal visible={editProfileVisible} onClose={() => setEditProfileVisible(false)} />

      {/* Logout */}
      <Modal visible={logoutModalVisible} transparent animationType="fade" onRequestClose={() => setLogoutModalVisible(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 16 }} activeOpacity={1} onPress={() => setLogoutModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={{ backgroundColor: c.card, borderRadius: 24, paddingTop: 24, paddingBottom: 20, paddingHorizontal: 20, width: '100%', maxWidth: 340, alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(239,68,68,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 24 }}>🚪</Text>
            </View>
            <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary, textAlign: 'center' }}>{t('profile.logoutTitle')}</Text>
            <Text style={{ fontSize: 12, color: c.textTertiary, textAlign: 'center', marginTop: 8, lineHeight: 18, paddingHorizontal: 8 }}>{t('profile.logoutBody', { name: displayName })}</Text>
            <TouchableOpacity style={{ width: '100%', backgroundColor: '#ef4444', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 16 }} onPress={handleLogout} activeOpacity={0.8}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{t('profile.logoutConfirm')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ width: '100%', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderRadius: 16, paddingVertical: 12, alignItems: 'center', marginTop: 8 }} onPress={() => setLogoutModalVisible(false)} activeOpacity={0.8}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: c.textTertiary }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Canjea un código */}
      <CenterModal visible={codeModalVisible} onClose={() => { setCodeModalVisible(false); setRedeemCode(''); }} c={c}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary, marginBottom: 6 }}>{t('profile.codeTitle')}</Text>
        <Text style={{ fontSize: 12, color: c.textTertiary, marginBottom: 20, lineHeight: 18 }}>{t('profile.codeSubtitle')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surface, borderRadius: 14, paddingHorizontal: 14, height: 48, borderWidth: 1, borderColor: c.border }}>
          <Text style={{ fontSize: 16 }}>🎁</Text>
          <TextInput style={{ flex: 1, fontSize: 14, fontWeight: '600', color: c.textPrimary, letterSpacing: 1 }} placeholder={t('profile.codePlaceholder')} placeholderTextColor={c.textTertiary} value={redeemCode} onChangeText={setRedeemCode} autoCapitalize="characters" autoCorrect={false} />
        </View>
        <TouchableOpacity style={{ backgroundColor: redeemCode.trim() ? c.accent : c.surface, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 16 }} onPress={handleRedeemCode} activeOpacity={0.8} disabled={!redeemCode.trim()}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: redeemCode.trim() ? '#fff' : c.textTertiary }}>{t('profile.codeRedeem')}</Text>
        </TouchableOpacity>
      </CenterModal>

      {/* Sobre Analistas */}
      <BottomSheet visible={aboutModalVisible} onClose={() => setAboutModalVisible(false)} c={c}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary, marginBottom: 20 }}>{t('profile.aboutTitle')}</Text>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: isDark ? '#1a2332' : '#eef2ff', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 36 }}>⚽</Text>
            </View>
            <Text style={{ fontSize: 20, fontWeight: '800', color: c.textPrimary }}>Analistas</Text>
            <Text style={{ fontSize: 12, color: c.textTertiary, marginTop: 2 }}>Versión 1.0.0</Text>
          </View>
          <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 16, marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: c.textSecondary, lineHeight: 22 }}>Tu compañero definitivo para seguir el fútbol en tiempo real. Resultados en vivo, estadísticas detalladas, alineaciones, noticias y mucho más de las mejores ligas del mundo.</Text>
            <Text style={{ fontSize: 12, color: c.textTertiary, marginTop: 12 }}>❤️ Hecho con pasión por el fútbol</Text>
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', color: c.textTertiary, letterSpacing: 1.5, marginBottom: 10 }}>SÍGUENOS</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
            {[{ label: 'X', icon: '𝕏' }, { label: 'Instagram', icon: '📷' }, { label: 'TikTok', icon: '🎵' }, { label: 'YouTube', icon: '▶️' }].map(s => (
              <TouchableOpacity key={s.label} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border }} activeOpacity={0.7}>
                <Text style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</Text>
                <Text style={{ fontSize: 10, color: c.textSecondary, fontWeight: '600' }}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border }} onPress={() => Linking.openURL('https://analistas.app')} activeOpacity={0.7}>
            <Text style={{ fontSize: 16 }}>🌐</Text>
            <Text style={{ fontSize: 14, color: c.textPrimary, fontWeight: '500' }}>analistas.app</Text>
            <Text style={{ marginLeft: 'auto', fontSize: 12, color: c.textTertiary }}>↗</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border }} onPress={() => Linking.openURL('mailto:hola@analistas.app')} activeOpacity={0.7}>
            <Text style={{ fontSize: 16 }}>✉️</Text>
            <Text style={{ fontSize: 14, color: c.textPrimary, fontWeight: '500' }}>hola@analistas.app</Text>
            <Text style={{ marginLeft: 'auto', fontSize: 12, color: c.textTertiary }}>↗</Text>
          </TouchableOpacity>
        </ScrollView>
      </BottomSheet>

      {/* Idioma */}
      <CenterModal visible={langModalVisible} onClose={() => setLangModalVisible(false)} c={c}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary, marginBottom: 16 }}>{t('profile.selectLanguage')}</Text>
        {LANGUAGES.map((lang, idx) => {
          const isActive = selectedLang === lang.id;
          return (
            <TouchableOpacity key={lang.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: c.border }} onPress={() => {
                haptics.selection();
                setSelectedLang(lang.id);
                i18n.changeLanguage(lang.id);
                AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang.id).catch(() => {});
                setLangModalVisible(false);
              }} activeOpacity={0.7}>
              <Text style={{ fontSize: 22 }}>{lang.flag}</Text>
              <Text style={[{ fontSize: 15, color: c.textPrimary, fontWeight: '500' }, isActive && { color: c.accent, fontWeight: '700' }]}>{lang.name}</Text>
              {isActive && <Text style={{ marginLeft: 'auto', fontSize: 16, color: c.accent }}>✓</Text>}
            </TouchableOpacity>
          );
        })}
      </CenterModal>

      {/* Política de privacidad */}
      <BottomSheet visible={privacyModalVisible} onClose={() => setPrivacyModalVisible(false)} c={c}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary, marginBottom: 16 }}>{t('profile.privacyTitle')}</Text>
          <Text style={{ fontSize: 11, color: c.textTertiary, marginBottom: 16 }}>Última actualización: 1 de enero de 2026</Text>
          {[
            { title: '1. Información que recopilamos', body: 'Recopilamos información que nos proporcionas directamente, como tu nombre, dirección de correo electrónico y preferencias de equipos cuando creas una cuenta. También recopilamos datos de uso de forma automática, como los partidos que consultas y las noticias que lees.' },
            { title: '2. Cómo usamos tu información', body: 'Utilizamos tu información para: personalizar tu experiencia con contenido relevante de fútbol, enviar notificaciones de partidos y alertas que configures, mejorar nuestros servicios y funcionalidades, y comunicarnos contigo sobre tu cuenta.' },
            { title: '3. Compartir información', body: 'No vendemos ni compartimos tu información personal con terceros con fines de marketing. Podemos compartir datos agregados y anónimos con socios analíticos para mejorar el servicio.' },
            { title: '4. Seguridad', body: 'Implementamos medidas de seguridad estándar de la industria para proteger tu información personal contra acceso no autorizado, alteración o destrucción.' },
            { title: '5. Tus derechos', body: 'Puedes acceder, corregir o eliminar tu información personal en cualquier momento desde la configuración de tu cuenta. También puedes solicitar la eliminación completa de tus datos contactándonos a comercial@somosanalistas.com.' },
            { title: '6. Contacto', body: 'Para cualquier pregunta sobre esta política, contáctanos en comercial@somosanalistas.com.' },
          ].map((section, i) => (
            <View key={i} style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary, marginBottom: 6 }}>{section.title}</Text>
              <Text style={{ fontSize: 13, color: c.textSecondary, lineHeight: 20 }}>{section.body}</Text>
            </View>
          ))}
        </ScrollView>
      </BottomSheet>

      {/* Términos y condiciones */}
      <BottomSheet visible={termsModalVisible} onClose={() => setTermsModalVisible(false)} c={c}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary, marginBottom: 16 }}>{t('profile.termsTitle')}</Text>
          <Text style={{ fontSize: 11, color: c.textTertiary, marginBottom: 16 }}>Última actualización: 1 de enero de 2026</Text>
          {[
            { title: '1. Aceptación', body: 'Al utilizar Analistas, aceptas estos términos y condiciones en su totalidad. Si no estás de acuerdo, no utilices la aplicación.' },
            { title: '2. Uso del servicio', body: 'Analistas es una plataforma informativa de fútbol. El contenido es con fines informativos y de entretenimiento. No nos hacemos responsables de decisiones tomadas con base en la información proporcionada.' },
            { title: '3. Cuentas de usuario', body: 'Eres responsable de mantener la confidencialidad de tu cuenta. Debes tener al menos 13 años de edad para usar la aplicación. El contenido de apuestas (momios) solo está disponible para mayores de 18 años.' },
            { title: '4. Contenido de apuestas', body: 'La información sobre momios y cuotas de apuestas se proporciona con fines informativos. Analistas no es una casa de apuestas ni promueve las apuestas. El usuario es responsable de cumplir con las leyes locales sobre apuestas.' },
            { title: '5. Suscripciones', body: 'La suscripción "Titular" (premium) se cobra de forma recurrente. Puedes cancelar en cualquier momento desde la configuración de tu tienda de aplicaciones. Los reembolsos se procesan según las políticas de Apple o Google.' },
            { title: '6. Propiedad intelectual', body: 'Todo el contenido, diseño y funcionalidad de Analistas están protegidos por derechos de autor. Los logos de equipos y ligas pertenecen a sus respectivos dueños.' },
            { title: '7. Modificaciones', body: 'Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios serán notificados dentro de la aplicación.' },
            { title: '8. Contacto', body: 'Para cualquier pregunta sobre estos términos, contáctanos en comercial@somosanalistas.com.' },
          ].map((section, i) => (
            <View key={i} style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary, marginBottom: 6 }}>{section.title}</Text>
              <Text style={{ fontSize: 13, color: c.textSecondary, lineHeight: 20 }}>{section.body}</Text>
            </View>
          ))}
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
};
