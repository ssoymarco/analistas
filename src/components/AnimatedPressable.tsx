// ── AnimatedPressable ────────────────────────────────────────────────────────
// Premium press feedback component with spring-based scale animation.
// Wraps content in a scale-down spring that fires on press, similar to
// Apple's App Store card behavior. Inner touchables remain functional.
//
// Usage:
//   <AnimatedPressable onPress={handlePress} style={styles.card}>
//     <Text>Content</Text>
//   </AnimatedPressable>

import React, { useRef, useCallback } from 'react';
import {
  Animated,
  TouchableOpacity,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { haptics } from '../utils/haptics';

interface AnimatedPressableProps {
  /** Called when the user taps the component */
  onPress?: () => void;
  children: React.ReactNode;
  /** Style applied to the animated container */
  style?: StyleProp<ViewStyle>;
  /** Scale-down value on press (0–1). Default: 0.975 */
  scaleValue?: number;
  /** Disable press interaction */
  disabled?: boolean;
  /** Haptic feedback on press. Default: 'light'. Set to 'none' to disable. */
  haptic?: 'none' | 'selection' | 'light' | 'medium';
}

export const AnimatedPressable: React.FC<AnimatedPressableProps> = ({
  onPress,
  children,
  style,
  scaleValue = 0.975,
  disabled = false,
  haptic = 'light',
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: scaleValue,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scale, scaleValue]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  }, [scale]);

  const handlePress = useCallback(() => {
    if (haptic !== 'none') haptics[haptic]();
    onPress?.();
  }, [onPress, haptic]);

  return (
    <Animated.View style={[style, { transform: [{ scale }], overflow: 'hidden' }]}>
      <TouchableOpacity
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.97}
        disabled={disabled}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};
