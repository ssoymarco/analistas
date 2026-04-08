// Color tokens extracted from Figma Make export
// /Users/marcosanchez/Downloads/2026 Analistas APP/src/styles/theme.css
// and component files (bg-[#0f1117], bg-[#1a1d2e], bg-[#13151f])

export const colors = {
  // Backgrounds — navy/dark blue palette (from Figma)
  bg:              '#0f1117',  // main background
  surface:         '#13151f',  // headers, elevated sections
  surfaceElevated: '#1e2030',  // modals, popovers
  card:            '#1a1d2e',  // cards, rows

  // Borders
  border:      'rgba(255,255,255,0.08)',  // gray-800/60 equiv
  borderLight: 'rgba(255,255,255,0.05)',  // gray-800/40 equiv

  // Accent (blue — selected state, today, active)
  accent:    '#3b82f6',   // blue-500
  accentDim: 'rgba(59,130,246,0.15)',

  // Status
  live:    '#ef4444',   // red-500
  liveDim: 'rgba(239,68,68,0.12)',
  finished: '#6b7280',  // gray-500
  upcoming: '#60a5fa',  // blue-400

  // Text
  textPrimary:   '#ffffff',
  textSecondary: '#d1d5db',  // gray-300
  textTertiary:  '#6b7280',  // gray-500
  textAccent:    '#3b82f6',

  // Tab bar
  tabActive:   '#ffffff',
  tabInactive: '#6b7280',
  tabBg:       '#0f1117',

  // Top bar
  topBarBg:        '#0f1117',
  dateNavBg:       '#13151f',
  dateNavActive:   '#ffffff',
  dateNavInactive: '#6b7280',

  // Filter tabs
  tabFilterActiveBg:    '#ffffff',
  tabFilterActiveText:  '#0f1117',
  tabFilterInactiveText:'#6b7280',

  // League header
  leagueHeaderBg: '#13151f',

  // Emerald — "Hoy" / streak / special
  emerald:    '#10b981',   // emerald-500
  emeraldDim: 'rgba(16,185,129,0.12)',
};
