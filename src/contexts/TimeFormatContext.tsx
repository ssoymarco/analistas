/**
 * TimeFormatContext
 *
 * Provides a global "12h / 24h" preference that:
 *  1. Initialises from the device OS setting (via detectDeviceTimeFormat).
 *  2. Is persisted to AsyncStorage so user overrides survive restarts.
 *  3. Exposes `timeFormat` and `setTimeFormat` to every consumer.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { detectDeviceTimeFormat, type TimeFormat } from '../utils/formatMatchTime';

const STORAGE_KEY = 'analistas_time_format';

interface TimeFormatCtx {
  timeFormat: TimeFormat;
  setTimeFormat: (f: TimeFormat) => void;
}

const TimeFormatContext = createContext<TimeFormatCtx>({
  timeFormat: '24h',
  setTimeFormat: () => {},
});

export const TimeFormatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Start with the device default; load the stored override asynchronously.
  const [timeFormat, setFormatState] = useState<TimeFormat>(detectDeviceTimeFormat());

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(stored => {
        if (stored === '12h' || stored === '24h') {
          setFormatState(stored);
        }
        // If nothing stored, keep device default — no write needed.
      })
      .catch(() => {});
  }, []);

  const setTimeFormat = (f: TimeFormat) => {
    setFormatState(f);
    AsyncStorage.setItem(STORAGE_KEY, f).catch(() => {});
  };

  return (
    <TimeFormatContext.Provider value={{ timeFormat, setTimeFormat }}>
      {children}
    </TimeFormatContext.Provider>
  );
};

export const useTimeFormat = () => useContext(TimeFormatContext);
