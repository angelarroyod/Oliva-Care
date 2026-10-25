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
  color?: string;
  lh?: number; // line-height multiplier
  center?: boolean;
  ref?: Ref<Text>; // React 19 passes it through to Text (focus the h1)
};

// The in-app size multiplies the OS text size. Together they stop at iOS's
// largest accessibility size (~3.1×), so 200 % in the app × AX5 isn't 6×.
const MAX_TEXT_SCALE = 3.1;

export function T({ size = 16, bold, color = colors.ink, lh = 1.4, center, style, ...rest }: TProps) {
  const { pct } = useTextScale();
  const fontSize = (size * pct) / 100;
  return (
    <Text
      maxFontSizeMultiplier={(MAX_TEXT_SCALE * 100) / pct}
      {...rest}
      style={[
        {
          fontFamily: bold ? font.bold : font.regular,
          fontSize,
          lineHeight: Math.round(fontSize * lh),
          color,
        },
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
