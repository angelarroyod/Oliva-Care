import { View, StyleSheet } from 'react-native';
import { colors, radius } from '@/theme';
import type { EventKind, EventStatus, TimelineEvent, ValueChip } from '@/features/care/timeline';
import { T } from './T';
import { Icon, type IconName } from './Icon';
import { Card, type CardTone } from './Card';
import { Badge, type Tone } from './Status';
import { useTextScale } from '@/features/settings/textScale';

// One history event (TimelineItem.dc.html): time column, kind dot on a
// vertical line, and a card coloured by status.
type Dot = { bg: string; ink: string; border: string };
const PLAIN_DOT: Dot = { bg: colors.surface, ink: colors.pri, border: colors.line };
const WARN_DOT: Dot = { bg: colors.warnSoft, ink: colors.warnInk, border: colors.warn };

const ST: Record<EventStatus, { card: CardTone; dot: Dot; badge?: Tone; word?: string }> = {
  given: { card: 'plain', badge: 'ok', word: 'Dada', dot: { bg: colors.pri, ink: colors.white, border: colors.pri } },
  skipped: { card: 'warn', badge: 'skipped', word: 'Omitida', dot: WARN_DOT },
  unrecorded: { card: 'unrec', badge: 'unrec', word: 'Sin registrar', dot: { bg: colors.surface, ink: colors.ink2, border: colors.field } },
  pending: { card: 'pending', badge: 'pending', word: 'Pendiente', dot: { bg: colors.surface, ink: colors.pri, border: colors.pri } },
  ok: { card: 'plain', badge: 'ok', word: 'Normal', dot: PLAIN_DOT },
  warn: { card: 'warn', badge: 'warn', word: 'Atención', dot: WARN_DOT },
  alert: { card: 'alert', badge: 'alert', word: 'Alerta', dot: { bg: colors.dangerSoft, ink: colors.danger, border: colors.danger } },
  info: { card: 'plain', dot: PLAIN_DOT },
};
// Handoffs carry no badge: priSoft card, filled pri dot.
const HANDOFF: (typeof ST)[EventStatus] = { card: 'soft', dot: { bg: colors.pri, ink: colors.white, border: colors.pri } };

const KIND_ICON: Record<EventKind, IconName> = { med: 'pill', vitals: 'pulse', note: 'message', handoff: 'clipboard' };

const VAL = {
  ok: { bg: colors.priSoft, border: colors.priSoft, width: 1.5, ink: colors.ink },
  warn: { bg: colors.surface, border: colors.warn, width: 2, ink: colors.warnInk, icon: 'warn' as const, word: 'Atención' },
  alert: { bg: colors.surface, border: colors.danger, width: 2, ink: colors.danger, icon: 'alert' as const, word: 'Alerta' },
};
const chipText = (v: ValueChip) => {
  const k = VAL[v.status];
  return 'word' in k ? `${v.label} ${v.value} · ${k.word}` : `${v.label} ${v.value}`;
};

export function TimelineItem({ event: e, last }: { event: TimelineEvent; last: boolean }) {
  const { pct } = useTextScale();
  const st = e.kind === 'handoff' ? HANDOFF : ST[e.status] ?? ST.info;
  const chips = e.values.map(chipText);
  // The whole item is one screen-reader stop; the label carries everything shown.
  const label = [e.time, e.title, st.word, ...chips, e.reason && `Motivo: ${e.reason}`, e.detail, e.who]
    .filter((x): x is string => !!x)
    .map((x) => (/[.!?]$/.test(x) ? x : `${x}.`))
    .join(' ');
  return (
    <View style={s.row} accessible accessibilityLabel={label}>
      <T size={16} bold numberOfLines={1} style={s.time}>{e.time}</T>
      <View style={s.rail}>
        <View style={[s.line, last ? { height: 20 } : { bottom: 0 }]} />
        <View style={[s.dot, { backgroundColor: st.dot.bg, borderColor: st.dot.border }]}>
          <Icon name={KIND_ICON[e.kind]} size={18} color={st.dot.ink} strokeWidth={2.2} />
        </View>
      </View>
      <View style={s.body}>
        <Card tone={st.card} gap={8} style={s.card}>
          <View style={s.head}>
            {/* The title keeps about six characters of width; past that (large text) the badge wraps below it. */}
            <T size={16} bold lh={1.3} style={{ flex: 1, minWidth: (96 * pct) / 100 }}>{e.title}</T>
            {st.badge && st.word ? (
              <Badge
                tone={st.badge}
                label={st.word}
                // Timeline "Pendiente" is a soft pill, not the dashed status box.
                style={[{ flexShrink: 0 }, e.status === 'pending' && { backgroundColor: colors.priSoft, borderWidth: 0 }]}
              />
            ) : null}
          </View>
          {e.values.length ? (
            <View style={s.chips}>
              {e.values.map((v, i) => {
                const k = VAL[v.status];
                return (
                  <View key={i} style={[s.chip, { backgroundColor: k.bg, borderColor: k.border, borderWidth: k.width }]}>
                    {'icon' in k ? <Icon name={k.icon} size={15} color={k.ink} strokeWidth={2.6} /> : null}
                    <T size={15} bold color={k.ink}>{chips[i]}</T>
                  </View>
                );
              })}
            </View>
          ) : null}
          {e.reason ? (
            <T size={16} lh={1.4}>
              <T size={16} bold lh={1.4}>Motivo:</T> {e.reason}
            </T>
          ) : null}
          {e.detail ? <T size={15} lh={1.4} color={colors.ink2}>{e.detail}</T> : null}
          {e.who ? (
            <View style={s.who}>
              <Icon name="user" size={15} color={colors.ink2} strokeWidth={2.2} />
              <T size={14} bold color={colors.ink2}>{e.who}</T>
            </View>
          ) : null}
        </Card>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  // At least 50 (the design) but grows with the text size, so HH:MM never breaks.
  time: { minWidth: 50, flexShrink: 0, paddingTop: 9, textAlign: 'right', fontVariant: ['tabular-nums'] },
  rail: { width: 40, alignItems: 'center' },
  line: { position: 'absolute', top: 0, left: 19, width: 2, backgroundColor: colors.line },
  dot: { marginTop: 2, width: 36, height: 36, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, paddingBottom: 12 },
  card: { paddingVertical: 12, paddingHorizontal: 14 },
  head: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, borderCurve: 'continuous', paddingVertical: 5, paddingHorizontal: 9 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
