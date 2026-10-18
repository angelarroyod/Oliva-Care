import { View, StyleSheet } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { colors } from '@/theme';
import { T } from './T';

// Tend mark: two hands (nurse + family) holding a coral cross. viewBox 0 0 120 120, translated (0, −5).
export const HANDS_PATH = 'M20 56C20 84 38 102 60 102C82 102 100 84 100 56';

export function LogoMark({ size = 30, strokeWidth = 11 }: { size?: number; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <G transform="translate(0 -5)">
        <Path d={HANDS_PATH} fill="none" stroke={colors.logoInk} strokeWidth={strokeWidth} strokeLinecap="round" />
        <Rect x={52} y={28} width={16} height={44} rx={5} fill={colors.logoAccent} />
        <Rect x={38} y={42} width={44} height={16} rx={5} fill={colors.logoAccent} />
      </G>
    </Svg>
  );
}

// Header brand: 36px welcome-tinted tile + "Tend" wordmark (Bricolage 800).
export function BrandHeader() {
  return (
    <View style={s.brand} accessibilityRole="header" accessibilityLabel="Tend">
      <View style={s.tile}>
        <LogoMark size={30} />
      </View>
      <T size={20} brand lh={1.1}>Tend</T>
    </View>
  );
}

const s = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tile: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.welcome, alignItems: 'center', justifyContent: 'center' },
});
