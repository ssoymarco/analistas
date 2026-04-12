import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, Animated, Easing } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useOnboarding } from '../contexts/OnboardingContext';
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import { PartidosScreen } from '../screens/PartidosScreen';
import { FavoritosScreen } from '../screens/FavoritosScreen';
import { NoticiasScreen } from '../screens/NoticiasScreen';
import { PerfilScreen } from '../screens/PerfilScreen';
import { MatchDetailScreen } from '../screens/MatchDetailScreen';
import { TeamDetailScreen } from '../screens/TeamDetailScreen';
import { PlayerDetailScreen } from '../screens/PlayerDetailScreen';
import { LeagueDetailScreen } from '../screens/LeagueDetailScreen';
import { GlobalSearchScreen } from '../screens/GlobalSearchScreen';
import type { ColorPalette } from '../theme/colors';
import type { Match } from '../data/types';

// ── Param lists ───────────────────────────────────────────────────────────────

/**
 * Stack nested inside the Partidos tab.
 * MatchDetail and TeamDetail live here so the bottom tab bar stays visible.
 */
export type PartidosStackParamList = {
  PartidosHome: undefined;
  MatchDetail: { match: Match };
  TeamDetail: { teamId: number; teamName: string; teamLogo?: string; seasonId?: number };
  PlayerDetail: {
    playerId: number;
    playerName: string;
    playerImage?: string;
    teamName?: string;
    teamLogo?: string;
    jerseyNumber?: number;
  };
  LeagueDetail: {
    leagueId: number;
    leagueName: string;
    leagueLogo?: string;
    seasonId?: number;
  };
  GlobalSearch: undefined;
};

export type RootTabParamList = {
  Partidos: undefined;
  Favoritos: undefined;
  Noticias: undefined;
  Perfil: undefined;
};

// Keep for backward compat (MatchDetailScreen imports this)
export type RootStackParamList = PartidosStackParamList;

const PartidosStack = createNativeStackNavigator<PartidosStackParamList>();
const Tab           = createBottomTabNavigator<RootTabParamList>();

// ── Partidos nested stack ─────────────────────────────────────────────────────
// Nesting the stack INSIDE the tab means the tab bar stays rendered
// when MatchDetail is on screen.

function PartidosNavigator() {
  return (
    <PartidosStack.Navigator screenOptions={{ headerShown: false }}>
      <PartidosStack.Screen name="PartidosHome" component={PartidosScreen} />
      <PartidosStack.Screen
        name="MatchDetail"
        component={MatchDetailScreen}
        options={{
          animation: 'slide_from_right',
          gestureEnabled: true,
          gestureDirection: 'horizontal',
        }}
      />
      <PartidosStack.Screen
        name="TeamDetail"
        component={TeamDetailScreen}
        options={{
          animation: 'slide_from_right',
          gestureEnabled: true,
          gestureDirection: 'horizontal',
        }}
      />
      <PartidosStack.Screen
        name="PlayerDetail"
        component={PlayerDetailScreen}
        options={{
          animation: 'slide_from_right',
          gestureEnabled: true,
          gestureDirection: 'horizontal',
        }}
      />
      <PartidosStack.Screen
        name="LeagueDetail"
        component={LeagueDetailScreen}
        options={{
          animation: 'slide_from_right',
          gestureEnabled: true,
          gestureDirection: 'horizontal',
        }}
      />
      <PartidosStack.Screen
        name="GlobalSearch"
        component={GlobalSearchScreen}
        options={{
          animation: 'fade_from_bottom',
          gestureEnabled: true,
          gestureDirection: 'horizontal',
        }}
      />
    </PartidosStack.Navigator>
  );
}

// ── Tab icons ─────────────────────────────────────────────────────────────────

const PartidosIcon = ({ color }: { color: string }) => (
  <View style={iconS.partidosWrap}>
    <View style={[iconS.partidosPanel, { borderColor: color }]}>
      <View style={[iconS.partidosPanelLine, { backgroundColor: color, width: 6 }]} />
      <View style={[iconS.partidosPanelLine, { backgroundColor: color, width: 4 }]} />
    </View>
    <View style={[iconS.partidosDivider, { backgroundColor: color }]} />
    <View style={[iconS.partidosPanel, { borderColor: color }]}>
      <View style={[iconS.partidosPanelLine, { backgroundColor: color, width: 6 }]} />
      <View style={[iconS.partidosPanelLine, { backgroundColor: color, width: 4 }]} />
    </View>
    <View style={iconS.partidosDot} />
  </View>
);

const FavoritosIcon = ({ color, focused }: { color: string; focused?: boolean }) => (
  <View style={iconS.favWrap}>
    <Text style={[iconS.favStar, { color }]}>{focused ? '★' : '☆'}</Text>
  </View>
);

const NoticiasIcon = ({ color }: { color: string }) => (
  <View style={[iconS.noticiasWrap, { borderColor: color }]}>
    <View style={[iconS.noticiasTopBar, { backgroundColor: color }]} />
    <View style={iconS.noticiasLines}>
      <View style={[iconS.noticiasLine, { backgroundColor: color, width: 12 }]} />
      <View style={[iconS.noticiasLine, { backgroundColor: color, width: 9 }]} />
      <View style={[iconS.noticiasLine, { backgroundColor: color, width: 11 }]} />
    </View>
  </View>
);

const PerfilIcon = ({ color }: { color: string }) => (
  <View style={iconS.perfilWrap}>
    <View style={[iconS.perfilHead, { backgroundColor: color }]} />
    <View style={[iconS.perfilBody, { backgroundColor: color }]} />
  </View>
);

const iconS = StyleSheet.create({
  partidosWrap: {
    width: 26, height: 22, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 1, position: 'relative',
  },
  partidosPanel: {
    width: 10, height: 18, borderRadius: 3, borderWidth: 1.8,
    justifyContent: 'center', alignItems: 'center', gap: 2,
  },
  partidosPanelLine: { height: 1.5, borderRadius: 1, opacity: 0.6 },
  partidosDivider:   { width: 1.5, height: 10, borderRadius: 1, opacity: 0.4 },
  partidosDot: {
    position: 'absolute', top: -1, right: -2,
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444',
  },
  favWrap:     { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  favStar:     { fontSize: 22, lineHeight: 24 },
  noticiasWrap: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.8, overflow: 'hidden' },
  noticiasTopBar: { height: 4, width: '100%', opacity: 0.3 },
  noticiasLines: { flex: 1, justifyContent: 'center', gap: 2.5, paddingHorizontal: 2, paddingTop: 1 },
  noticiasLine:  { height: 1.5, borderRadius: 1, opacity: 0.6 },
  perfilWrap: { width: 22, height: 24, alignItems: 'center', justifyContent: 'flex-end' },
  perfilHead: { width: 10, height: 10, borderRadius: 5, marginBottom: 2 },
  perfilBody: {
    width: 18, height: 9,
    borderTopLeftRadius: 9, borderTopRightRadius: 9,
    borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
  },
});

// ── Bottom tab navigator ──────────────────────────────────────────────────────

const TAB_ICONS: Record<string, (color: string, focused: boolean) => React.ReactNode> = {
  Partidos:  (color)          => <PartidosIcon color={color} />,
  Favoritos: (color, focused) => <FavoritosIcon color={color} focused={focused} />,
  Noticias:  (color)          => <NoticiasIcon color={color} />,
  Perfil:    (color)          => <PerfilIcon color={color} />,
};

function MainTabs() {
  const c = useThemeColors();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: c.tabBg,
          borderTopColor: c.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 80 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor:   c.tabActive,
        tabBarInactiveTintColor: c.tabInactive,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600' as const,
          letterSpacing: 0.2,
          marginTop: 2,
        },
        tabBarIcon: ({ color, focused }) =>
          TAB_ICONS[route.name]?.(color, focused) ?? null,
      })}
    >
      {/* Partidos tab uses its own nested stack so MatchDetail keeps the tab bar */}
      <Tab.Screen
        name="Partidos"
        component={PartidosNavigator}
        options={{ tabBarLabel: 'Partidos' }}
      />
      <Tab.Screen name="Favoritos" component={FavoritosScreen} />
      <Tab.Screen name="Noticias"  component={NoticiasScreen} />
      <Tab.Screen name="Perfil"    component={PerfilScreen} />
    </Tab.Navigator>
  );
}

// ── Nav theme ─────────────────────────────────────────────────────────────────

function makeNavTheme(c: ColorPalette, isDark: boolean) {
  return {
    dark: isDark,
    colors: {
      primary:      c.accent,
      background:   c.bg,
      card:         c.tabBg,
      text:         c.textPrimary,
      border:       c.border,
      notification: c.live,
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' as const },
      medium:  { fontFamily: 'System', fontWeight: '500' as const },
      bold:    { fontFamily: 'System', fontWeight: '700' as const },
      heavy:   { fontFamily: 'System', fontWeight: '800' as const },
    },
  };
}

// ── Root navigator ────────────────────────────────────────────────────────────

export const AppNavigator: React.FC = () => {
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const { hasCompletedOnboarding, ready } = useOnboarding();
  const navTheme = useMemo(() => makeNavTheme(c, isDark), [c, isDark]);

  // Fade-in the main app after onboarding completes (Feature 9)
  const mainFade     = useRef(new Animated.Value(0)).current;
  const wasOnboarding = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (!hasCompletedOnboarding) {
      wasOnboarding.current = true;
      return;
    }
    if (wasOnboarding.current) {
      // Coming from onboarding — fade in smoothly
      Animated.timing(mainFade, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      // Returning user — show immediately, no animation
      mainFade.setValue(1);
    }
  }, [ready, hasCompletedOnboarding]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wait for AsyncStorage to resolve before deciding what to show
  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  }

  // First launch — show onboarding flow
  if (!hasCompletedOnboarding) {
    return <OnboardingScreen />;
  }

  return (
    <Animated.View style={{ flex: 1, opacity: mainFade }}>
      <NavigationContainer theme={navTheme}>
        <MainTabs />
      </NavigationContainer>
    </Animated.View>
  );
};
