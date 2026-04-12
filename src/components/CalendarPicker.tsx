import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useThemeColors } from '../theme/useTheme';
interface CalendarPickerProps {
  visible: boolean;
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (dateStr: string) => void;
  onClose: () => void;
  onGoToday: () => void;
  matchCounts?: Record<string, number>;
}

const DAY_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const CalendarPicker: React.FC<CalendarPickerProps> = ({
  visible,
  selectedDate,
  onSelectDate,
  onClose,
  onGoToday,
  matchCounts = {},
}) => {
  const c = useThemeColors();

  const selParts = selectedDate.split('-').map(Number);
  const [viewYear, setViewYear] = useState(selParts[0]);
  const [viewMonth, setViewMonth] = useState(selParts[1] - 1);

  useEffect(() => {
    const parts = selectedDate.split('-').map(Number);
    setViewYear(parts[0]);
    setViewMonth(parts[1] - 1);
  }, [selectedDate]);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isSelectedToday = selectedDate === todayStr;

  const monthName = new Date(viewYear, viewMonth, 1)
    .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  const firstDayRaw = new Date(viewYear, viewMonth, 1).getDay();
  const startOffset = (firstDayRaw + 6) % 7; // Monday = 0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const handleDayPress = (day: number) => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onSelectDate(dateStr);
  };

  // Build grid cells
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[s.container, { backgroundColor: c.card }]}>
          {/* Month navigation */}
          <View style={s.monthRow}>
            <TouchableOpacity onPress={prevMonth} style={s.navBtn}>
              <View style={s.chevronLeft}>
                <View style={[s.chevLine1, { backgroundColor: c.textSecondary }]} />
                <View style={[s.chevLine2, { backgroundColor: c.textSecondary }]} />
              </View>
            </TouchableOpacity>
            <Text style={[s.monthLabel, { color: c.textPrimary }]}>{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</Text>
            <TouchableOpacity onPress={nextMonth} style={s.navBtn}>
              <View style={s.chevronRight}>
                <View style={[s.chevLine1R, { backgroundColor: c.textSecondary }]} />
                <View style={[s.chevLine2R, { backgroundColor: c.textSecondary }]} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <View style={s.closeX}>
                <View style={[s.closeLine1, { backgroundColor: c.textSecondary }]} />
                <View style={[s.closeLine2, { backgroundColor: c.textSecondary }]} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Quick actions */}
          <View style={s.quickRow}>
            {!isSelectedToday && (
              <TouchableOpacity style={s.quickBtnHoy} onPress={onGoToday}>
                <Text style={[s.quickBtnHoyText, { color: c.emerald }]}>↩ Hoy</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Day headers */}
          <View style={s.dayHeaderRow}>
            {DAY_HEADERS.map(d => (
              <View key={d} style={s.dayHeaderCell}>
                <Text style={[s.dayHeaderText, { color: c.textTertiary }]}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Day grid */}
          <View style={s.grid}>
            {cells.map((day, idx) => {
              if (day === null) {
                return <View key={`e${idx}`} style={s.dayCell} />;
              }
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const mCount = matchCounts[dateStr] ?? 0;

              return (
                <TouchableOpacity
                  key={day}
                  style={[
                    s.dayCell,
                    s.dayCellBtn,
                    isSelected && s.dayCellSelected,
                    isToday && !isSelected && s.dayCellToday,
                  ]}
                  onPress={() => handleDayPress(day)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    s.dayText,
                    { color: c.textSecondary },
                    isSelected && s.dayTextSelected,
                    isToday && !isSelected && s.dayTextToday,
                  ]}>
                    {day}
                  </Text>
                  {mCount > 0 && (
                    <View style={s.dotRow}>
                      {(mCount <= 3 ? Array.from({ length: mCount }) : [1, 2, 3]).map((_, di) => (
                        <View
                          key={di}
                          style={[
                            s.matchDot,
                            isSelected ? s.matchDotSelected : (mCount >= 5 ? { backgroundColor: c.emerald } : s.matchDotNormal),
                          ]}
                        />
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-start',
    paddingTop: 120,
  },
  container: {
    marginHorizontal: 16,
    borderRadius: 16,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  navBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  monthLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    marginLeft: 8,
  },
  // Chevrons
  chevronLeft: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  chevLine1: {
    position: 'absolute', width: 6, height: 1.5,
    borderRadius: 1, transform: [{ rotate: '-45deg' }, { translateY: -2 }],
  },
  chevLine2: {
    position: 'absolute', width: 6, height: 1.5,
    borderRadius: 1, transform: [{ rotate: '45deg' }, { translateY: 2 }],
  },
  chevronRight: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  chevLine1R: {
    position: 'absolute', width: 6, height: 1.5,
    borderRadius: 1, transform: [{ rotate: '45deg' }, { translateY: -2 }],
  },
  chevLine2R: {
    position: 'absolute', width: 6, height: 1.5,
    borderRadius: 1, transform: [{ rotate: '-45deg' }, { translateY: 2 }],
  },
  // Close X
  closeX: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  closeLine1: {
    position: 'absolute', width: 14, height: 1.5,
    borderRadius: 1, transform: [{ rotate: '45deg' }],
  },
  closeLine2: {
    position: 'absolute', width: 14, height: 1.5,
    borderRadius: 1, transform: [{ rotate: '-45deg' }],
  },
  // Quick actions
  quickRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  quickBtnHoy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  quickBtnHoyText: {
    fontSize: 11,
    fontWeight: '600',
  },
  // Day headers
  dayHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  dayHeaderText: {
    fontSize: 10,
    fontWeight: '700',
  },
  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
  },
  dayCell: {
    width: '14.28%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  dayCellBtn: {
    height: 40,
    borderRadius: 20,
  },
  dayCellSelected: {
    backgroundColor: '#3b82f6',
  },
  dayCellToday: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.4)',
  },
  dayText: {
    fontSize: 12,
    fontWeight: '500',
  },
  dayTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  dayTextToday: {
    color: '#60a5fa',
    fontWeight: '700',
  },
  // Match dots
  dotRow: {
    flexDirection: 'row',
    gap: 1,
    position: 'absolute',
    bottom: 3,
  },
  matchDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  matchDotNormal: {
    backgroundColor: '#60a5fa',
  },
  matchDotSelected: {
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
});
