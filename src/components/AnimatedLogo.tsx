import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { colors } from '@/theme';
import { T } from './T';

// Welcome logo: the hands draw in, the cross drops in with a small overshoot,
// the hands squeeze it, then the "Tend" letters rise. Plays once (≈2.5 s),
// static with reduce motion, tap to replay. Hands and cross sit in two stacked
// SVG layers so the squeeze and the drop are plain View transforms.
const SIZE = 136; // viewBox 0 0 120 120
const UNIT = SIZE / 120;
const AnimatedPath = Animated.createAnimatedComponent(Path);

// Each hand path is ≈68.1 units long. Dash 70 + gap 74, offset 72 → 0: fully
// hidden at the start (no round-cap dot at the origin), fully drawn at the end.
const DASH = [70, 74];
const HIDDEN = 72;
const LETTERS = ['T', 'e', 'n', 'd'];

const drawEase = Easing.bezier(0.65, 0, 0.35, 1);
const settleEase = Easing.bezier(0.2, 0.8, 0.2, 1);
const inOut = Easing.bezier(0.42, 0, 0.58, 1);

const timing = (v: Animated.Value, toValue: number, duration: number, easing: (t: number) => number, delay = 0) =>
  Animated.timing(v, { toValue, duration, easing, delay, useNativeDriver: false });

export function AnimatedLogo() {
  const dash = useRef(new Animated.Value(HIDDEN)).current;
  const squeeze = useRef(new Animated.Value(1)).current;
  const drop = useRef(new Animated.Value(-40 * UNIT)).current;
  const crossIn = useRef(new Animated.Value(0)).current;
  const rise = useRef(LETTERS.map(() => new Animated.Value(0))).current;
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const [still, setStill] = useState(false);

  const settle = useCallback(() => {
    dash.setValue(0);
    squeeze.setValue(1);
    drop.setValue(0);
    crossIn.setValue(1);
    rise.forEach((r) => r.setValue(1));
  }, [dash, squeeze, drop, crossIn, rise]);

  const play = useCallback(() => {
    anim.current?.stop();
    dash.setValue(HIDDEN);
    squeeze.setValue(1);
    drop.setValue(-40 * UNIT);
    crossIn.setValue(0);
    rise.forEach((r) => r.setValue(0));
    anim.current = Animated.parallel([
      timing(dash, 0, 1000, drawEase, 100),
      // tendSettle keyframes: -40 → +5 (55 %) → -2 (78 %) → 0, over .9 s from .8 s.
      Animated.sequence([
        Animated.delay(800),
        Animated.parallel([timing(drop, 5 * UNIT, 495, settleEase), timing(crossIn, 1, 495, settleEase)]),
        timing(drop, -2 * UNIT, 207, settleEase),
        timing(drop, 0, 198, settleEase),
      ]),
      Animated.sequence([
        Animated.delay(1450),
        timing(squeeze, 0.94, 250, inOut),
        timing(squeeze, 1, 250, inOut),
      ]),
      ...rise.map((r, i) => timing(r, 1, 700, settleEase, 1600 + i * 80)),
    ]);
    anim.current.start();
  }, [dash, squeeze, drop, crossIn, rise]);

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
        accessibilityLabel="Logotipo de Tend: dos manos que sostienen una cruz. Toca para repetir la animación."
        style={s.logo}
        hitSlop={4}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scaleX: squeeze }] }]}>
          <Svg width={SIZE} height={SIZE} viewBox="0 0 120 120">
            <G transform="translate(0 -5)">
              {['M60 102C38 102 20 84 20 56', 'M60 102C82 102 100 84 100 56'].map((d) => (
                <AnimatedPath
                  key={d}
                  d={d}
                  fill="none"
                  stroke={colors.logoInk}
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeDasharray={DASH}
                  strokeDashoffset={dash}
                />
              ))}
            </G>
          </Svg>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: crossIn, transform: [{ translateY: drop }] }]}>
          <Svg width={SIZE} height={SIZE} viewBox="0 0 120 120">
            <G transform="translate(0 -5)" fill={colors.logoAccent}>
              <Rect x={52} y={28} width={16} height={44} rx={5} />
              <Rect x={38} y={42} width={44} height={16} rx={5} />
            </G>
          </Svg>
        </Animated.View>
      </Pressable>
      <View accessible accessibilityRole="header" accessibilityLabel="Tend" style={s.word}>
        {LETTERS.map((c, i) => (
          <Animated.View
            key={c}
            style={{
              opacity: rise[i],
              transform: [{ translateY: rise[i].interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
            }}
          >
            <T size={58} brand lh={1} color={colors.ink}>
              {c}
            </T>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 14 },
  logo: { width: SIZE, height: SIZE, margin: 4, borderRadius: 24 },
  word: { flexDirection: 'row' },
});
