// ── Shared navigation icons ───────────────────────────────────────────────────
// Used across all detail screens (Match, Team, League, Player, News, Search).
// Drawn entirely with React Native View primitives — no icon libraries.
import React from 'react';
import { View } from 'react-native';

// ── Back chevron ‹ ────────────────────────────────────────────────────────────
// Single-piece border-based chevron: always crisp, no floating lines.
export const BackArrow = ({ color }: { color: string }) => (
  <View style={{ width: 10, height: 18, justifyContent: 'center' }}>
    <View style={{
      width: 10, height: 10,
      borderLeftWidth: 2.5, borderBottomWidth: 2.5,
      borderColor: color,
      transform: [{ rotate: '45deg' }],
      marginLeft: 2,
    }} />
  </View>
);

// ── Share icon (iOS upload-from-tray style) ───────────────────────────────────
// Geometry (at default size=18):
//   Arrow:  tip at (9,0) · shaft y=0→11 · wings (4,5)→(9,0)→(14,5)
//   Tray:   open-top box  x=2–16, y=11–18
export const ShareIcon = ({ color, size = 18 }: { color: string; size?: number }) => {
  const s = size;
  const sw = 2;
  return (
    <View style={{ width: s, height: s }}>
      {/* Shaft */}
      <View style={{ position: 'absolute', left: (s - sw) / 2, top: 0, width: sw, height: s * 0.61, backgroundColor: color, borderRadius: 1 }} />
      {/* Arrowhead — left arm */}
      <View style={{ position: 'absolute', left: s * 0.167, top: s * 0.083, width: s * 0.389, height: sw, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '-45deg' }] }} />
      {/* Arrowhead — right arm */}
      <View style={{ position: 'absolute', left: s * 0.444, top: s * 0.083, width: s * 0.389, height: sw, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '45deg' }] }} />
      {/* Tray — left side */}
      <View style={{ position: 'absolute', left: s * 0.11, bottom: 0, width: sw, height: s * 0.39, backgroundColor: color, borderRadius: 1 }} />
      {/* Tray — bottom */}
      <View style={{ position: 'absolute', left: s * 0.11, bottom: 0, right: s * 0.11, height: sw, backgroundColor: color, borderRadius: 1 }} />
      {/* Tray — right side */}
      <View style={{ position: 'absolute', right: s * 0.11, bottom: 0, width: sw, height: s * 0.39, backgroundColor: color, borderRadius: 1 }} />
    </View>
  );
};
