// ── GoalPicker ───────────────────────────────────────────────────────────────
// Horizontal scroll-snap number picker for predicting exact goals (0–6+).
// Each number sits in a circle; the centered one scales up with accent color.
// After confirming a selection, the picker locks and shows result distribution.

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Animated, Easing, type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { useThemeColors } from '../theme/useTheme';
import { haptics } from '../utils/haptics';

export const GOAL_OPTIONS = ['0', '1', '2', '3', '4', '5', '6+'];
const CELL_W = 52;
const CELL_GAP = 8;
const SNAP_INTERVAL = CELL_W + CELL_GAP;

interface GoalPickerProps {
  /** Already-voted value (locks the picker) */
  selected: string | undefined;
  /** Called when user confirms a selection */
  onSelect: (value: string) => void;
  /** Community vote counts per option */
  counts: Record<string, number>;
  /** Width of the parent card (for centering math) */
  cardWidth: number;
}

export const GoalPicker: React.FC<GoalPickerProps> = ({
  selected,
  onSelect,
  counts,
  cardWidth,
}) => {
  const c = useThemeColors();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(2); // start at "2"
  const confirmScale = useRef(new Animated.Value(0)).current;
  const locked = selected != null;

  // Center padding so first/last items can center in the view
  const innerWidth = cardWidth - 32; // subtract card padding
  const sidePad = (innerWidth - CELL_W) / 2;

  // ── Scroll snap detection ─────────────────────────────────────────────────
  const handleMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const idx = Math.round(offsetX / SNAP_INTERVAL);
    const clamped = Math.max(0, Math.min(idx, GOAL_OPTIONS.length - 1));
    if (clamped !== activeIndex) {
      haptics.selection();
      setActiveIndex(clamped);
    }
  }, [activeIndex]);

  // Show confirm button with bounce animation when active changes
  useEffect(() => {
    if (locked) return;
    confirmScale.setValue(0);
    Animated.spring(confirmScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 18,
      bounciness: 8,
      delay: 100,
    }).start();
  }, [activeIndex, locked]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Confirm vote ──────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    haptics.medium();
    onSelect(GOAL_OPTIONS[activeIndex]);
  }, [activeIndex, onSelect]);

  // ── Post-vote: result distribution ────────────────────────────────────────
  const totalVotes = Object.values(counts).reduce((a, b) => a + b, 0);
  const pct = (v: string) => totalVotes > 0 ? Math.round(((counts[v] || 0) / totalVotes) * 100) : 0;

  // Scroll to initial position on mount
  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ x: 2 * SNAP_INTERVAL, animated: false });
    }, 50);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={gs.wrapper}>
      {/* Scroll picker */}
      <View style={gs.pickerWrap}>
        {/* Selection indicator line */}
        {!locked && (
          <View style={[gs.indicator, { backgroundColor: c.accent + '20', left: sidePad - 4, width: CELL_W + 8 }]} />
        )}

        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={SNAP_INTERVAL}
          decelerationRate="fast"
          scrollEnabled={!locked}
          onMomentumScrollEnd={handleMomentumEnd}
          contentContainerStyle={{ paddingHorizontal: sidePad }}
        >
          {GOAL_OPTIONS.map((item, index) => {
            const isCenter = locked ? item === selected : index === activeIndex;
            const isSelectedResult = locked && item === selected;
            return (
              <View key={item} style={[gs.cell, { width: CELL_W, marginRight: CELL_GAP }]}>
                <View style={[
                  gs.circle,
                  { borderColor: isCenter ? c.accent : c.border },
                  isCenter && { backgroundColor: c.accent + '15', transform: [{ scale: 1.15 }] },
                  isSelectedResult && { backgroundColor: c.accent + '25', borderWidth: 2 },
                ]}>
                  <Text style={[
                    gs.number,
                    { color: isCenter ? c.accent : c.textTertiary },
                    isCenter && { fontWeight: '900', fontSize: 22 },
                  ]}>
                    {item}
                  </Text>
                </View>
                {locked && (
                  <Text style={[gs.cellPct, { color: isSelectedResult ? c.accent : c.textTertiary }]}>
                    {pct(item)}%
                  </Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Confirm button (pre-vote) */}
      {!locked && (
        <Animated.View style={{ transform: [{ scale: confirmScale }], alignItems: 'center' }}>
          <TouchableOpacity
            style={[gs.confirmBtn, { backgroundColor: c.accent }]}
            onPress={handleConfirm}
            activeOpacity={0.85}
          >
            <Text style={gs.confirmText}>Confirmar ✓</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Vote count (post-vote) */}
      {locked && totalVotes > 0 && (
        <Text style={[gs.totalVotes, { color: c.textTertiary }]}>
          {totalVotes} {totalVotes === 1 ? 'voto' : 'votos'}
        </Text>
      )}
    </View>
  );
};

const gs = StyleSheet.create({
  wrapper: { gap: 8 },
  pickerWrap: { position: 'relative' },
  indicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 14,
    zIndex: 0,
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  circle: {
    width: CELL_W - 4,
    height: CELL_W - 4,
    borderRadius: (CELL_W - 4) / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: {
    fontSize: 18,
    fontWeight: '700',
  },
  cellPct: {
    fontSize: 10,
    fontWeight: '700',
  },
  confirmBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 16,
  },
  confirmText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  totalVotes: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});
