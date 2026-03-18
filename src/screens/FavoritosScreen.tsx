import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/colors';

export const FavoritosScreen: React.FC = () => {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <Text style={styles.title}>Favoritos</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.emptyIcon}>⭐</Text>
        <Text style={styles.emptyTitle}>Sin favoritos aún</Text>
        <Text style={styles.emptySubtitle}>
          Agrega equipos o ligas a tus favoritos{'\n'}para verlos aquí
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.8,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 60,
  },
  emptyIcon: {
    fontSize: 52,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
