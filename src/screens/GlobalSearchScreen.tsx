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
import { useTranslation } from 'react-i18next';
import { SkeletonSearch } from '../components/Skeleton';
import { useThemeColors } from '../theme/useTheme';
import { useDarkMode } from '../contexts/DarkModeContext';
import type { PartidosStackParamList } from '../navigation/AppNavigator';
import {
  getSearchableTeams, getSearchablePlayers, getSearchableLeagues, getSearchableNationalTeams,
  getAllSearchableTeams, getAllSearchablePlayers,
  type SearchableTeam, type SearchablePlayer, type SearchableLeague,
} from '../services/sportsApi';
import { BackArrow } from '../components/NavIcons';

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

import { normalize } from '../utils/normalize';

/**
 * Bidirectional country name translations.
 * Key = normalized English name → value = normalized Spanish name.
 * Used to match "España" → "spain", "Alemania" → "germany", etc.
 */
const COUNTRY_EN_TO_ES: Record<string, string> = {
  'spain':         'espana',
  'germany':       'alemania',
  'france':        'francia',
  'england':       'inglaterra',
  'italy':         'italia',
  'portugal':      'portugal',
  'netherlands':   'holanda',
  'belgium':       'belgica',
  'turkey':        'turquia',
  'scotland':      'escocia',
  'denmark':       'dinamarca',
  'russia':        'rusia',
  'egypt':         'egipto',
  'morocco':       'marruecos',
  'brazil':        'brasil',
  'colombia':      'colombia',
  'chile':         'chile',
  'uruguay':       'uruguay',
  'paraguay':      'paraguay',
  'peru':          'peru',
  'ecuador':       'ecuador',
  'honduras':      'honduras',
  'japan':         'japon',
  'canada':        'canada',
  'usa':           'estados unidos',
  'south korea':   'corea',
  'iran':          'iran',
  'saudi arabia':  'arabia saudita',
  'europe':        'europa',
  'south america': 'sudamerica',
  'north america': 'norteamerica',
  'africa':        'africa',
  'world':         'mundo',
};

/** Reverse map: normalized Spanish → normalized English */
const COUNTRY_ES_TO_EN: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRY_EN_TO_ES).map(([en, es]) => [es, en])
);

/**
 * Returns true if `query` matches this country name (in English or Spanish).
 * Handles "España" → matches league with country "Spain", and vice-versa.
 */
function matchesCountry(country: string, q: string): boolean {
  const normCountry = normalize(country);
  if (normCountry.includes(q)) return true;
  // Translate query from Spanish to English and retry
  const qInEn = COUNTRY_ES_TO_EN[q] ?? q;
  if (normCountry.includes(qInEn)) return true;
  // Check if the query matches the Spanish version of this country's English name
  const countryInEs = COUNTRY_EN_TO_ES[normCountry];
  if (countryInEs && countryInEs.includes(q)) return true;
  return false;
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
  const { t } = useTranslation();
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
      // Phase 1: load club teams + players instantly (hardcoded data, no API call)
      const [clubTeams, p, stored] = await Promise.all([
        getSearchableTeams().catch(() => [] as SearchableTeam[]),
        getSearchablePlayers().catch(() => []),
        AsyncStorage.getItem(RECENT_KEY),
      ]);
      if (!mounted) return;
      setTeams(clubTeams);
      setPlayers(p);
      if (stored) {
        try { setRecentSearches(JSON.parse(stored)); } catch { /* ignore */ }
      }
      setLoading(false);

      // Phase 2: load national teams in background (real IDs from SportMonks API)
      getSearchableNationalTeams().then(nationals => {
        if (!mounted) return;
        if (nationals.length > 0) {
          // Merge: nationals first so they appear at top of "EQUIPOS" section
          setTeams(prev => {
            const prevIds = new Set(prev.map(t => t.id));
            const newNationals = nationals.filter(n => !prevIds.has(n.id));
            return [...newNationals, ...prev];
          });
        }
      }).catch(() => { /* silently ignore */ });

      // Phase 3: full team/player index (all leagues + all popular-team squads).
      // Cached 7 days, so after the first run this is effectively free. This is
      // what makes niche clubs (e.g. Dorados — Liga Expansión MX) searchable.
      getAllSearchableTeams().then(all => {
        if (!mounted || all.length === 0) return;
        setTeams(prev => {
          const prevIds = new Set(prev.map(t => t.id));
          const extras = all.filter(t => !prevIds.has(t.id));
          return extras.length > 0 ? [...prev, ...extras] : prev;
        });
      }).catch(() => {});

      getAllSearchablePlayers().then(all => {
        if (!mounted || all.length === 0) return;
        setPlayers(prev => {
          const prevIds = new Set(prev.map(p => p.id));
          const extras = all.filter(p => !prevIds.has(p.id));
          return extras.length > 0 ? [...prev, ...extras] : prev;
        });
      }).catch(() => {});
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

    // Teams — match name, shortName, or extra searchTerms (for national teams / aliases)
    for (const team of teams) {
      const nameMatch = normalize(team.name).includes(q) || normalize(team.shortName).includes(q);
      const aliasMatch = team.searchTerms?.some(term => normalize(term).includes(q)) ?? false;
      if (nameMatch || aliasMatch) {
        out.push({
          id: `team-${team.id}`,
          type: 'team',
          name: team.name,
          subtitle: team.leagueName,
          image: team.logo.startsWith('http') ? team.logo : undefined,
          data: team,
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
          subtitle: p.teamName ?? '',
          image: p.image?.startsWith('http') ? p.image : undefined,
          data: p,
        });
      }
    }

    // Leagues — match name or country (bilingual: Spain ↔ España, Brazil ↔ Brasil, etc.)
    for (const l of leagues) {
      if (normalize(l.name).includes(q) || matchesCountry(l.country, q)) {
        out.push({
          id: `league-${l.id}`,
          type: 'league',
          name: l.name,
          subtitle: l.country,
          image: l.image,
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
    if (teamResults.length > 0)   sections.push({ title: t('search.sectionTeams'), icon: '🏟', data: teamResults });
    if (playerResults.length > 0) sections.push({ title: t('search.sectionPlayers'), icon: '⚽', data: playerResults });
    if (leagueResults.length > 0) sections.push({ title: t('search.sectionLeagues'), icon: '🏆', data: leagueResults });
    return sections;
  }, [results, t]);

  // ── Trending items ────────────────────────────────────────────────────────
  const trending = useMemo<SearchResult[]>(() => {
    const items: SearchResult[] = [];
    // Interleave teams and players for variety
    const maxItems = 10;
    let ti = 0, pi = 0;
    while (items.length < maxItems && (ti < teams.length || pi < players.length)) {
      if (ti < teams.length) {
        const team = teams[ti++];
        // Skip national teams from trending (they belong in search, not trending)
        if (team.leagueName !== 'Selección Nacional') {
          items.push({
            id: `team-${team.id}`,
            type: 'team',
            name: team.name,
            subtitle: team.leagueName,
            image: team.logo.startsWith('http') ? team.logo : undefined,
            data: team,
          });
        }
      }
      if (items.length >= maxItems) break;
      if (pi < players.length) {
        const player = players[pi++];
        items.push({
          id: `player-${player.id}`,
          type: 'player',
          name: player.name,
          subtitle: player.teamName || t('search.labelPlayer'),
          image: player.image?.startsWith('http') ? player.image : undefined,
          data: player,
        });
      }
    }
    return items;
  }, [teams, players, t]);

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
        leagueLogo: l.image,
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

  const renderAvatar = (
    image: string | undefined,
    type: SearchResultType,
    size = 40,
    fallbackIcon?: string,
  ) => {
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
    const icon = fallbackIcon ?? (type === 'team' ? '🏟' : type === 'player' ? '👤' : '🏆');
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

  const renderTypeLabel = (type: SearchResultType, subtitle?: string) => {
    const isNational = type === 'team' && subtitle === 'Selección Nacional';
    const label = isNational
      ? t('search.labelNational')
      : type === 'team' ? t('search.labelTeam')
      : type === 'player' ? t('search.labelPlayer')
      : t('search.labelLeague');
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
          <BackArrow color={c.textPrimary} />
        </TouchableOpacity>
        <View style={[s.inputWrap, { backgroundColor: inputBg }]}>
          <SearchInputIcon />
          <TextInput
            ref={inputRef}
            style={[s.input, { color: c.textPrimary }]}
            placeholder={t('search.placeholder')}
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
          {t('search.subtitle')}
        </Text>
      </View>

      {loading ? (
        <SkeletonSearch />
      ) : isSearching ? (
        /* ── Search results ── */
        results.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={{ fontSize: 40 }}>🔍</Text>
            <Text style={[s.emptyTitle, { color: c.textPrimary }]}>{t('search.noResults')}</Text>
            <Text style={[s.emptySubtitle, { color: c.textSecondary }]}>
              {t('search.noResultsFor', { query: debouncedQuery })}
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
                      {renderAvatar(
                        item.image,
                        item.type,
                        40,
                        item.type === 'league' ? (item.data as SearchableLeague).flag : undefined,
                      )}
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
                      {renderTypeLabel(item.type, item.subtitle)}
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
                    <Text style={[s.sectionTitle, { color: c.textTertiary }]}>{t('search.sectionRecent')}</Text>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity onPress={clearRecent} activeOpacity={0.7}>
                      <Text style={[s.clearAllText, { color: c.accent }]}>{t('search.clearAll')}</Text>
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
                    <Text style={[s.sectionTitle, { color: c.textTertiary }]}>{t('search.sectionTrending')}</Text>
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
