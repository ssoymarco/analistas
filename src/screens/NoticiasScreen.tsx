import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/colors';

const mockNews = [
  {
    id: '1',
    title: 'El Clásico: Real Madrid golea al Barcelona en el Bernabéu',
    source: 'Marca',
    time: 'Hace 2h',
    category: 'La Liga',
  },
  {
    id: '2',
    title: 'Manchester City aplasta al Arsenal con gol agónico de Haaland',
    source: 'ESPN',
    time: 'Hace 3h',
    category: 'Premier League',
  },
  {
    id: '3',
    title: 'El América empata dramáticamente ante Chivas en el Clásico Nacional',
    source: 'TUDN',
    time: 'Hace 4h',
    category: 'Liga MX',
  },
  {
    id: '4',
    title: 'Bayern supera al PSG y se acerca a cuartos de final de la Champions',
    source: 'Goal',
    time: 'Hace 5h',
    category: 'Champions League',
  },
  {
    id: '5',
    title: 'Vinicius Jr. nombrado mejor jugador de la semana en La Liga',
    source: 'AS',
    time: 'Hace 6h',
    category: 'La Liga',
  },
];

const CategoryColors: Record<string, string> = {
  'La Liga': '#F5A623',
  'Premier League': '#9B59B6',
  'Liga MX': '#27AE60',
  'Champions League': '#2980B9',
};

export const NoticiasScreen: React.FC = () => {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <Text style={styles.title}>Noticias</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {mockNews.map((item) => {
          const catColor = CategoryColors[item.category] ?? colors.accent;
          return (
            <TouchableOpacity key={item.id} style={styles.card} activeOpacity={0.75}>
              <View style={styles.cardTop}>
                <View style={[styles.categoryBadge, { backgroundColor: catColor + '22' }]}>
                  <Text style={[styles.categoryText, { color: catColor }]}>
                    {item.category}
                  </Text>
                </View>
                <Text style={styles.timeText}>{item.time}</Text>
              </View>
              <Text style={styles.newsTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.sourceText}>{item.source}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.8,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 12,
    gap: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  timeText: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  newsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  sourceText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
