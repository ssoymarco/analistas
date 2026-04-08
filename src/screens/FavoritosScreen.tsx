import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/colors';
import { useOnboarding } from '../contexts/OnboardingContext';

// ── Data ──────────────────────────────────────────────────────────────────────
interface FavItem { id: string; name: string; subtitle: string; emoji: string }

const ALL_TEAMS: FavItem[] = [
  { id: 'america',      name: 'América',             subtitle: 'Liga MX · México',             emoji: '🦅' },
  { id: 'chivas',       name: 'Chivas',              subtitle: 'Liga MX · México',             emoji: '🐐' },
  { id: 'tigres',       name: 'Tigres UANL',         subtitle: 'Liga MX · México',             emoji: '🐯' },
  { id: 'cruz-azul',    name: 'Cruz Azul',           subtitle: 'Liga MX · México',             emoji: '🔵' },
  { id: 'monterrey',    name: 'Monterrey',           subtitle: 'Liga MX · México',             emoji: '⚽' },
  { id: 'pumas',        name: 'Pumas UNAM',          subtitle: 'Liga MX · México',             emoji: '🐆' },
  { id: 'real-madrid',  name: 'Real Madrid',         subtitle: 'La Liga · España',             emoji: '👑' },
  { id: 'barcelona',    name: 'Barcelona',           subtitle: 'La Liga · España',             emoji: '🔵🔴' },
  { id: 'liverpool',    name: 'Liverpool',           subtitle: 'Premier League · Inglaterra',  emoji: '🔴' },
  { id: 'man-city',     name: 'Manchester City',     subtitle: 'Premier League · Inglaterra',  emoji: '🔵' },
  { id: 'arsenal',      name: 'Arsenal',             subtitle: 'Premier League · Inglaterra',  emoji: '🔴' },
  { id: 'chelsea',      name: 'Chelsea',             subtitle: 'Premier League · Inglaterra',  emoji: '🔵' },
  { id: 'psg',          name: 'PSG',                 subtitle: 'Ligue 1 · Francia',            emoji: '🔴🔵' },
  { id: 'bayern',       name: 'Bayern Múnich',       subtitle: 'Bundesliga · Alemania',        emoji: '🔴' },
  { id: 'juventus',     name: 'Juventus',            subtitle: 'Serie A · Italia',             emoji: '⚪⚫' },
  { id: 'inter',        name: 'Inter de Milán',      subtitle: 'Serie A · Italia',             emoji: '🔵⚫' },
  { id: 'atletico',     name: 'Atlético de Madrid',  subtitle: 'La Liga · España',             emoji: '🔴⚪' },
  { id: 'dortmund',     name: 'Borussia Dortmund',   subtitle: 'Bundesliga · Alemania',        emoji: '🟡⚫' },
  { id: 'boca',         name: 'Boca Juniors',        subtitle: 'Liga Profesional · Argentina', emoji: '🔵🟡' },
  { id: 'flamengo',     name: 'Flamengo',            subtitle: 'Brasileirão · Brasil',         emoji: '🔴⚫' },
  { id: 'inter-miami',  name: 'Inter Miami',         subtitle: 'MLS · EUA',                    emoji: '🩷' },
  { id: 'sel-mexico',   name: 'Selección Mexicana',  subtitle: 'CONCACAF · México',            emoji: '🇲🇽' },
  { id: 'man-united',   name: 'Manchester United',   subtitle: 'Premier League · Inglaterra',  emoji: '🔴' },
  { id: 'ac-milan',     name: 'AC Milan',            subtitle: 'Serie A · Italia',             emoji: '🔴⚫' },
  { id: 'napoli',       name: 'Napoli',              subtitle: 'Serie A · Italia',             emoji: '🔵' },
];

const ALL_LEAGUES: FavItem[] = [
  { id: 'liga-mx',          name: 'Liga MX',              subtitle: 'México',                emoji: '🇲🇽' },
  { id: 'premier-league',   name: 'Premier League',       subtitle: 'Inglaterra',            emoji: '🇬🇧' },
  { id: 'la-liga',          name: 'La Liga',              subtitle: 'España',                emoji: '🇪🇸' },
  { id: 'champions-league', name: 'Champions League',     subtitle: 'Europa · UEFA',         emoji: '⭐' },
  { id: 'serie-a',          name: 'Serie A',              subtitle: 'Italia',                emoji: '🇮🇹' },
  { id: 'bundesliga',       name: 'Bundesliga',           subtitle: 'Alemania',              emoji: '🇩🇪' },
  { id: 'ligue-1',          name: 'Ligue 1',              subtitle: 'Francia',               emoji: '🇫🇷' },
  { id: 'brasileirao',      name: 'Brasileirão',          subtitle: 'Brasil',                emoji: '🇧🇷' },
  { id: 'mls',              name: 'MLS',                  subtitle: 'EUA / Canadá',          emoji: '🇺🇸' },
  { id: 'liga-arg',         name: 'Liga Profesional',     subtitle: 'Argentina',             emoji: '🇦🇷' },
  { id: 'europa-league',    name: 'Europa League',        subtitle: 'Europa · UEFA',         emoji: '🟠' },
  { id: 'copa-libertadores',name: 'Copa Libertadores',    subtitle: 'Sudamérica',            emoji: '🏆' },
  { id: 'concacaf-cl',      name: 'CONCACAF Champions',   subtitle: 'CONCACAF',              emoji: '🏆' },
  { id: 'mundial-clubes',   name: 'Mundial de Clubes',    subtitle: 'FIFA',                  emoji: '🌍' },
];

const ALL_PLAYERS: FavItem[] = [
  { id: 'messi',          name: 'Lionel Messi',         subtitle: 'Inter Miami · Argentina',    emoji: '🐐' },
  { id: 'mbappe',         name: 'Kylian Mbappé',        subtitle: 'Real Madrid · Francia',      emoji: '🇫🇷' },
  { id: 'haaland',        name: 'Erling Haaland',       subtitle: 'Manchester City · Noruega',  emoji: '🇳🇴' },
  { id: 'vinicius',       name: 'Vinícius Jr',          subtitle: 'Real Madrid · Brasil',       emoji: '🇧🇷' },
  { id: 'bellingham',     name: 'Jude Bellingham',      subtitle: 'Real Madrid · Inglaterra',   emoji: '🇬🇧' },
  { id: 'salah',          name: 'Mohamed Salah',        subtitle: 'Liverpool · Egipto',         emoji: '🇪🇬' },
  { id: 'santi-gimenez',  name: 'Santi Giménez',        subtitle: 'Feyenoord · México',         emoji: '🇲🇽' },
  { id: 'lamine-yamal',   name: 'Lamine Yamal',         subtitle: 'Barcelona · España',         emoji: '🇪🇸' },
  { id: 'de-bruyne',      name: 'Kevin De Bruyne',      subtitle: 'Manchester City · Bélgica',  emoji: '🇧🇪' },
  { id: 'saka',           name: 'Bukayo Saka',          subtitle: 'Arsenal · Inglaterra',       emoji: '🇬🇧' },
  { id: 'henry-martin',   name: 'Henry Martín',         subtitle: 'América · México',           emoji: '🇲🇽' },
  { id: 'lewandowski',    name: 'Robert Lewandowski',   subtitle: 'Barcelona · Polonia',        emoji: '🇵🇱' },
  { id: 'kane',           name: 'Harry Kane',           subtitle: 'Bayern Múnich · Inglaterra', emoji: '🇬🇧' },
  { id: 'chicharito',     name: 'Chicharito',           subtitle: 'Chivas · México',            emoji: '🇲🇽' },
  { id: 'edson-alvarez',  name: 'Edson Álvarez',        subtitle: 'West Ham · México',          emoji: '🇲🇽' },
  { id: 'modric',         name: 'Luka Modrić',          subtitle: 'Real Madrid · Croacia',      emoji: '🇭🇷' },
  { id: 'cr7',            name: 'Cristiano Ronaldo',    subtitle: 'Al Nassr · Portugal',        emoji: '🇵🇹' },
  { id: 'neymar',         name: 'Neymar Jr',            subtitle: 'Santos · Brasil',            emoji: '🇧🇷' },
];

// ── Tabs ──────────────────────────────────────────────────────────────────────
type Tab = 'equipos' | 'ligas' | 'jugadores';
const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'equipos',    label: 'Equipos',    emoji: '🏟️' },
  { id: 'ligas',      label: 'Ligas',      emoji: '🏆' },
  { id: 'jugadores',  label: 'Jugadores',  emoji: '⚽' },
];

// ── Item row ──────────────────────────────────────────────────────────────────
function ItemRow({
  item, selected, onToggle,
}: { item: FavItem; selected: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity style={styles.itemRow} onPress={onToggle} activeOpacity={0.7}>
      <View style={styles.itemEmoji}>
        <Text style={styles.itemEmojiText}>{item.emoji}</Text>
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
      </View>
      <View style={[styles.toggle, selected && styles.toggleSelected]}>
        {selected && <Text style={styles.toggleCheck}>✓</Text>}
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export const FavoritosScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('equipos');
  const [searchQuery, setSearchQuery] = useState('');

  const { selectedTeams, toggleTeam, selectedLeagues, toggleLeague, selectedPlayers, togglePlayer } = useOnboarding();

  const dataMap: Record<Tab, { items: FavItem[]; selected: string[]; onToggle: (id: string) => void }> = {
    equipos:   { items: ALL_TEAMS,   selected: selectedTeams,   onToggle: toggleTeam   },
    ligas:     { items: ALL_LEAGUES, selected: selectedLeagues, onToggle: toggleLeague },
    jugadores: { items: ALL_PLAYERS, selected: selectedPlayers, onToggle: togglePlayer },
  };

  const { items, selected, onToggle } = dataMap[activeTab];

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(i =>
      i.name.toLowerCase().includes(q) || i.subtitle.toLowerCase().includes(q),
    );
  }, [items, searchQuery]);

  const selectedCount = selected.length;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Favoritos</Text>
          {selectedCount > 0 && (
            <Text style={styles.subtitle}>{selectedCount} seleccionado{selectedCount !== 1 ? 's' : ''}</Text>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => { setActiveTab(tab.id); setSearchQuery(''); }}
              activeOpacity={0.7}
            >
              <Text style={styles.tabEmoji}>{tab.emoji}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={`Buscar ${activeTab}...`}
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Selected chips */}
      {selected.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsContent}
        >
          {selected.map(id => {
            const item = items.find(i => i.id === id);
            if (!item) return null;
            return (
              <TouchableOpacity
                key={id}
                style={styles.chip}
                onPress={() => onToggle(id)}
                activeOpacity={0.8}
              >
                <Text style={styles.chipEmoji}>{item.emoji}</Text>
                <Text style={styles.chipName}>{item.name}</Text>
                <Text style={styles.chipRemove}>✕</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <ItemRow
            item={item}
            selected={selected.includes(item.id)}
            onToggle={() => onToggle(item.id)}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyText}>Sin resultados</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },

  header: {
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10,
  },
  title: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.8 },
  subtitle: { fontSize: 13, color: colors.accent, fontWeight: '600', marginTop: 2 },

  tabBar: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flex: 1,
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  tabEmoji: { fontSize: 13 },
  tabLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabLabelActive: { color: colors.bg },

  searchContainer: { paddingHorizontal: 16, marginBottom: 8 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 12,
    paddingHorizontal: 12, height: 42,
    borderWidth: 1, borderColor: colors.border,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14 },
  searchClear: { fontSize: 13, color: colors.textSecondary, paddingLeft: 8 },

  chipsScroll: { maxHeight: 44, marginBottom: 8 },
  chipsContent: { paddingHorizontal: 16, gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.accentDim, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.accent + '44',
  },
  chipEmoji: { fontSize: 13 },
  chipName: { fontSize: 12, fontWeight: '600', color: colors.accent },
  chipRemove: { fontSize: 10, color: colors.accent, fontWeight: '700' },

  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 11, gap: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  itemEmoji: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  itemEmojiText: { fontSize: 20 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  itemSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  toggle: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  toggleCheck: { fontSize: 13, color: colors.bg, fontWeight: '800' },

  emptyState: { paddingTop: 60, alignItems: 'center', gap: 10 },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: 15, color: colors.textSecondary },
});
