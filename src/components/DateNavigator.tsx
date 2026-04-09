import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useThemeColors } from '../theme/useTheme';
import { DateItem, matchCountForDate } from '../data/mockData';

interface DateNavigatorProps {
  dates: DateItem[];
  selectedIndex: number;
  onSelectDate: (index: number) => void;
  onCalendarPress?: () => void;
}

export const DateNavigator: React.FC<DateNavigatorProps> = ({
  dates,
  selectedIndex,
  onSelectDate,
  onCalendarPress,
}) => {
  const scrollRef = useRef<ScrollView>(null);
  const c = useThemeColors();

  const handleSelect = (index: number) => {
    onSelectDate(index);
    scrollRef.current?.scrollTo({ x: Math.max(0, (index - 2) * 100), animated: true });
  };

  return (
    <View style={[s.wrapper, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.container}
      >
        {dates.map((item, index) => {
          const isSelected = index === selectedIndex;
          const isToday = item.label === 'Hoy';
          return (
            <TouchableOpacity
              key={index}
              style={[s.dateItem, isSelected && [s.dateItemSelected, { borderBottomColor: c.emerald }]]}
              onPress={() => handleSelect(index)}
              activeOpacity={0.7}
            >
              <Text style={[s.dateLabel, { color: c.textTertiary }, isSelected && { color: c.textSecondary }]}>
                {item.dayName}{isToday ? '' : `, ${item.date.slice(8)}`}
              </Text>
              <Text style={[
                s.dayLabel,
                { color: c.textTertiary },
                isSelected && { color: c.textPrimary },
                isToday && !isSelected && { color: c.emerald },
              ]}>
                {item.label}
              </Text>
              {isSelected && (
                <Text style={[s.matchCount, { color: c.emerald }]}>{matchCountForDate(item.date)} partidos</Text>
              )}
              {isSelected && <View style={s.indicator} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

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

const s = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  container: {
    paddingHorizontal: 8,
    gap: 0,
    alignItems: 'flex-end',
  },
  dateItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 80,
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
  indicator: {
    width: 0,
    height: 0,
  },
  calBtn: {
    width: 44,
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
