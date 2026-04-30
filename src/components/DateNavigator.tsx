import React, { useRef, useCallback, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useThemeColors } from '../theme/useTheme';
import { haptics } from '../utils/haptics';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CAL_BTN_WIDTH = 44;
const SCROLL_WIDTH  = SCREEN_WIDTH - CAL_BTN_WIDTH;
const ITEM_WIDTH    = 100;
// How many "extra" days to generate in each direction for virtual infinite scroll
const BUFFER_DAYS   = 120;
const CENTER_INDEX  = BUFFER_DAYS; // "today" sits at this index

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
  const daysShort = i18n.t('dates.daysShort', { returnObjects: true }) as string[];
  const monthsShort = i18n.t('dates.monthsShort', { returnObjects: true }) as string[];
  const dayName = daysShort[d.getDay()];
  let label: string;
  if (offset === 0) label = i18n.t('dates.today');
  else if (offset === -1) label = i18n.t('dates.yesterday');
  else if (offset === 1) label = i18n.t('dates.tomorrow');
  else label = `${d.getDate()} ${monthsShort[d.getMonth()]}`;
  return { label, dayName, date: isoDate(d), offset };
}

/** Build all date items — called inside the component so it reacts to language changes */
function buildAllDates(): DateItem[] {
  const items: DateItem[] = [];
  for (let i = -BUFFER_DAYS; i <= BUFFER_DAYS; i++) {
    items.push(buildDateItem(i));
  }
  return items;
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
  const { t, i18n: i18nInstance } = useTranslation();
  const hasScrolledInitial = useRef(false);

  // Rebuild date items when language changes
  const ALL_DATES = useMemo(() => buildAllDates(), [i18nInstance.language]);

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
    haptics.selection();
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
            {t('dates.matchCount', { count })}
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

export function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const daysFull = i18n.t('dates.daysFull', { returnObjects: true }) as string[];
  const monthsFull = i18n.t('dates.monthsFull', { returnObjects: true }) as string[];
  const of = i18n.t('dates.of');
  const dayName = daysFull[d.getDay()];
  const dayNum  = d.getDate();
  const month   = monthsFull[d.getMonth()];
  const year    = d.getFullYear();
  return `${dayName}, ${dayNum} ${of} ${month} ${of} ${year}`;
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
