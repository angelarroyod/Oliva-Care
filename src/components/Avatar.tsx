import { View, StyleSheet } from 'react-native';
import { colors } from '@/theme';
import { T } from './T';

// Initials circle (priSoft / pri). `rounded` < size/2 gives the square-ish tile.
export function Avatar({
  initials,
  size = 48,
  bg = colors.priSoft,
  color = colors.pri,
  rounded = 999,
}: {
  initials: string;
  size?: number;
  bg?: string;
  color?: string;
  rounded?: number;
}) {
  return (
    <View style={[s.center, { width: size, height: size, borderRadius: rounded, borderCurve: rounded < size / 2 ? 'continuous' : undefined, backgroundColor: bg }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <T size={Math.round(size * 0.33)} bold color={color} allowFontScaling={false}>
        {initials}
      </T>
    </View>
  );
}

// "Carmen Morales" → "CM"; "Elena" → "E".
export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

const s = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
