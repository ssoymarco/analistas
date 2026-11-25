// ── ChevronRight — chevron "›" estilo iOS, compartido ────────────────────────
//
// Sustituye a las tres implementaciones caseras de dos barritas (LeagueDetail,
// GlobalSearch, LeagueSection) que se veían toscas — las barras no empataban
// en el vértice (feedback dueño 11-jul-2026). Aquí es UN solo cuadrado rotado
// 45° con borde superior+derecho: el vértice es geométricamente perfecto,
// como el disclosure indicator nativo de iOS.
//
// Convención del app: iconos con primitivas RN, sin librerías.

import React from 'react';
import { View } from 'react-native';

export const ChevronRight: React.FC<{
  color: string;
  size?: number;
  strokeWidth?: number;
}> = ({ color, size = 14, strokeWidth = 1.8 }) => {
  const box = size * 0.46;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: box,
          height: box,
          borderTopWidth: strokeWidth,
          borderRightWidth: strokeWidth,
          borderColor: color,
          borderTopRightRadius: strokeWidth * 0.9,
          transform: [{ rotate: '45deg' }],
          // El glifo rotado queda cargado a la derecha del cuadro; este
          // corrimiento lo centra ópticamente.
          marginLeft: -box * 0.35,
        }}
      />
    </View>
  );
};
