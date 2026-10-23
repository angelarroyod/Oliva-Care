import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { colors, radius } from '@/theme';
import { T } from './T';
import { useAnnounce } from './Controls';
import { Icon, type IconName } from './Icon';

// Status = icon + word + colour, never colour alone.
export type Tone = 'ok' | 'warn' | 'alert' | 'unrec' | 'skipped' | 'pending' | 'info';

export const TONES: Record<Tone, { bg: string; border?: string; dashed?: boolean; ink: string; icon: IconName }> = {
  ok: { bg: colors.priSoft, ink: colors.ok, icon: 'check' },
  warn: { bg: colors.warnSoft, border: colors.warn, ink: colors.warnInk, icon: 'warn' },
  alert: { bg: colors.dangerSoft, border: colors.danger, ink: colors.danger, icon: 'alert' },
  unrec: { bg: colors.surface, border: colors.field, dashed: true, ink: colors.ink2, icon: 'clock' },
  skipped: { bg: colors.warnSoft, border: colors.warn, ink: colors.warnInk, icon: 'ban' },
  pending: { bg: colors.surface, border: colors.pri, dashed: true, ink: colors.pri, icon: 'clock' },
  info: { bg: colors.priSoft, ink: colors.ink, icon: 'clipboard' },
};

// Small pill badge: icon + word.
export function Badge({ tone, label, style }: { tone: Tone; label: string; style?: StyleProp<ViewStyle> }) {
  const t = TONES[tone];
  return (
    <View
      style={[
        s.badge,
        { backgroundColor: tone === 'warn' || tone === 'alert' || tone === 'skipped' ? colors.surface : t.bg },
        t.border ? { borderWidth: 1.5, borderColor: t.border, borderStyle: t.dashed ? 'dashed' : 'solid' } : null,
        style,
      ]}
    >
      <Icon name={t.icon} size={15} color={t.ink} strokeWidth={2.6} />
      <T size={14} bold color={t.ink}>{label}</T>
    </View>
  );
}

// Box with an icon and text. info = priSoft, warn/alert = soft bg + 2px border,
// unrec = white + dashed field border, ok = white + line border.
export function Notice({
  tone = 'info',
  icon,
  lead,
  children,
  alert,
  style,
}: {
  tone?: Tone;
  icon?: IconName;
  lead?: string; // bold lead-in, e.g. "Importante:"
  children?: ReactNode;
  alert?: boolean; // announce (role=alert)
  style?: StyleProp<ViewStyle>;
}) {
  const t = TONES[tone];
  useAnnounce(alert && typeof children === 'string' ? (lead ? `${lead} ${children}` : children) : null);
  const box: ViewStyle =
    tone === 'ok'
      ? { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line }
      : tone === 'info'
        ? { backgroundColor: colors.priSoft }
        : { backgroundColor: t.bg, borderWidth: 2, borderColor: t.border, borderStyle: t.dashed ? 'dashed' : 'solid' };
  // With a lead the body stays ink and only the lead is coloured ("Lo que debes
  // saber"); without one, warn/alert boxes are bold coloured banners.
  const textInk = lead ? colors.ink : tone === 'warn' || tone === 'skipped' ? colors.warnInk : tone === 'alert' ? colors.danger : colors.ink;
  const iconInk = tone === 'info' ? colors.pri : t.ink;
  return (
    <View
      style={[s.notice, box, style]}
      // text-only alerts become one accessible element so the role is announced;
      // boxes with buttons inside (e.g. "Reintentar") keep their children focusable
      accessible={alert && (typeof children === 'string' || !!lead)}
      accessibilityRole={alert ? 'alert' : undefined}
      accessibilityLiveRegion={alert ? 'polite' : undefined}
    >
      <Icon name={icon ?? t.icon} size={22} color={iconInk} strokeWidth={2.2} />
      <View style={{ flex: 1, gap: 10 }}>
        {typeof children === 'string' || lead ? (
          <T size={16} lh={1.4} color={textInk} bold={tone === 'warn' || tone === 'alert' ? !lead : false}>
            {lead ? <T size={16} bold color={tone === 'ok' ? colors.ok : iconInk}>{lead} </T> : null}
            {children}
          </T>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

// 10px progress bar (role=progressbar).
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: value }}
      style={s.track}
    >
      <View style={[s.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const s = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10, alignSelf: 'flex-start' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: radius.card, borderCurve: 'continuous', paddingVertical: 14, paddingHorizontal: 16 },
  track: { height: 10, backgroundColor: colors.line, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.pri, borderRadius: radius.pill },
});
