import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { colors, radius } from '@/theme';
import { T } from './T';
import { Icon, type IconName } from './Icon';
import { PressScale } from './PressScale';

// Card tones mirror the status table: plain (1.5 line), state cards (2px).
export type CardTone = 'plain' | 'pri' | 'warn' | 'alert' | 'unrec' | 'pending' | 'soft';

const TONE: Record<CardTone, ViewStyle> = {
  plain: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  pri: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.pri },
  warn: { backgroundColor: colors.warnSoft, borderWidth: 2, borderColor: colors.warn },
  alert: { backgroundColor: colors.dangerSoft, borderWidth: 2, borderColor: colors.danger },
  unrec: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.field, borderStyle: 'dashed' },
  pending: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.pri, borderStyle: 'dashed' },
  soft: { backgroundColor: colors.priSoft, borderWidth: 1.5, borderColor: colors.priSoft },
};

export function Card({
  children,
  tone = 'plain',
  gap = 10,
  style,
  accessibilityLabel,
}: {
  children: ReactNode;
  tone?: CardTone;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <View style={[s.card, TONE[tone], { gap }, style]} accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  );
}

// White row link: title 17/700, sub 15 ink2, chevron-right. Optional bell-style icon tile.
export function RowLink({
  title,
  sub,
  onPress,
  icon,
  accessibilityLabel,
}: {
  title: string;
  sub?: string;
  onPress: () => void;
  icon?: IconName;
  accessibilityLabel?: string;
}) {
  return (
    <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={s.row}>
      {icon ? (
        <View style={s.tile}>
          <Icon name={icon} size={20} color={colors.pri} />
        </View>
      ) : null}
      <View style={s.rowText}>
        <T size={17} bold>{title}</T>
        {sub ? <T size={15} color={colors.ink2} lh={1.35}>{sub}</T> : null}
      </View>
      <Icon name="chevronRight" size={20} color={colors.ink2} strokeWidth={2.4} />
    </PressScale>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: radius.card, padding: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 68, paddingVertical: 14, paddingHorizontal: 16,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.card,
  },
  rowText: { flex: 1, gap: 2 },
  tile: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.priSoft, alignItems: 'center', justifyContent: 'center' },
});
