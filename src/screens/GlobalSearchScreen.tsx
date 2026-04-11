import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Image,
  StyleSheet, Keyboard, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import type { PartidosStackParamList } from '../navigation/AppNavigator';
import {
  getSearchableTeams, getSearchablePlayers, getSearchableLeagues,
  type SearchableTeam, type SearchablePlayer, type SearchableLeague,
} from '../services/sportsApi';

const RECENT_KEY = 'analistas_recent_searches';
const MAX_RECENT = 8;

// ── Types ────────────────────────────────────────────────────────────────────

type SearchResultType = 'team' | 'player' | 'league';

interface SearchResult {
  id: string;
  type: SearchResultType;
  name: string;
  subtitle: string;
  image?: string;
  data: SearchableTeam | SearchablePlayer | SearchableLeague;
}

interface RecentSearch {
  id: string;
  type: SearchResultType;
  name: string;
  subtitle: string;
  image?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalize(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function highlightMatch(text: string, query: string): React.ReactNode[] {
  if (!query) return [text];
  const normText = normalize(text);
  const normQuery = normalize(query);
  const idx = normText.indexOf(normQuery);
  if (idx === -1) return [text];
  return [
    text.slice(0, idx),
    text.slice(idx, idx + query.length),
    text.slice(idx + query.length),
  ];
}

// ── Screen ───────────────────────────────────────────────────────────────────

export const GlobalSearchScreen: React.FC = () => {
  const c = useThemeColors();
  const { isDark } = useDarkMode();
  const navigation = useNavigation<NativeStackNavigationProp<PartidosStackParamList>>();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [teams, setTeams] = useState<SearchableTeam[]>([]);
  const [players, setPlayers] = useState<SearchablePlayer[]>([]);
  const leagues = useMemo(() => getSearchableLeagues(), []);
  const [loading, setLoading] = useState(true);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);

  // ── Load data & recent searches on mount ──────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [t, p, stored] = await Promise.all([
        getSearchableTeams().catch(() => []),
        getSearchablePlayers().catch(() => []),
        AsyncStorage.getItem(RECENT_KEY),
      ]);
      if (!mounted) return;
      setTeams(t);
      setPlayers(p);
      if (stored) {
        try { setRecentSearches(JSON.parse(stored)); } catch { /* ignore */ }
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  // ── Auto-focus input ──────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, []);

  // ── Debounce query ────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  // ── Search logic ──────────────────────────────────────────────────────────
  const results = useMemo<SearchResult[]>(() => {
    if (!debouncedQuery) return [];
    const q = normalize(debouncedQuery);
    const out: SearchResult[] = [];

    // Teams
    for (const t of teams) {
      if (normalize(t.name).includes(q) || normalize(t.shortName).includes(q)) {
        out.push({
          id: `team-${t.id}`,
          type: 'team',
          name: t.name,
          subtitle: t.leagueName,
          image: t.logo.startsWith('http') ? t.logo : undefined,
          data: t,
        });
      }
    }

    // Players
    for (const p of players) {
      if (normalize(p.name).includes(q)) {
        out.push({
          id: `player-${p.id}`,
          type: 'player',
          name: p.name,
          subtitle: p.teamName || 'Jugador',
          image: p.image?.startsWith('http') ? p.image : undefined,
          data: p,
        });
      }
    }

    // Leagues
    for (const l of leagues) {
      if (normalize(l.name).includes(q) || normalize(l.country).includes(q)) {
        out.push({
          id: `league-${l.id}`,
          type: 'league',
          name: l.name,
          subtitle: l.country,
          image: undefined,
          data: l,
        });
      }
    }

    return out;
  }, [debouncedQuery, teams, players, leagues]);

  // ── Grouped results ───────────────────────────────────────────────────────
  const groupedResults = useMemo(() => {
    const sections: { title: string; icon: string; data: SearchResult[] }[] = [];
    const teamResults = results.filter(r => r.type === 'team');
    const playerResults = results.filter(r => r.type === 'player');
    const leagueResults = results.filter(r => r.type === 'league');
    if (teamResults.length > 0)   sections.push({ title: 'EQUIPOS', icon: '🏟', data: teamResults });
    if (playerResults.length > 0) sections.push({ title: 'JUGADORES', icon: '⚽', data: playerResults });
    if (leagueResults.length > 0) sections.push({ title: 'LIGAS', icon: '🏆', data: leagueResults });
    return sections;
  }, [results]);

  // ── Trending items ────────────────────────────────────────────────────────
  const trending = useMemo<SearchResult[]>(() => {
    const items: SearchResult[] = [];
    // Interleave teams and players for variety
    const maxItems = 10;
    let ti = 0, pi = 0;
    while (items.length < maxItems && (ti < teams.length || pi < players.length)) {
      if (ti < teams.length) {
        const t = teams[ti++];
        items.push({
          id: `team-${t.id}`,
          type: 'team',
          name: t.name,
          subtitle: 'Equipo',
          image: t.logo.startsWith('http') ? t.logo : undefined,
          data: t,
        });
      }
      if (items.length >= maxItems) break;
      if (pi < players.length) {
        const p = players[pi++];
        items.push({
          id: `player-${p.id}`,
          type: 'player',
          name: p.name,
          subtitle: 'Jugador',
          image: p.image?.startsWith('http') ? p.image : undefined,
          data: p,
        });
      }
    }
    return items;
  }, [teams, players]);

  // ── Navigate to result ────────────────────────────────────────────────────
  const handleResultPress = useCallback((item: SearchResult) => {
    Keyboard.dismiss();
    // Save to recent
    const recent: RecentSearch = {
      id: item.id,
      type: item.type,
      name: item.name,
      subtitle: item.subtitle,
      image: item.image,
    };
    setRecentSearches(prev => {
      const next = [recent, ...prev.filter(r => r.id !== item.id)].slice(0, MAX_RECENT);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });

    if (item.type === 'team') {
      const t = item.data as SearchableTeam;
      navigation.navigate('TeamDetail', {
        teamId: t.id,
        teamName: t.name,
        teamLogo: t.logo,
        seasonId: t.seasonId,
      });
    } else if (item.type === 'player') {
      const p = item.data as SearchablePlayer;
      navigation.navigate('PlayerDetail', {
        playerId: p.id,
        playerName: p.name,
        playerImage: p.image,
        teamName: p.teamName,
        teamLogo: p.teamLogo,
        jerseyNumber: p.jerseyNumber,
      });
    } else if (item.type === 'league') {
      const l = item.data as SearchableLeague;
      navigation.navigate('LeagueDetail', {
        leagueId: l.id,
        leagueName: l.name,
        leagueLogo: l.flag,
        seasonId: l.seasonId,
      });
    }
  }, [navigation]);

  const handleRecentPress = useCallback((item: RecentSearch) => {
    Keyboard.dismiss();
    if (item.type === 'team') {
      const id = Number(item.id.replace('team-', ''));
      const team = teams.find(t => t.id === id);
      if (team) {
        handleResultPress({
          ...item,
          data: team,
        });
      }
    } else if (item.type === 'player') {
      const id = Number(item.id.replace('player-', ''));
      const player = players.find(p => p.id === id);
      if (player) {
        handleResultPress({
          ...item,
          data: player,
        });
      }
    } else if (item.type === 'league') {
      const id = Number(item.id.replace('league-', ''));
      const league = leagues.find(l => l.id === id);
      if (league) {
        handleResultPress({
          ...item,
          data: league,
        });
      }
    }
  }, [teams, players, leagues, handleResultPress]);

  const clearRecent = useCallback(() => {
    setRecentSearches([]);
    AsyncStorage.removeItem(RECENT_KEY);
  }, []);

  const removeRecent = useCallback((id: string) => {
    setRecentSearches(prev => {
      const next = prev.filter(r => r.id !== id);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Theme-aware colors ────────────────────────────────────────────────────
  const inputBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const badgeBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const typeLabelColor = c.accent;

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderAvatar = (image: string | undefined, type: SearchResultType, size = 40) => {
    if (image) {
      return (
        <Image
          source={{ uri: image }}
          style={{
            width: size, height: size,
            borderRadius: type === 'player' ? size / 2 : 8,
            backgroundColor: badgeBg,
          }}
          resizeMode="contain"
        />
      );
    }
    const icon = type === 'team' ? '🏟' : type === 'player' ? '👤' : '🏆';
    return (
      <View style={[s.avatarPlaceholder, {
        width: size, height: size,
        borderRadius: type === 'player' ? size / 2 : 8,
        backgroundColor: badgeBg,
      }]}>
        <Text style={{ fontSize: size * 0.45 }}>{icon}</Text>
      </View>
    );
  };

  const renderTypeLabel = (type: SearchResultType) => {
    const label = type === 'team' ? 'Equipo' : type === 'player' ? 'Jugador' : 'Liga';
    return (
      <Text style={[s.typeLabel, { color: typeLabelColor }]}>{label}</Text>
    );
  };

  const ChevronRight = () => (
    <View style={s.chevron}>
      <View style={[s.chevronLine1, { backgroundColor: c.textTertiary }]} />
      <View style={[s.chevronLine2, { backgroundColor: c.textTertiary }]} />
    </View>
  );

  // ── Back arrow icon ───────────────────────────────────────────────────────
  const BackArrow = () => (
    <View style={{ width: 10, height: 18, justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: 8, height: 1.5, borderRadius: 1, backgroundColor: c.textPrimary, transform: [{ rotate: '-45deg' }, { translateY: -3 }] }} />
      <View style={{ position: 'absolute', width: 8, height: 1.5, borderRadius: 1, backgroundColor: c.textPrimary, transform: [{ rotate: '45deg' }, { translateY: 3 }] }} />
    </View>
  );

  // ── Search icon for input ─────────────────────────────────────────────────
  const SearchInputIcon = () => (
    <View style={{ width: 14, height: 14, marginRight: 8 }}>
      <View style={{ position: 'absolute', top: 0, left: 0, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: c.textTertiary }} />
      <View style={{ position: 'absolute', bottom: 0, right: 0, width: 4, height: 1.5, backgroundColor: c.textTertiary, borderRadius: 1, transform: [{ rotate: '45deg' }, { translateX: 0.5 }, { translateY: -1.5 }] }} />
    </View>
  );

  // ── Close (X) icon for clear ──────────────────────────────────────────────
  const ClearIcon = () => (
    <View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: 12, height: 1.5, borderRadius: 1, backgroundColor: c.textTertiary, transform: [{ rotate: '45deg' }] }} />
      <View style={{ position: 'absolute', width: 12, height: 1.5, borderRadius: 1, backgroundColor: c.textTertiary, transform: [{ rotate: '-45deg' }] }} />
    </View>
  );

  // ── Main content ──────────────────────────────────────────────────────────

  const isSearching = debouncedQuery.length > 0;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: c.bg }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Header with search bar ── */}
      <View style={[s.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <BackArrow />
        </TouchableOpacity>
        <View style={[s.inputWrap, { backgroundColor: inputBg }]}>
          <SearchInputIcon />
          <TextInput
            ref={inputRef}
            style={[s.input, { color: c.textPrimary }]}
            placeholder="Equipos, jugadores, ligas..."
            placeholderTextColor={c.textTertiary}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} style={s.clearBtn} activeOpacity={0.7}>
              <ClearIcon />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Subtitle ── */}
      <View style={[s.subtitleRow, { borderBottomColor: c.border }]}>
        <Text style={[s.subtitleText, { color: c.textTertiary }]}>
          Busca equipos, jugadores, ligas y noticias
        </Text>
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={c.accent} />
          <Text style={[s.loadingText, { color: c.textSecondary }]}>Cargando datos...</Text>
        </View>
      ) : isSearching ? (
        /* ── Search results ── */
        results.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={{ fontSize: 40 }}>🔍</Text>
            <Text style={[s.emptyTitle, { color: c.textPrimary }]}>Sin resultados</Text>
            <Text style={[s.emptySubtitle, { color: c.textSecondary }]}>
              No se encontraron resultados para "{debouncedQuery}"
            </Text>
          </View>
        ) : (
          <FlatList
            data={groupedResults}
            keyExtractor={(section) => section.title}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
            renderItem={({ item: section }) => (
              <View>
                {/* Section header */}
                <View style={[s.sectionHeader, { borderBottomColor: c.border }]}>
                  <Text style={{ fontSize: 13 }}>{section.icon}</Text>
                  <Text style={[s.sectionTitle, { color: c.textTertiary }]}>{section.title}</Text>
                  <Text style={[s.sectionCount, { color: c.textTertiary }]}>{section.data.length}</Text>
                </View>
                {/* Items */}
                {section.data.map((item) => {
                  const parts = highlightMatch(item.name, debouncedQuery);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[s.resultRow, { borderBottomColor: c.border }]}
                      onPress={() => handleResultPress(item)}
                      activeOpacity={0.7}
                    >
                      {renderAvatar(item.image, item.type)}
                      <View style={s.resultInfo}>
                        <Text style={[s.resultName, { color: c.textPrimary }]} numberOfLines={1}>
                          {parts.map((part, i) =>
                            i === 1 ? (
                              <Text key={i} style={{ color: c.accent, fontWeight: '700' }}>{part}</Text>
                            ) : (
                              <Text key={i}>{part}</Text>
                            )
                          )}
                        </Text>
                        <Text style={[s.resultSubtitle, { color: c.textTertiary }]} numberOfLines={1}>
                          {item.subtitle}
                        </Text>
                      </View>
                      {renderTypeLabel(item.type)}
                      <ChevronRight />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          />
        )
      ) : (
        /* ── Default state: recent + trending ── */
        <FlatList
          data={[{ key: 'content' }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={() => (
            <View>
              {/* Recent searches */}
              {recentSearches.length > 0 && (
                <View>
                  <View style={[s.sectionHeader, { borderBottomColor: c.border }]}>
                    <Text style={{ fontSize: 13 }}>🕐</Text>
                    <Text style={[s.sectionTitle, { color: c.textTertiary }]}>RECIENTES</Text>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity onPress={clearRecent} activeOpacity={0.7}>
                      <Text style={[s.clearAllText, { color: c.accent }]}>Borrar</Text>
                    </TouchableOpacity>
                  </View>
                  {recentSearches.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[s.resultRow, { borderBottomColor: c.border }]}
                      onPress={() => handleRecentPress(item)}
                      activeOpacity={0.7}
                    >
                      {renderAvatar(item.image, item.type, 36)}
                      <View style={s.resultInfo}>
                        <Text style={[s.resultName, { color: c.textPrimary }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={[s.resultSubtitle, { color: c.textTertiary }]} numberOfLines={1}>
                          {item.subtitle}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => removeRecent(item.id)}
                        style={s.removeRecentBtn}
                        activeOpacity={0.7}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <ClearIcon />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Trending */}
              {trending.length > 0 && (
                <View>
                  <View style={[s.sectionHeader, { borderBottomColor: c.border }]}>
                    <Text style={{ fontSize: 13 }}>📈</Text>
                    <Text style={[s.sectionTitle, { color: c.textTertiary }]}>TENDENCIAS</Text>
                  </View>
                  {trending.map((item, idx) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[s.resultRow, { borderBottomColor: c.border }]}
                      onPress={() => handleResultPress(item)}
                      activeOpacity={0.7}
                    >
                      {/* Ranking number */}
                      <View style={[s.rankBadge, { backgroundColor: badgeBg }]}>
                        <Text style={[s.rankText, { color: c.textSecondary }]}>{idx + 1}</Text>
                      </View>
                      {renderAvatar(item.image, item.type, 36)}
                      <View style={s.resultInfo}>
                        <Text style={[s.resultName, { color: c.textPrimary }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={[s.resultSubtitle, { color: c.textTertiary }]} numberOfLines={1}>
                          {item.subtitle}
                        </Text>
                      </View>
                      <ChevronRight />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
};

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 0,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 4,
    marginLeft: 4,
  },
  subtitleRow: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  subtitleText: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 80,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 80,
    gap: 8,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: '600',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultInfo: {
    flex: 1,
    gap: 2,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '600',
  },
  resultSubtitle: {
    fontSize: 12,
    fontWeight: '400',
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 13,
    fontWeight: '700',
  },
  removeRecentBtn: {
    padding: 6,
  },
  chevron: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  chevronLine1: {
    position: 'absolute',
    width: 6,
    height: 1.5,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }, { translateY: -2 }],
  },
  chevronLine2: {
    position: 'absolute',
    width: 6,
    height: 1.5,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }, { translateY: 2 }],
  },
});
