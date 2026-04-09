// Color tokens extracted from Figma Make export
// Supports both Dark and Light modes

export interface ColorPalette {
  bg: string;
  surface: string;
  surfaceElevated: string;
  card: string;
  border: string;
  borderLight: string;
  accent: string;
  accentDim: string;
  live: string;
  liveDim: string;
  finished: string;
  upcoming: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textAccent: string;
  tabActive: string;
  tabInactive: string;
  tabBg: string;
  topBarBg: string;
  dateNavBg: string;
  dateNavActive: string;
  dateNavInactive: string;
  tabFilterActiveBg: string;
  tabFilterActiveText: string;
  tabFilterInactiveText: string;
  leagueHeaderBg: string;
  emerald: string;
  emeraldDim: string;
}

export const darkColors: ColorPalette = {
  bg:              '#0f1117',
  surface:         '#13151f',
  surfaceElevated: '#1e2030',
  card:            '#1a1d2e',
  border:      'rgba(255,255,255,0.08)',
  borderLight: 'rgba(255,255,255,0.05)',
  accent:    '#3b82f6',
  accentDim: 'rgba(59,130,246,0.15)',
  live:    '#ef4444',
  liveDim: 'rgba(239,68,68,0.12)',
  finished: '#6b7280',
  upcoming: '#60a5fa',
  textPrimary:   '#ffffff',
  textSecondary: '#d1d5db',
  textTertiary:  '#6b7280',
  textAccent:    '#3b82f6',
  tabActive:   '#ffffff',
  tabInactive: '#6b7280',
  tabBg:       '#0f1117',
  topBarBg:        '#0f1117',
  dateNavBg:       '#13151f',
  dateNavActive:   '#ffffff',
  dateNavInactive: '#6b7280',
  tabFilterActiveBg:    '#ffffff',
  tabFilterActiveText:  '#0f1117',
  tabFilterInactiveText:'#6b7280',
  leagueHeaderBg: '#13151f',
  emerald:    '#10b981',
  emeraldDim: 'rgba(16,185,129,0.12)',
};

export const lightColors: ColorPalette = {
  bg:              '#f8fafc',
  surface:         '#f1f5f9',
  surfaceElevated: '#ffffff',
  card:            '#ffffff',
  border:      'rgba(0,0,0,0.07)',
  borderLight: 'rgba(0,0,0,0.04)',
  accent:    '#3b82f6',
  accentDim: 'rgba(59,130,246,0.08)',
  live:    '#ef4444',
  liveDim: 'rgba(239,68,68,0.06)',
  finished: '#6b7280',
  upcoming: '#3b82f6',
  textPrimary:   '#111827',
  textSecondary: '#6b7280',
  textTertiary:  '#9ca3af',
  textAccent:    '#3b82f6',
  tabActive:   '#3b82f6',
  tabInactive: '#9ca3af',
  tabBg:       '#ffffff',
  topBarBg:        '#ffffff',
  dateNavBg:       '#f8fafc',
  dateNavActive:   '#111827',
  dateNavInactive: '#9ca3af',
  tabFilterActiveBg:    '#3b82f6',
  tabFilterActiveText:  '#ffffff',
  tabFilterInactiveText:'#6b7280',
  leagueHeaderBg: '#f1f5f9',
  emerald:    '#10b981',
  emeraldDim: 'rgba(16,185,129,0.06)',
};

export function getColors(isDark: boolean): ColorPalette {
  return isDark ? darkColors : lightColors;
}

// Default export (dark) for backward compatibility during migration
export const colors = darkColors;
