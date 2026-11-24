import { useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cubicBezier, useReducedMotion } from 'react-native-reanimated';

const APressable = Animated.createAnimatedComponent(Pressable);

// Press feedback: shrinks to 0.97 on press-in (120 ms, strong ease-out), back
// on press-out; the press commits on release as usual. A CSS transition, so
// it runs on the UI thread and React renders only on press-in and press-out.
// Reduce Motion swaps the scale for a dim. Replaces `opacity: 0.85` when pressed.
const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
const base = { transform: [{ scale: 1 }], transitionProperty: ['transform', 'opacity'], transitionDuration: 120, transitionTimingFunction: EASE_OUT } as const;
const down = { transform: [{ scale: 0.97 }] } as const;
const dim = { opacity: 0.85 } as const;

export function PressScale({
  style,
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> }) {
  const [pressed, setPressed] = useState(false);
  const reduced = useReducedMotion();
  return (
    <APressable
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={[base, style, pressed && (reduced ? dim : down)]}
    />
  );
}
