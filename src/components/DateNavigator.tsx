import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { colors } from '../theme/colors';
import { DateItem } from '../data/mockData';

interface DateNavigatorProps {
  dates: DateItem[];
  selectedIndex: number;
  onSelectDate: (index: number) => void;
}

export const DateNavigator: React.FC<DateNavigatorProps> = ({
  dates,
  selectedIndex,
  onSelectDate,
}) => {
  const scrollRef = useRef<ScrollView>(null);

  const handleSelect = (index: number) => {
    onSelectDate(index);
    // Scroll to center the selected date
    scrollRef.current?.scrollTo({ x: (index - 2) * 60, animated: true });
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.container}
        initialScrollIndex={0}
      >
        {dates.map((item, index) => {
          const isSelected = index === selectedIndex;
          const isToday = item.label === 'Hoy';
          return (
            <TouchableOpacity
              key={index}
              style={[styles.dateItem, isSelected && styles.dateItemSelected]}
              onPress={() => handleSelect(index)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.dayName,
                  isSelected ? styles.textSelected : styles.textInactive,
                ]}
              >
                {item.dayName}
              </Text>
              <Text
                style={[
                  styles.dayNumber,
                  isSelected ? styles.textSelected : styles.textInactive,
                  isToday && !isSelected && styles.textToday,
                ]}
              >
                {item.label}
              </Text>
              {isSelected && <View style={styles.activeDot} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  container: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  dateItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    height: 56,
    borderRadius: 12,
    marginHorizontal: 3,
    gap: 2,
  },
  dateItemSelected: {
    backgroundColor: colors.surfaceElevated,
  },
  dayName: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  textSelected: {
    color: colors.textPrimary,
  },
  textInactive: {
    color: colors.textTertiary,
  },
  textToday: {
    color: colors.accent,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
    marginTop: 2,
  },
});
