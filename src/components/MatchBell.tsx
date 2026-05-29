// ── MatchBell ─────────────────────────────────────────────────────────────────
// Smart per-match notification toggle.
//
// Renders ONLY for matches the user follows (via FavoritesContext).
// When the user follows a match, the bell becomes a quick mute/unmute toggle.
// The actual notification CONTENT (which events to receive) is controlled
// globally in NotificationPrefsContext — this button only controls whether
// THIS specific match silences itself or respects the global prefs.
//
// Three states:
//   - Not following  → renders null (occupies no space)
//   - Following + active   → filled bell, accent color (notifications ON)
//   - Following + muted    → outline bell with slash, muted color (silenced)
//
// Visual: bell shape drawn with View primitives (no SVG / icon library).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { haptics } from '../utils/haptics';
import { useFavorites } from '../contexts/FavoritesContext';
import { useNotificationPrefs } from '../contexts/NotificationPrefsContext';
import { useThemeColors } from '../theme/useTheme';
import type { Match } from '../data/types';

interface MatchBellProps {
  match: Match;
  /** Width reserved when nothing is rendered, so cards align. Default 0 (no space). */
  reservedWidth?: number;
}

export const MatchBell: React.FC<MatchBellProps> = React.memo(({ match, reservedWidth = 0 }) => {
  const { t } = useTranslation();
  const c = useThemeColors();
  const { isFollowingTeam } = useFavorites();
  const { isMatchMuted, toggleMatchMute } = useNotificationPrefs();

  // ── Decide whether to render ─────────────────────────────────────────────
  // PRODUCT RULE: notifications fire ONLY for followed TEAMS.
  // League selection is for feed-display ordering only (Partidos screen),
  // NOT for notifications. So the bell shows if-and-only-if the user follows
  // one of the two competing teams — never just because they follow the
  // league (e.g. picking "MLS" shouldn't notify on every Houston vs RSL match).
  const isFollowed = useMemo(
    () =>
      isFollowingTeam(match.homeTeam.id) ||
      isFollowingTeam(match.awayTeam.id),
    [match.homeTeam.id, match.awayTeam.id, isFollowingTeam],
  );

  const muted = isMatchMuted(match.id);

  // ── Press feedback animation ─────────────────────────────────────────────
  const scale = useRef(new Animated.Value(1)).current;
  const animatePress = useCallback(
    (toValue: number) => {
      Animated.spring(scale, {
        toValue,
        useNativeDriver: true,
        speed: 50,
        bounciness: 8,
      }).start();
    },
    [scale],
  );

  const onPress = useCallback(() => {
    haptics.selection();
    toggleMatchMute(match.id);
  }, [toggleMatchMute, match.id]);

  // ── Render nothing if not followed ───────────────────────────────────────
  if (!isFollowed) {
    return reservedWidth > 0 ? <View style={{ width: reservedWidth }} /> : null;
  }

  const tint = muted ? c.textTertiary : c.accent;
  const a11yLabel = muted
    ? t('matchBell.unmute')
    : t('matchBell.mute');

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => animatePress(0.82)}
      onPressOut={() => animatePress(1)}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ selected: !muted }}
      hitSlop={10}
      style={s.btn}
    >
      <Animated.View style={[s.iconWrap, { transform: [{ scale }] }]}>
        <BellShape muted={muted} tint={tint} />
      </Animated.View>
    </Pressable>
  );
});

MatchBell.displayName = 'MatchBell';

// ── BellShape ────────────────────────────────────────────────────────────────
// Bell drawn with carefully-tuned View primitives.
//
//      ▢       ← handle (tiny top loop)
//     ╭─╮      ← dome (top-rounded body)
//     │ │
//   ──┴─┴──    ← rim (wider base)
//      •       ← clapper
const BellShape: React.FC<{ muted: boolean; tint: string }> = ({ muted, tint }) => {
  // Active = solid fill; Muted = outline + diagonal slash
  const fill = muted ? 'transparent' : tint;
  const stroke = tint;
  const strokeWidth = 1.4;

  return (
    <View style={s.bell}>
      {/* Handle (tiny stem on top) */}
      <View
        style={[
          s.handle,
          muted
            ? { borderColor: stroke, borderWidth: strokeWidth, borderBottomWidth: 0 }
            : { backgroundColor: fill },
        ]}
      />

      {/* Dome — top half of bell */}
      <View
        style={[
          s.dome,
          muted
            ? { borderColor: stroke, borderWidth: strokeWidth, borderBottomWidth: 0, backgroundColor: 'transparent' }
            : { backgroundColor: fill },
        ]}
      />

      {/* Rim — wider strip at the bottom of the dome */}
      <View
        style={[
          s.rim,
          {
            backgroundColor: muted ? 'transparent' : fill,
            borderColor: stroke,
            borderWidth: muted ? strokeWidth : 0,
          },
        ]}
      />

      {/* Clapper — small dot below the rim */}
      <View
        style={[
          s.clapper,
          muted
            ? { borderColor: stroke, borderWidth: strokeWidth, backgroundColor: 'transparent' }
            : { backgroundColor: fill },
        ]}
      />

      {/* Diagonal slash for muted state */}
      {muted && <View style={[s.slash, { backgroundColor: stroke }]} />}
    </View>
  );
};

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  btn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
  },
  bell: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
  },
  handle: {
    width: 4,
    height: 2.5,
    borderTopLeftRadius: 1.5,
    borderTopRightRadius: 1.5,
  },
  dome: {
    width: 11,
    height: 9,
    borderTopLeftRadius: 5.5,
    borderTopRightRadius: 5.5,
    marginTop: -0.5,
  },
  rim: {
    width: 14,
    height: 2,
    borderRadius: 1,
    marginTop: -0.5,
  },
  clapper: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginTop: 1,
  },
  slash: {
    position: 'absolute',
    width: 22,
    height: 1.6,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }],
  },
});
