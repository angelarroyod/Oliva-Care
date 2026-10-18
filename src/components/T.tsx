import type { Ref } from 'react';
import { Text, type TextProps } from 'react-native';
import { colors, font } from '@/theme';
import { useTextScale } from '@/features/settings/textScale';

// The one text primitive. `size` is the px value at 100 % from the handoff
// type scale; it's multiplied by the in-app text size (100–200 %). Don't set
// fontSize/fontFamily in `style` — that bypasses the scale.
export type TProps = TextProps & {
  size?: number;
  bold?: boolean;
  brand?: boolean; // Bricolage Grotesque 800, "Tend" wordmark only
  color?: string;
  lh?: number; // line-height multiplier
  center?: boolean;
  ref?: Ref<Text>; // React 19 passes it through to Text (focus the h1)
};

export function T({ size = 16, bold, brand, color = colors.ink, lh = 1.4, center, style, ...rest }: TProps) {
  const { pct } = useTextScale();
  const fontSize = (size * pct) / 100;
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: brand ? font.brand : bold ? font.bold : font.regular,
          fontSize,
          lineHeight: Math.round(fontSize * lh),
          color,
        },
        brand && { letterSpacing: -0.02 * fontSize },
        center && { textAlign: 'center' },
        style,
      ]}
    />
  );
}

// Screen title (h1). Screen readers land on it as a header.
export function H1({ size = 32, ...rest }: TProps) {
  return <T size={size} bold lh={1.1} accessibilityRole="header" {...rest} />;
}

// Section title (h2).
export function H2({ size = 18, ...rest }: TProps) {
  return <T size={size} bold lh={1.25} accessibilityRole="header" {...rest} />;
}
