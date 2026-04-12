import React, { useRef, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Dimensions } from 'react-native';
import { useThemeColors } from '../theme/useTheme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CAL_BTN_WIDTH = 44;
const SCROLL_WIDTH  = SCREEN_WIDTH - CAL_BTN_WIDTH;
const ITEM_WIDTH    = 100;
// How many "extra" days to generate in each direction for virtual infinite scroll
const BUFFER_DAYS   = 120;
const CENTER_INDEX  = BUFFER_DAYS; // "today" sits at this index

const DAY_NAMES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateFromOffset(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

export interface DateItem {
  label: string;   // 'Hoy', 'Ayer', 'Mañana' or "3 mar"
  dayName: string; // 'Lun', 'Mar', etc.
  date: string;    // ISO 'YYYY-MM-DD'
  offset: number;  // days from today (0 = today, -1 = ayer, 1 = mañana)
}

function buildDateItem(offset: number): DateItem {
  const d = dateFromOffset(offset);
  const dayName = DAY_NAMES_SHORT[d.getDay()];
  let label: string;
  if (offset === 0) label = 'Hoy';
  else if (offset === -1) label = 'Ayer';
  else if (offset === 1) label = 'Mañana';
  else label = `${d.getDate()} ${MONTH_NAMES_SHORT[d.getMonth()]}`;
  return { label, dayName, date: isoDate(d), offset };
}

// Pre-generate all date items
const ALL_DATES: DateItem[] = [];
for (let i = -BUFFER_DAYS; i <= BUFFER_DAYS; i++) {
  ALL_DATES.push(buildDateItem(i));
}

interface DateNavigatorProps {
  /** Currently selected date as ISO string */
  selectedDate: string;
  /** Called when user picks a new date */
  onSelectDate: (date: string) => void;
  /** Open calendar modal */
  onCalendarPress?: () => void;
  /** Match counts keyed by ISO date string */
  matchCounts?: Record<string, number>;
}

export const DateNavigator: React.FC<DateNavigatorProps> = ({
  selectedDate,
  onSelectDate,
  onCalendarPress,
  matchCounts,
}) => {
  const flatRef = useRef<FlatList>(null);
  const c = useThemeColors();
  const hasScrolledInitial = useRef(false);

  // Find selected index
  const selectedIndex = ALL_DATES.findIndex(d => d.date === selectedDate);
  const safeIndex = selectedIndex >= 0 ? selectedIndex : CENTER_INDEX;

  // Scroll to center the selected date
  const scrollToIndex = useCallback((index: number, animated = true) => {
    flatRef.current?.scrollToIndex({
      index,
      animated,
      viewPosition: 0.5, // center in viewport
    });
  }, []);

  // Scroll to selected date on mount and when it changes
  useEffect(() => {
    if (!hasScrolledInitial.current) {
      // Delay initial scroll to let FlatList measure
      setTimeout(() => scrollToIndex(safeIndex, false), 50);
      hasScrolledInitial.current = true;
    } else {
      scrollToIndex(safeIndex, true);
    }
  }, [safeIndex, scrollToIndex]);

  const handleSelect = useCallback((item: DateItem) => {
    onSelectDate(item.date);
  }, [onSelectDate]);

  const renderItem = useCallback(({ item, index }: { item: DateItem; index: number }) => {
    const isSelected = index === safeIndex;
    const isToday = item.offset === 0;
    const count = matchCounts?.[item.date];

    return (
      <TouchableOpacity
        style={[s.dateItem, isSelected && [s.dateItemSelected, { borderBottomColor: c.emerald }]]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.7}
      >
        {/* Day name row — e.g. "Mié, 4 mar" or just "Hoy" for special labels */}
        {item.offset !== 0 && item.offset !== -1 && item.offset !== 1 && (
          <Text style={[s.dateLabel, { color: c.textTertiary }, isSelected && { color: c.textSecondary }]}>
            {item.dayName}
          </Text>
        )}

        {/* Main label */}
        <Text style={[
          s.dayLabel,
          { color: c.textTertiary },
          isSelected && { color: c.textPrimary },
          isToday && !isSelected && { color: c.emerald },
        ]}>
          {item.label}
        </Text>

        {/* Match count */}
        {count !== undefined && count > 0 && (
          <Text style={[s.matchCount, { color: isSelected ? c.emerald : c.textTertiary }]}>
            {count} partidos
          </Text>
        )}
      </TouchableOpacity>
    );
  }, [safeIndex, c, handleSelect, matchCounts]);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: ITEM_WIDTH,
    offset: ITEM_WIDTH * index,
    index,
  }), []);

  const keyExtractor = useCallback((item: DateItem) => item.date, []);

  return (
    <View style={[s.wrapper, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
      <FlatList
        ref={flatRef}
        data={ALL_DATES}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        getItemLayout={getItemLayout}
        initialScrollIndex={safeIndex}
        style={{ width: SCROLL_WIDTH }}
        windowSize={7}
        maxToRenderPerBatch={15}
        initialNumToRender={9}
      />

      {/* Calendar icon */}
      <TouchableOpacity style={[s.calBtn, { borderLeftColor: c.border }]} activeOpacity={0.7} onPress={onCalendarPress}>
        <View style={s.calIcon}>
          <View style={[s.calTop, { backgroundColor: c.textTertiary }]} />
          <View style={[s.calBody, { borderColor: c.textTertiary }]} />
        </View>
      </TouchableOpacity>
    </View>
  );
};

// ── Full date label helper (exported for PartidosScreen) ─────────────────────

const MONTH_NAMES_FULL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DAY_NAMES_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const dayName = DAY_NAMES_FULL[d.getDay()];
  const dayNum  = d.getDate();
  const month   = MONTH_NAMES_FULL[d.getMonth()];
  const year    = d.getFullYear();
  return `${dayName}, ${dayNum} De ${month} De ${year}`;
}

/** Check if a date string is "today" */
export function isToday(dateStr: string): boolean {
  return dateStr === isoDate(new Date());
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  dateItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: ITEM_WIDTH,
    paddingVertical: 8,
  },
  dateItemSelected: {
    borderBottomWidth: 2,
  },
  dateLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  dayLabel: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 1,
  },
  matchCount: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },
  calBtn: {
    width: CAL_BTN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
  },
  calIcon: { width: 18, height: 18, alignItems: 'center' },
  calTop: {
    width: 14,
    height: 4,
    borderRadius: 1,
  },
  calBody: {
    width: 14,
    height: 10,
    borderRadius: 2,
    borderWidth: 1.5,
    marginTop: 1,
  },
});
