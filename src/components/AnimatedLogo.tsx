import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '@/theme';
import { DISC, LEAF, Wordmark } from './Logo';

// Welcome logo: the O grows in with a small overshoot, the leaf unfolds into its
// counter, then the "oliva" wordmark rises. Plays once (≈2.1 s), static with
// reduce motion, tap to replay. Disc and leaf sit in two stacked SVG layers so
// the growth and the unfold are plain View transforms.
const SIZE = 136; // viewBox 0 0 256 256

const settleEase = Easing.bezier(0.2, 0.8, 0.2, 1);
const inOut = Easing.bezier(0.42, 0, 0.58, 1);

const timing = (v: Animated.Value, toValue: number, duration: number, easing: (t: number) => number, delay = 0) =>
  Animated.timing(v, { toValue, duration, easing, delay, useNativeDriver: false });

export function AnimatedLogo() {
  const grow = useRef(new Animated.Value(0)).current;
  const leaf = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const [still, setStill] = useState(false);

  const settle = useCallback(() => {
    grow.setValue(1);
    leaf.setValue(1);
    rise.setValue(1);
  }, [grow, leaf, rise]);

  const play = useCallback(() => {
    anim.current?.stop();
    grow.setValue(0);
    leaf.setValue(0);
    rise.setValue(0);
    anim.current = Animated.parallel([
      // 0 → 1.06 → 1 over .7 s from .1 s.
      Animated.sequence([Animated.delay(100), timing(grow, 1.06, 450, settleEase), timing(grow, 1, 250, inOut)]),
      timing(leaf, 1, 700, settleEase, 650),
      timing(rise, 1, 700, settleEase, 1400),
    ]);
    anim.current.start();
  }, [grow, leaf, rise]);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (!live) return;
        setStill(reduce);
        if (reduce) settle();
        else play();
      })
      .catch(() => live && settle());
    return () => {
      live = false;
      anim.current?.stop();
    };
  }, [play, settle]);

  return (
    <View style={s.wrap}>
      <Pressable
        onPress={still ? undefined : play}
        accessibilityRole="button"
        accessibilityLabel="Logotipo de Oliva: una O con una hoja de olivo en el centro. Toca para repetir la animación."
        style={s.logo}
        hitSlop={4}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: grow }] }]}>
          <Svg width={SIZE} height={SIZE} viewBox="0 0 256 256">
            <Path d={DISC + LEAF} fillRule="evenodd" fill={colors.logoInk} />
          </Svg>
        </Animated.View>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: leaf,
              transform: [
                { scale: leaf },
                { rotate: leaf.interpolate({ inputRange: [0, 1], outputRange: ['-45deg', '0deg'] }) },
              ],
            },
          ]}
        >
          <Svg width={SIZE} height={SIZE} viewBox="0 0 256 256">
            <Path d={LEAF} fill={colors.logoAccent} />
          </Svg>
        </Animated.View>
      </Pressable>
      <Animated.View
        accessible
        accessibilityRole="header"
        accessibilityLabel="Oliva"
        style={{ opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}
      >
        <Wordmark height={64} />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 14 },
  logo: { width: SIZE, height: SIZE, margin: 4, borderRadius: SIZE / 2 },
});
