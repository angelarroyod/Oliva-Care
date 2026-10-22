import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/theme';

// Oliva mark "La O": an olive disc whose counter is a leaf. viewBox 0 0 256 256.
// Masters, colours and usage rules: design/logo/oliva/kit (build_kit.py, GUIDE.md).
export const DISC = 'M128 32A96 96 0 1 1 127.99 32Z';
export const LEAF = 'M78 178A100 100 0 0 1 178 78A100 100 0 0 1 78 178Z';
// Small cut (≤ 32 px): shorter, fatter leaf so the ring at its tips stays open.
const LEAF_SMALL = 'M84 172A72 72 0 0 1 172 84A72 72 0 0 1 84 172Z';

export function LogoMark({ size = 32 }: { size?: number }) {
  const leaf = size <= 32 ? LEAF_SMALL : LEAF;
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256">
      <Path d={DISC + leaf} fillRule="evenodd" fill={colors.logoInk} />
      <Path d={leaf} fill={colors.logoAccent} />
    </Svg>
  );
}

// "oliva" wordmark, drawn (not a font): round monoline strokes on a 112-unit x-height.
const WORD_W = 471;
const WORD_H = 184;

export function Wordmark({ height, color = colors.logoInk }: { height: number; color?: string }) {
  const st = { fill: 'none', stroke: color, strokeWidth: 26, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <Svg width={(height * WORD_W) / WORD_H} height={height} viewBox={`-8 24 ${WORD_W} ${WORD_H}`}>
      <Circle cx={56} cy={144} r={43} {...st} />
      <Path d="M146 45V187M194 101V187M236 101L278 187L320 101M442 101V187" {...st} />
      <Circle cx={194} cy={55} r={16} fill={color} />
      <Circle cx={399} cy={144} r={43} {...st} />
    </Svg>
  );
}

// Header brand: mark + wordmark, read as one header (`accessible` hides the SVGs).
export function BrandHeader() {
  return (
    <View style={s.brand} accessible accessibilityRole="header" accessibilityLabel="Oliva">
      <LogoMark size={32} />
      <Wordmark height={26} />
    </View>
  );
}

const s = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
