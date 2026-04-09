import { useMemo } from 'react';
import { useDarkMode } from '../contexts/DarkModeContext';
import { getColors, type ColorPalette } from './colors';

/**
 * Returns the active color palette (dark or light) based on user preference.
 * Use this hook in every component that needs theme-aware colors.
 */
export function useThemeColors(): ColorPalette {
  const { isDark } = useDarkMode();
  return useMemo(() => getColors(isDark), [isDark]);
}
