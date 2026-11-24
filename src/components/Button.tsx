import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from '@/theme';
import { T } from './T';
import { Icon, type IconName } from './Icon';
import { PressScale } from './PressScale';

// Pill buttons. primary = filled pri; secondary = 2px pri outline; outline =
// 2px field outline, ink text ("No se dio"); neutral = 2px line outline
// ("Volver", "Cancelar"); danger / dangerOutline = destructive; onHero = white
// on the olive or fever hero, which keeps its colours in both appearances.
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'neutral' | 'danger' | 'dangerOutline' | 'onHero';

const V: Record<ButtonVariant, { bg: string; ink: string; border?: string }> = {
  primary: { bg: colors.pri, ink: colors.onPri },
  secondary: { bg: colors.surface, ink: colors.pri, border: colors.pri },
  outline: { bg: colors.surface, ink: colors.ink, border: colors.field },
  neutral: { bg: colors.surface, ink: colors.ink, border: colors.line },
  danger: { bg: colors.danger, ink: colors.onPri },
  dangerOutline: { bg: colors.surface, ink: colors.danger, border: colors.danger },
  onHero: { bg: colors.white, ink: colors.hero },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  iconRight,
  height = 56,
  size,
  disabled,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  iconRight?: IconName;
  height?: number; // min-height: 56 primary, 48–52 secondary / in-card
  size?: number; // label size; defaults to 17 at 56 px, 16 below
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const v = V[variant];
  const labelSize = size ?? (height >= 56 ? 17 : 16);
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        s.btn,
        { minHeight: height, backgroundColor: v.bg },
        v.border ? { borderWidth: 2, borderColor: v.border } : null,
        disabled && { opacity: 0.5 },
        style,
      ]}
    >
      <View style={s.row}>
        {icon ? <Icon name={icon} size={18} color={v.ink} strokeWidth={2.4} /> : null}
        <T size={labelSize} bold color={v.ink} center style={s.label}>
          {label}
        </T>
        {iconRight ? <Icon name={iconRight} size={18} color={v.ink} strokeWidth={2.4} /> : null}
      </View>
    </PressScale>
  );
}

// 48×48 chevron-left back button.
export function BackButton({ onPress, label = 'Volver' }: { onPress: () => void; label?: string }) {
  return (
    <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={s.back} hitSlop={4}>
      <Icon name="chevronLeft" size={20} color={colors.ink} strokeWidth={2.2} />
    </PressScale>
  );
}

const s = StyleSheet.create({
  btn: { borderRadius: radius.pill, paddingHorizontal: 20, paddingVertical: 10, justifyContent: 'center', alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { flexShrink: 1 },
  back: {
    width: 48, height: 48, borderRadius: radius.back, borderWidth: 1.5, borderColor: colors.line,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
});
