import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors } from '../theme/colors';
import { PartidosScreen } from '../screens/PartidosScreen';
import { FavoritosScreen } from '../screens/FavoritosScreen';
import { NoticiasScreen } from '../screens/NoticiasScreen';
import { PerfilScreen } from '../screens/PerfilScreen';

export type RootTabParamList = {
  Partidos: undefined;
  Favoritos: undefined;
  Noticias: undefined;
  Perfil: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

// SVG-like icons using View primitives
const BallIcon = ({ color }: { color: string }) => (
  <View style={[tabIconStyles.ball, { borderColor: color }]}>
    <View style={[tabIconStyles.ballLine1, { backgroundColor: color }]} />
    <View style={[tabIconStyles.ballLine2, { backgroundColor: color }]} />
  </View>
);

const StarIcon = ({ color, filled }: { color: string; filled?: boolean }) => (
  <View style={tabIconStyles.starWrap}>
    <Text style={[tabIconStyles.starText, { color }]}>{filled ? '★' : '☆'}</Text>
  </View>
);

const NewsIcon = ({ color }: { color: string }) => (
  <View style={tabIconStyles.newsWrap}>
    <View style={[tabIconStyles.newsLine, { backgroundColor: color, width: 18 }]} />
    <View style={[tabIconStyles.newsLine, { backgroundColor: color, width: 14 }]} />
    <View style={[tabIconStyles.newsLine, { backgroundColor: color, width: 16 }]} />
  </View>
);

const PersonIcon = ({ color }: { color: string }) => (
  <View style={tabIconStyles.personWrap}>
    <View style={[tabIconStyles.personHead, { borderColor: color }]} />
    <View style={[tabIconStyles.personBody, { borderColor: color }]} />
  </View>
);

const tabIconStyles = StyleSheet.create({
  ball: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ballLine1: {
    position: 'absolute',
    width: 2,
    height: 22,
    borderRadius: 1,
    transform: [{ rotate: '40deg' }],
  },
  ballLine2: {
    position: 'absolute',
    width: 2,
    height: 22,
    borderRadius: 1,
    transform: [{ rotate: '-40deg' }],
  },
  starWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starText: {
    fontSize: 20,
    lineHeight: 24,
  },
  newsWrap: {
    width: 22,
    height: 20,
    justifyContent: 'center',
    gap: 4,
  },
  newsLine: {
    height: 2.5,
    borderRadius: 1.5,
  },
  personWrap: {
    width: 22,
    height: 24,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  personHead: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    marginBottom: 2,
  },
  personBody: {
    width: 18,
    height: 10,
    borderRadius: 9,
    borderWidth: 2,
  },
});

const TAB_ICONS: Record<string, (color: string, focused: boolean) => React.ReactNode> = {
  Partidos: (color) => <BallIcon color={color} />,
  Favoritos: (color, focused) => <StarIcon color={color} filled={focused} />,
  Noticias: (color) => <NewsIcon color={color} />,
  Perfil: (color) => <PersonIcon color={color} />,
};

const navigationTheme = {
  dark: true,
  colors: {
    primary: colors.accent,
    background: colors.bg,
    card: colors.tabBg,
    text: colors.textPrimary,
    border: colors.border,
    notification: colors.live,
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' as const },
    medium: { fontFamily: 'System', fontWeight: '500' as const },
    bold: { fontFamily: 'System', fontWeight: '700' as const },
    heavy: { fontFamily: 'System', fontWeight: '800' as const },
  },
};

export const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer theme={navigationTheme}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: colors.tabActive,
          tabBarInactiveTintColor: colors.tabInactive,
          tabBarLabelStyle: styles.tabLabel,
          tabBarIcon: ({ color, focused }) =>
            TAB_ICONS[route.name]?.(color, focused) ?? null,
        })}
      >
        <Tab.Screen name="Partidos" component={PartidosScreen} />
        <Tab.Screen name="Favoritos" component={FavoritosScreen} />
        <Tab.Screen name="Noticias" component={NoticiasScreen} />
        <Tab.Screen name="Perfil" component={PerfilScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.tabBg,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 80 : 64,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    paddingTop: 8,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginTop: 2,
  },
});
