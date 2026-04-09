import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
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

  const handleSelect = (index: number) => {
    onSelectDate(index);
    scrollRef.current?.scrollTo({ x: Math.max(0, (index - 2) * 100), animated: true });
  };

  return (
    <View style={s.wrapper}>
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
              style={[s.dateItem, isSelected && s.dateItemSelected]}
              onPress={() => handleSelect(index)}
              activeOpacity={0.7}
            >
              <Text style={[s.dateLabel, isSelected && s.dateLabelSelected]}>
                {item.dayName}{isToday ? '' : `, ${item.date.slice(8)}`}
              </Text>
              <Text style={[
                s.dayLabel,
                isSelected && s.dayLabelSelected,
                isToday && !isSelected && s.dayLabelToday,
              ]}>
                {item.label}
              </Text>
              {isSelected && (
                <Text style={s.matchCount}>{matchCountForDate(item.date)} partidos</Text>
              )}
              {isSelected && <View style={s.indicator} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Calendar icon */}
      <TouchableOpacity style={s.calBtn} activeOpacity={0.7} onPress={onCalendarPress}>
        <View style={s.calIcon}>
          <View style={s.calTop} />
          <View style={s.calBody} />
        </View>
      </TouchableOpacity>
    </View>
  );
};

const s = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    borderBottomColor: colors.emerald,
  },
  dateLabel: {
    fontSize: 10,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  dateLabelSelected: {
    color: colors.textSecondary,
  },
  dayLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textTertiary,
    marginTop: 1,
  },
  dayLabelSelected: {
    color: colors.textPrimary,
  },
  dayLabelToday: {
    color: colors.emerald,
  },
  matchCount: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.emerald,
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
    borderLeftColor: colors.border,
  },
  calIcon: { width: 18, height: 18, alignItems: 'center' },
  calTop: {
    width: 14,
    height: 4,
    borderRadius: 1,
    backgroundColor: colors.textTertiary,
  },
  calBody: {
    width: 14,
    height: 10,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: colors.textTertiary,
    marginTop: 1,
  },
});
