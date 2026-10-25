import { useEffect, useState } from 'react';
import { View, Pressable, TextInput, StyleSheet, AccessibilityInfo, type StyleProp, type ViewStyle, type TextInputProps } from 'react-native';
import type { ReactNode } from 'react';
import { colors, font, radius } from '@/theme';
import { useTextScale } from '@/features/settings/textScale';
import { T } from './T';
import { Icon, type IconName } from './Icon';

// iOS has no alert trait or live regions: announce written errors explicitly
// (Android announces them through accessibilityLiveRegion).
export function useAnnounce(text: string | null | undefined) {
  useEffect(() => {
    if (text && process.env.EXPO_OS === 'ios') AccessibilityInfo.announceForAccessibility(text);
  }, [text]);
}

// Written, announced error line (15 bold danger).
export function ErrorText({ children, style }: { children: string; style?: StyleProp<ViewStyle> }) {
  useAnnounce(children);
  return (
    <T size={15} bold color={colors.danger} accessibilityRole="alert" accessibilityLiveRegion="assertive" style={style}>
      {children}
    </T>
  );
}

// Choice chip. kind 'radio' (single choice, accessibilityRole radio) or
// 'toggle' (aria-pressed style). look 'soft' = priSoft + 2px pri when
// selected; 'fill' = pri fill + white text when selected.
export function Chip({
  label,
  selected,
  onPress,
  kind = 'radio',
  look = 'soft',
  icon,
  height = 48,
  disabled,
  accessibilityLabel,
  style,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  kind?: 'radio' | 'toggle';
  look?: 'soft' | 'fill';
  icon?: IconName;
  height?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const fill = look === 'fill' && selected;
  const ink = fill ? colors.onPri : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={kind === 'radio' ? 'radio' : 'button'}
      accessibilityState={kind === 'radio' ? { checked: selected, disabled: !!disabled } : { selected, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      style={[
        s.chip,
        { minHeight: height },
        selected
          ? { backgroundColor: fill ? colors.pri : colors.priSoft, borderWidth: 2, borderColor: colors.pri }
          : { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: disabled ? colors.line : colors.field },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={18} color={ink} strokeWidth={2.4} /> : null}
      <T size={15} bold color={disabled ? colors.ink2 : ink} center>
        {label}
      </T>
    </Pressable>
  );
}

// Big switch row ("Avisar a la familia"): track 56×32, thumb 26.
export function SwitchRow({ title, sub, value, onChange }: { title: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={title}
      accessibilityHint={sub}
      style={s.switchRow}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <T size={17} bold>{title}</T>
        {sub ? <T size={15} color={colors.ink2} lh={1.35}>{sub}</T> : null}
      </View>
      <View style={[s.track, { backgroundColor: value ? colors.pri : colors.field, justifyContent: value ? 'flex-end' : 'flex-start' }]}>
        <View style={s.thumb} />
      </View>
    </Pressable>
  );
}

// Checkbox row (consent, suggestion picks). 28px box.
export function CheckRow({
  checked,
  onPress,
  disabled,
  children,
  style,
  accessibilityLabel,
}: {
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const boxBg = disabled ? colors.field : checked ? colors.pri : colors.surface;
  const boxBorder = disabled || !checked ? colors.field : colors.pri;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      style={[s.checkRow, style]}
    >
      <View style={[s.box, { backgroundColor: boxBg, borderColor: boxBorder }]}>
        {checked ? <Icon name="check" size={18} color={colors.onPri} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </Pressable>
  );
}

// Labelled input with a written, announced error. Label is always visible.
export function Field({
  label,
  optional,
  error,
  hint,
  inputSize = 17,
  style,
  inputStyle,
  right,
  ...input
}: TextInputProps & {
  label: string;
  optional?: boolean | string; // true → "(opcional)"; string → custom suffix
  error?: string | null;
  hint?: string;
  inputSize?: number;
  style?: StyleProp<ViewStyle>;
  inputStyle?: TextInputProps['style'];
  right?: ReactNode; // e.g. "Mostrar" toggle next to the input
}) {
  const { pct } = useTextScale();
  const [focused, setFocused] = useState(false);
  const fs = (inputSize * pct) / 100;
  return (
    <View style={[{ gap: 8 }, style]}>
      <T size={16} bold>
        {label}
        {optional ? <T size={16} color={colors.ink2}>{` ${optional === true ? '(opcional)' : optional}`}</T> : null}
      </T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          placeholderTextColor={colors.ink2}
          {...input}
          onFocus={(e) => { setFocused(true); input.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); input.onBlur?.(e); }}
          style={[
            s.input,
            { fontSize: fs, borderColor: focused ? colors.focus : colors.field, borderWidth: focused ? 2.5 : 1.5 },
            input.multiline && { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
            inputStyle,
          ]}
        />
        {right}
      </View>
      {hint ? <T size={15} color={colors.ink2}>{hint}</T> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

const s = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, borderRadius: radius.pill },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, paddingVertical: 14, paddingHorizontal: 16,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.card, borderCurve: 'continuous',
  },
  track: { width: 56, height: 32, borderRadius: radius.pill, padding: 3, flexDirection: 'row', alignItems: 'center' },
  thumb: { width: 26, height: 26, borderRadius: radius.pill, backgroundColor: colors.white, boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)' },
  checkRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14, minHeight: 56, padding: 14,
    borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.input, borderCurve: 'continuous', backgroundColor: colors.surface,
  },
  box: { width: 28, height: 28, borderRadius: 8, borderCurve: 'continuous', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1, minWidth: 0, minHeight: 56, borderRadius: radius.input, borderCurve: 'continuous', paddingHorizontal: 16,
    backgroundColor: colors.surface, color: colors.ink, fontFamily: font.regular,
  },
});
