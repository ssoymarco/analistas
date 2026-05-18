import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable, Modal, TextInput, Switch,
  NativeSyntheticEvent, NativeScrollEvent, Share, Linking, Platform, Alert,
  StyleSheet,
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
import { useGoogleAuth } from '../services/authGoogle';
import { upgradeWithApple, isAppleAuthAvailable } from '../services/authApple';
import { useOnboarding } from '../contexts/OnboardingContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { useUserStats } from '../contexts/UserStatsContext';
import { SkeletonPerfil } from '../components/Skeleton';
import { EditProfileModal } from '../components/EditProfileModal';
import { ScreenHeader } from '../components/ScreenHeader';
import { SectionHeader } from '../components/SectionHeader';
import { PrivacyPolicyBody } from '../components/PrivacyPolicyBody';
import { TermsOfServiceBody } from '../components/TermsOfServiceBody';
import { scheduleLocalNotification } from '../services/notifications';
import { useNotificationPrefs } from '../contexts/NotificationPrefsContext';
import { useTranslation } from 'react-i18next';
import i18n, { LANGUAGE_STORAGE_KEY } from '../i18n';
import { useTimeFormat } from '../contexts/TimeFormatContext';

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

function AvatarView({ initials, size = 68, color = '#6366f1' }: { initials: string; size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.3, fontWeight: '900', color: '#ffffff' }}>{initials}</Text>
    </View>
  );
}

/**
 * Native iOS-style switch. Matches NotificationSettingsScreen so every
 * toggle in the app looks the same.
 *
 * Extra props (`activeColor`, `icon`) are accepted for backwards-compatibility
 * with existing call sites but intentionally ignored — visual consistency is
 * the goal.
 */
function CustomToggle({ value, onToggle }: {
  value: boolean;
  onToggle: () => void;
  /** @deprecated kept only so legacy call sites still compile — visual is uniform now. */
  activeColor?: string;
  /** @deprecated kept only so legacy call sites still compile — no inline icon anymore. */
  icon?: string;
}) {
  const c = useThemeColors();
  return (
    <Switch
      value={value}
      onValueChange={() => { haptics.selection(); onToggle(); }}
      trackColor={{ false: c.border, true: c.accent }}
      thumbColor="#fff"
      ios_backgroundColor={c.border}
    />
  );
}

// ── Bottom Sheet Modal ───────────────────────────────────────────────────────
// Previous implementation wrapped the inner panel in a TouchableOpacity to
// prevent backdrop-taps from closing the modal. That worked for the tap
// case but stole the gesture responder from any ScrollView inside, so long
// content (Privacy / Terms) couldn't be scrolled on iOS.
//
// Fixed by splitting backdrop and panel into separate siblings:
//   - Pressable backdrop fills the screen behind the panel and handles
//     the tap-to-close interaction.
//   - Panel is a plain View on top of it. Taps inside the panel never
//     reach the backdrop (no overlap in the responder tree), and the
//     ScrollView inside is free to claim vertical pan as usual.
function BottomSheet({ visible, onClose, c, children }: {
  visible: boolean; onClose: () => void; c: ColorPalette; children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Backdrop — sits behind the panel, fills the rest of the screen. */}
        <Pressable
          onPress={onClose}
          style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
        />
        {/* Panel — plain View so the ScrollView inside owns its gestures. */}
        <View style={{
          backgroundColor: c.card,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
          maxHeight: '85%',
        }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 12 }} />
          <TouchableOpacity
            style={{ position: 'absolute', top: 16, right: 16, width: 28, height: 28, borderRadius: 14, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
            onPress={onClose}
            hitSlop={8}
          >
            <Text style={{ fontSize: 14, color: c.textSecondary, fontWeight: '600' }}>✕</Text>
          </TouchableOpacity>
          {children}
        </View>
      </View>
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

// ── Legal documents ─────────────────────────────────────────────────────────
// In-app text is the canonical version (works offline, available to app store
// reviewers without a network round-trip). The website URLs below are the
// "full version" link offered at the bottom of each modal — the WordPress
// pages should mirror this text and act as a public-facing reference.
//
// Privacy already exists at `/politica-privacidad/`. Terms still needs to be
// created on WordPress at the matching `/terminos-y-condiciones/` slug.
const LEGAL_PRIVACY_URL = 'https://somosanalistas.com/politica-privacidad/';
const LEGAL_TERMS_URL   = 'https://somosanalistas.com/terminos-y-condiciones/';

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
  const { user, isAuthenticated, login, logout, deleteAccount } = useAuth();
  const { upgradeWithGoogle, googleAuthReady } = useGoogleAuth();
  const [upgrading, setUpgrading] = useState(false);
  const { resetOnboarding } = useOnboarding();
  const { followedTeamIds, followedPlayerIds, followedLeagueIds } = useFavorites();
  const { matchesViewed, newsRead, streakDays } = useUserStats();
  const totalFavorites = followedTeamIds.length + followedPlayerIds.length + followedLeagueIds.length;

  // Pick first favorited team's color, or fall back to indigo
  const avatarColor = React.useMemo(() => {
    const teamColors: Record<string, string> = {
      'america': '#FFCC00', 'chivas': '#CC0000', 'cruz_azul': '#0033A0',
      'pumas': '#003DA5', 'tigres': '#F5A800', 'rayados': '#003DA5',
      'real_madrid': '#FEBE10', 'barcelona': '#A50044', 'manchester_city': '#6CABDD',
      'liverpool': '#C8102E', 'arsenal': '#EF0107', 'chelsea': '#034694',
    };
    const firstTeam = followedTeamIds[0] ?? '';
    return teamColors[firstTeam] ?? '#6366f1';
  }, [followedTeamIds]);

  const [statsPeriod, setStatsPeriod] = useState<'7d' | '30d'>('7d');
  const {
    matchesThisWeek,
    matchesThisMonth,
    newsThisWeek,
    newsThisMonth,
  } = useUserStats() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const displayMatches = statsPeriod === '7d' ? (matchesThisWeek ?? 0) : (matchesThisMonth ?? 0);
  const displayNews    = statsPeriod === '7d' ? (newsThisWeek   ?? 0) : (newsThisMonth   ?? 0);

  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 400); return () => clearTimeout(t); }, []);
  const [showNameInHeader, setShowNameInHeader] = useState(false);
  const { timeFormat, setTimeFormat } = useTimeFormat();
  const [momiosEnabled, setMomiosEnabled] = useState(true);
  const [selectedLang, setSelectedLang] = useState(i18n.language || 'es');
  const [levelSheetVisible, setLevelSheetVisible] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [aboutModalVisible, setAboutModalVisible] = useState(false);
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  // ── Delete-account 2-step modal ────────────────────────────────────────────
  // Step 1: warning Alert. Step 2: typing modal (CenterModal) that requires
  // the user to type the localised confirmation word (ELIMINAR / DELETE / …)
  // before the destructive button enables. See `handleDeleteAccount` below.
  const [deleteStep, setDeleteStep] = useState<'closed' | 'typing'>('closed');
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleteInFlight, setDeleteInFlight] = useState(false);

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

  // ── Delete account ────────────────────────────────────────────────────────
  // Step 1 — show the destructive Alert. If the user accepts, advance to the
  // typing-confirmation modal (step 2).
  const handleStartDelete = useCallback(() => {
    haptics.heavy();
    Alert.alert(
      t('profile.deleteAccountTitle'),
      t('profile.deleteAccountBody', { streak: streakDays }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.continue'),
          style: 'destructive',
          onPress: () => { setDeleteConfirmInput(''); setDeleteStep('typing'); },
        },
      ],
    );
  }, [t, streakDays]);

  // Step 2 — fire the actual deletion. The button is only enabled when the
  // user has typed the localised confirmation word verbatim.
  const handleConfirmDelete = useCallback(async () => {
    if (deleteInFlight) return;
    setDeleteInFlight(true);
    haptics.heavy();
    const result = await deleteAccount();
    setDeleteInFlight(false);
    setDeleteStep('closed');
    setDeleteConfirmInput('');

    if (result.ok) {
      // The auth-state-change listener will navigate the user out
      // automatically when `user` becomes null.
      resetOnboarding();
      return;
    }

    if (result.reason === 'requires-recent-login') {
      // Firebase requires a fresh credential — we ask the user to sign in
      // again and then retry. We can't transparently re-auth them here
      // because the credential lives on the OAuth provider (Apple/Google),
      // not in our app. Signing out and showing the onboarding sign-in
      // flow is the standard workaround.
      Alert.alert(
        t('profile.deleteAccountReauthTitle'),
        t('profile.deleteAccountReauthBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('profile.deleteAccountReauthAction'),
            onPress: async () => { await logout(); resetOnboarding(); },
          },
        ],
      );
      return;
    }

    Alert.alert(t('common.error'), t('profile.deleteAccountError'));
  }, [deleteAccount, deleteInFlight, logout, resetOnboarding, t]);

  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    isAppleAuthAvailable().then(setAppleAvailable).catch(() => {});
  }, []);

  const handleUpgradeWithGoogle = useCallback(async () => {
    if (!googleAuthReady || upgrading) return;
    setUpgrading(true);
    haptics.medium();
    try {
      await upgradeWithGoogle();
      Alert.alert('', t('profile.upgradeSuccess'));
    } catch (err: unknown) {
      const e = err as { message?: string };
      if (e.message !== 'cancelled') {
        Alert.alert(t('common.error'), t('profile.upgradeError'));
      }
    } finally {
      setUpgrading(false);
    }
  }, [googleAuthReady, upgrading, upgradeWithGoogle, t]);

  const handleUpgradeWithApple = useCallback(async () => {
    if (upgrading) return;
    setUpgrading(true);
    haptics.medium();
    try {
      await upgradeWithApple();
      Alert.alert('', t('profile.upgradeSuccess'));
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      // ERR_REQUEST_CANCELED = user dismissed sheet — silent
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert(t('common.error'), t('profile.upgradeError'));
      }
    } finally {
      setUpgrading(false);
    }
  }, [upgrading, t]);

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
      <ScreenHeader
        icon="👤"
        iconBg="rgba(168,85,247,0.15)"
        title={t('profile.title')}
        titleSuffix={
          showNameInHeader && isAuthenticated ? (
            <>
              <Text style={{ fontSize: 15, color: c.textTertiary }}> · </Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary, maxWidth: 140 }} numberOfLines={1}>{displayName}</Text>
            </>
          ) : undefined
        }
      />

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
              <AvatarView initials={initials} size={68} color={avatarColor} />
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
                  <TouchableOpacity
                    onPress={() => { haptics.light(); setLevelSheetVisible(true); }}
                    activeOpacity={0.75}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#f59e0b' }}>🛡️ {t('profile.levelSuplente')} </Text>
                    <Text style={{ fontSize: 9, color: 'rgba(245,158,11,0.6)' }}>›</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            {isAuthenticated && (
              <TouchableOpacity onPress={() => { haptics.light(); setEditProfileVisible(true); }} activeOpacity={0.7} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(0,224,150,0.1)' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#00E096' }}>{t('common.edit')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Member since — full-width, below avatar row */}
          {isAuthenticated && (
            <Text style={{ fontSize: 11.5, color: c.textTertiary, marginTop: 10, textAlign: 'center' }}>
              {t('profile.memberSince', {
                date: user?.createdAt
                  ? user.createdAt.toLocaleDateString(
                      ({ es: 'es-ES', en: 'en-US', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', tr: 'tr-TR' } as Record<string, string>)[i18n.language] ?? 'es-ES',
                      { month: 'long', year: 'numeric' },
                    )
                  : 'hoy',
              })}
            </Text>
          )}

          {!isAuthenticated && (
            <TouchableOpacity style={{ backgroundColor: c.accent, paddingHorizontal: 28, paddingVertical: 11, borderRadius: 20, alignSelf: 'center', marginTop: 12 }} onPress={resetOnboarding} activeOpacity={0.8}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{t('profile.signIn')}</Text>
            </TouchableOpacity>
          )}

          {/* Streak pill */}
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: streakDays > 0 ? 'rgba(255,122,0,0.08)' : c.surface, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 13, marginTop: 16, borderWidth: 1, borderColor: streakDays > 0 ? 'rgba(255,122,0,0.25)' : c.border }}
            activeOpacity={0.8}
            onPress={() => { handleDevTap?.(); navigation.navigate('Streak'); }}
          >
            <Text style={{ fontSize: 22 }}>🔥</Text>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
              {streakDays > 0 ? (
                <>
                  <Text style={{ fontSize: 17, fontWeight: '900', color: '#ff7a00' }}>{streakDays}</Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#ff7a00' }}>días</Text>
                  <Text style={{ fontSize: 14, color: 'rgba(255,122,0,0.35)', marginHorizontal: 2 }}>·</Text>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: c.textSecondary }}>{t('profile.streakActive')}</Text>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }}>{t('profile.streakStart')}</Text>
                  <Text style={{ fontSize: 14, color: 'rgba(255,122,0,0.35)', marginHorizontal: 2 }}>·</Text>
                  <Text style={{ fontSize: 13, color: c.textTertiary }}>{t('profile.streakStartSub')}</Text>
                </>
              )}
            </View>
            <Text style={{ fontSize: 18, color: streakDays > 0 ? 'rgba(255,122,0,0.5)' : c.textTertiary }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Card — horizontal strip */}
        <View style={{ marginHorizontal: 16, marginTop: 16 }}>
          {/* Header row with period selector */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: c.textTertiary, letterSpacing: 1.5, textTransform: 'uppercase' }}>
              {t('profile.yourStats')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {(['7d', '30d'] as const).map(p => (
                <TouchableOpacity
                  key={p}
                  onPress={() => { haptics.selection(); setStatsPeriod(p); }}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
                    backgroundColor: statsPeriod === p ? c.accent : c.surface,
                    borderWidth: 1,
                    borderColor: statsPeriod === p ? c.accent : c.border,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: statsPeriod === p ? '#000' : c.textTertiary }}>
                    {t(p === '7d' ? 'profile.period7d' : 'profile.period30d')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 2×2 stats grid */}
          <View style={{ backgroundColor: c.card, borderRadius: 14, overflow: 'hidden', borderWidth: isDark ? 0 : 1, borderColor: c.border }}>
            {/* Row 1 */}
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.border }}>
              <View style={{ flex: 1, alignItems: 'center', paddingVertical: 16, gap: 4 }}>
                <Text style={{ fontSize: 13 }}>⚽</Text>
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#60a5fa', lineHeight: 28 }}>{displayMatches}</Text>
                <Text style={{ fontSize: 11, color: c.textTertiary, textAlign: 'center' }}>{t('profile.statMatches')}</Text>
              </View>
              <View style={{ width: 1, backgroundColor: c.border, marginVertical: 12 }} />
              <View style={{ flex: 1, alignItems: 'center', paddingVertical: 16, gap: 4 }}>
                <Text style={{ fontSize: 13 }}>📰</Text>
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#a78bfa', lineHeight: 28 }}>{displayNews}</Text>
                <Text style={{ fontSize: 11, color: c.textTertiary, textAlign: 'center' }}>{t('profile.statNews')}</Text>
              </View>
            </View>
            {/* Row 2 */}
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, alignItems: 'center', paddingVertical: 16, gap: 4 }}>
                <Text style={{ fontSize: 13 }}>🔥</Text>
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#ff7a00', lineHeight: 28 }}>{streakDays}</Text>
                <Text style={{ fontSize: 11, color: c.textTertiary, textAlign: 'center' }}>{t('profile.statStreak')}</Text>
              </View>
              <View style={{ width: 1, backgroundColor: c.border, marginVertical: 12 }} />
              <View style={{ flex: 1, alignItems: 'center', paddingVertical: 16, gap: 4 }}>
                <Text style={{ fontSize: 13 }}>⭐</Text>
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#facc15', lineHeight: 28 }}>{totalFavorites}</Text>
                <Text style={{ fontSize: 11, color: c.textTertiary, textAlign: 'center' }}>{t('profile.statFavorites')}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Guest Banner */}
        {!isAuthenticated && (
          <View style={{ marginHorizontal: 16, marginTop: 16, borderRadius: 16, backgroundColor: '#1d4ed8', overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 4 }}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: '#fff', marginBottom: 4 }}>
                {t('profile.guestTitle')}
              </Text>
              <Text style={{ fontSize: 13, color: '#bfdbfe', marginBottom: 16, lineHeight: 18 }}>
                {t('profile.guestSub')}
              </Text>
              {[
                t('profile.guestBenefit1'),
                t('profile.guestBenefit2'),
                t('profile.guestBenefit3'),
              ].map((benefit, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>✓</Text>
                  </View>
                  <Text style={{ fontSize: 13, color: '#dbeafe', flex: 1 }}>{benefit}</Text>
                </View>
              ))}
            </View>
            {/* Connect with Apple (iOS only) */}
            {appleAvailable && (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 12, marginBottom: 8, borderRadius: 12, paddingVertical: 11, backgroundColor: '#000', opacity: upgrading ? 0.6 : 1 }}
                activeOpacity={0.85}
                onPress={handleUpgradeWithApple}
                disabled={upgrading}
              >
                <Text style={{ fontSize: 15, color: '#fff' }}>🍎</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>
                  {upgrading ? '...' : t('profile.connectWithApple')}
                </Text>
              </TouchableOpacity>
            )}
            {/* Connect with Google */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 12, marginBottom: 8, borderRadius: 12, paddingVertical: 11, backgroundColor: '#fff', opacity: upgrading ? 0.6 : 1 }}
              activeOpacity={0.85}
              onPress={handleUpgradeWithGoogle}
              disabled={upgrading || !googleAuthReady}
            >
              <Text style={{ fontSize: 15, fontWeight: '700' }}>G</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#1d4ed8' }}>
                {upgrading ? '...' : t('profile.connectWithGoogle')}
              </Text>
            </TouchableOpacity>
            {/* Create account via onboarding */}
            <TouchableOpacity
              style={{ alignItems: 'center', paddingBottom: 14 }}
              activeOpacity={0.7}
              onPress={resetOnboarding}
            >
              <Text style={{ fontSize: 12, color: '#bfdbfe', fontWeight: '600' }}>{t('profile.register')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Ajustes */}
        <SectionHeader label={t('profile.settings')} />
        <View style={{ backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, overflow: 'hidden', borderWidth: isDark ? 0 : 1, borderColor: c.border }}>
          <MenuRow c={c} emoji="🔔" label={t('profile.notifications')} iconBg="rgba(249,115,22,0.15)" onPress={() => navigation.navigate('NotificationSettings')} />
          <MenuRow c={c} emoji={isDark ? '🌙' : '☀️'} label={t('profile.appearance')} sublabel={isDark ? t('profile.darkMode') : t('profile.lightMode')} iconBg={isDark ? 'rgba(99,102,241,0.15)' : 'rgba(234,179,8,0.15)'} rightElement={<CustomToggle value={isDark} onToggle={toggleDark} activeColor={isDark ? '#6366f1' : '#eab308'} icon={isDark ? '🌙' : '☀️'} />} />
          <MenuRow c={c} emoji="🕐" label={t('profile.timeFormat')} sublabel={timeFormat === '24h' ? '14:30' : '2:30 PM'} iconBg="rgba(6,182,212,0.15)" rightElement={
            <TouchableOpacity style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(6,182,212,0.15)', borderWidth: 1, borderColor: 'rgba(6,182,212,0.2)' }} onPress={() => { haptics.selection(); setTimeFormat(timeFormat === '24h' ? '12h' : '24h'); }} activeOpacity={0.7}>
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
        <SectionHeader label={t('profile.information')} />
        <View style={{ backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, overflow: 'hidden', borderWidth: isDark ? 0 : 1, borderColor: c.border }}>
          <MenuRow c={c} emoji="ℹ️" label={t('profile.aboutApp')} sublabel={t('profile.aboutAppSub')} iconBg="rgba(59,130,246,0.15)" onPress={() => setAboutModalVisible(true)} />
          <MenuRow c={c} emoji="⭐" label={t('profile.rateApp')} sublabel={t('profile.rateSub')} iconBg="rgba(234,179,8,0.15)" onPress={handleRateApp} />
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

        {/* Eliminar cuenta — visible for every authenticated user (including
            guests with anonymous Firebase sessions). Apple App Store review
            wants this entry point reachable for ANY account, so we don't
            hide it conditionally — even for a guest, deletion wipes their
            anonymous UID + local data, which is the user-meaningful action. */}
        {isAuthenticated && (
          <View style={{ backgroundColor: c.card, borderRadius: 16, marginHorizontal: 16, marginTop: 10, overflow: 'hidden', borderWidth: isDark ? 0 : 1, borderColor: c.border }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 }}
              activeOpacity={0.7}
              onPress={handleStartDelete}
              accessibilityRole="button"
              accessibilityLabel={t('profile.deleteAccount')}
            >
              <IconCircle emoji="🗑" bg="rgba(220,38,38,0.15)" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#dc2626' }}>{t('profile.deleteAccount')}</Text>
                <Text style={{ fontSize: 11, color: c.textTertiary, marginTop: 1 }}>{t('profile.deleteAccountSub')}</Text>
              </View>
              <Text style={{ fontSize: 22, color: 'rgba(220,38,38,0.5)' }}>›</Text>
            </TouchableOpacity>
          </View>
        )}


        {/* Footer */}
        <View style={{ alignItems: 'center', marginTop: 16, gap: 2 }}>
          <Text style={{ fontSize: 12, color: c.textTertiary, fontWeight: '500' }}>⚽ Analistas</Text>
          <Text style={{ fontSize: 10, color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }}>{t('profile.version', { version: '1.0.0', year: '2026' })}</Text>
          <Text style={{ fontSize: 10, color: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)', marginTop: 2 }}>{t('profile.madeIn')}</Text>
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
      )}

      {/* ── MODALS ── */}


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

      {/* Delete account — step 2 (typing confirmation). Step 1 is a native
          Alert.alert fired from `handleStartDelete`. We show this modal only
          after the user has acknowledged the warning. The destructive button
          stays disabled until they type the localised confirmation word
          (ELIMINAR / DELETE / LÖSCHEN / …) verbatim, case-insensitive. */}
      <Modal visible={deleteStep === 'typing'} transparent animationType="fade" onRequestClose={() => !deleteInFlight && setDeleteStep('closed')}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <Pressable
            onPress={() => !deleteInFlight && setDeleteStep('closed')}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={{ backgroundColor: c.card, borderRadius: 24, paddingTop: 24, paddingBottom: 20, paddingHorizontal: 20, width: '100%', maxWidth: 360, alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(220,38,38,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 28 }}>🗑</Text>
            </View>
            <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary, textAlign: 'center' }}>
              {t('profile.deleteAccountConfirmTitle')}
            </Text>
            <Text style={{ fontSize: 13, color: c.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 19, paddingHorizontal: 4 }}>
              {t('profile.deleteAccountConfirmHint', { word: t('profile.deleteAccountConfirmWord') })}
            </Text>
            <TextInput
              value={deleteConfirmInput}
              onChangeText={setDeleteConfirmInput}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={t('profile.deleteAccountConfirmWord')}
              placeholderTextColor={c.textTertiary}
              editable={!deleteInFlight}
              style={{
                width: '100%', marginTop: 16,
                backgroundColor: c.surface,
                borderWidth: 1, borderColor: c.border,
                borderRadius: 14, paddingHorizontal: 14, height: 48,
                fontSize: 15, fontWeight: '600', color: c.textPrimary,
                textAlign: 'center', letterSpacing: 1,
              }}
            />
            {(() => {
              const expectedWord = t('profile.deleteAccountConfirmWord').toUpperCase();
              const canDelete = deleteConfirmInput.trim().toUpperCase() === expectedWord && !deleteInFlight;
              return (
                <TouchableOpacity
                  style={{
                    width: '100%', marginTop: 14, paddingVertical: 14, borderRadius: 16,
                    alignItems: 'center',
                    backgroundColor: canDelete ? '#dc2626' : (isDark ? 'rgba(220,38,38,0.25)' : 'rgba(220,38,38,0.18)'),
                    opacity: canDelete ? 1 : 0.6,
                  }}
                  onPress={handleConfirmDelete}
                  disabled={!canDelete}
                  activeOpacity={0.85}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                    {deleteInFlight ? t('profile.deleteAccountInProgress') : t('profile.deleteAccountButton')}
                  </Text>
                </TouchableOpacity>
              );
            })()}
            <TouchableOpacity
              style={{ width: '100%', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderRadius: 16, paddingVertical: 12, alignItems: 'center', marginTop: 8 }}
              onPress={() => !deleteInFlight && setDeleteStep('closed')}
              disabled={deleteInFlight}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 14, fontWeight: '500', color: c.textTertiary }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
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

      {/* Política de privacidad — see PrivacyPolicyBody.tsx for the actual
          legal text. This block is only the modal chrome (title + date +
          Spanish-notice for non-ES locales + the canonical-version link). */}
      <BottomSheet visible={privacyModalVisible} onClose={() => setPrivacyModalVisible(false)} c={c}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary, marginBottom: 8 }}>{t('profile.privacyTitle')}</Text>
          <Text style={{ fontSize: 11, color: c.textTertiary, marginBottom: 16 }}>{t('profile.legalLastUpdated')}</Text>
          {i18n.language !== 'es' && (
            <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: c.border }}>
              <Text style={{ fontSize: 12, color: c.textSecondary, lineHeight: 17 }}>🇲🇽 {t('profile.legalSpanishNotice')}</Text>
            </View>
          )}
          <PrivacyPolicyBody />
          <TouchableOpacity
            onPress={() => Linking.openURL(LEGAL_PRIVACY_URL)}
            activeOpacity={0.7}
            style={{ marginTop: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: c.accent }}>{t('profile.legalViewFullOnline')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </BottomSheet>

      {/* Level Comparison Sheet */}
      <BottomSheet visible={levelSheetVisible} onClose={() => setLevelSheetVisible(false)} c={c}>
        <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '900', color: c.textPrimary, textAlign: 'center', marginBottom: 6 }}>
            {t('profile.levelTitle')}
          </Text>
          <Text style={{ fontSize: 13, color: c.textSecondary, textAlign: 'center', marginBottom: 24 }}>
            {t('profile.levelSubtitle')}
          </Text>

          {/* Comparison table */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
            {/* Suplente */}
            <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 16, padding: 14, borderWidth: 2, borderColor: '#f59e0b' }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#f59e0b', textAlign: 'center', marginBottom: 12, letterSpacing: 0.5 }}>🛡️ SUPLENTE</Text>
              {(['profile.feat1', 'profile.feat2', 'profile.feat3', 'profile.feat4'] as const).map(key => (
                <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, color: '#00E096' }}>✓</Text>
                  <Text style={{ fontSize: 12, color: c.textSecondary, flex: 1 }}>{t(key)}</Text>
                </View>
              ))}
            </View>
            {/* Titular */}
            <View style={{ flex: 1, backgroundColor: 'rgba(0,224,150,0.05)', borderRadius: 16, padding: 14, borderWidth: 2, borderColor: '#00E096' }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#00E096', textAlign: 'center', marginBottom: 12, letterSpacing: 0.5 }}>👑 TITULAR</Text>
              {(['profile.feat1', 'profile.feat2', 'profile.feat3', 'profile.feat4', 'profile.featPro1', 'profile.featPro2', 'profile.featPro3'] as const).map(key => (
                <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, color: '#00E096' }}>✓</Text>
                  <Text style={{ fontSize: 12, color: key.includes('Pro') ? '#00E096' : c.textSecondary, flex: 1, fontWeight: key.includes('Pro') ? '600' : '400' }}>{t(key)}</Text>
                </View>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={{ backgroundColor: '#00E096', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginBottom: 8 }}
            onPress={() => { setLevelSheetVisible(false); navigation.navigate('HazteTitular', { source: 'level_badge' }); }}
            activeOpacity={0.85}
          >
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#000' }}>{t('profile.goTitular')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setLevelSheetVisible(false)} style={{ alignItems: 'center', paddingVertical: 10 }} activeOpacity={0.7}>
            <Text style={{ fontSize: 14, color: c.textSecondary }}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* Términos y condiciones — see TermsOfServiceBody.tsx for the actual
          legal text. This block is only the modal chrome (title + date +
          Spanish-notice for non-ES locales + the canonical-version link). */}
      <BottomSheet visible={termsModalVisible} onClose={() => setTermsModalVisible(false)} c={c}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary, marginBottom: 8 }}>{t('profile.termsTitle')}</Text>
          <Text style={{ fontSize: 11, color: c.textTertiary, marginBottom: 16 }}>{t('profile.legalLastUpdated')}</Text>
          {i18n.language !== 'es' && (
            <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: c.border }}>
              <Text style={{ fontSize: 12, color: c.textSecondary, lineHeight: 17 }}>🇲🇽 {t('profile.legalSpanishNotice')}</Text>
            </View>
          )}
          <TermsOfServiceBody />
          <TouchableOpacity
            onPress={() => Linking.openURL(LEGAL_TERMS_URL)}
            activeOpacity={0.7}
            style={{ marginTop: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: c.accent }}>{t('profile.legalViewFullOnline')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
};
