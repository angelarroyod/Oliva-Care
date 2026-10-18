import { useState } from 'react';
import { AccessibilityInfo, Pressable, View, StyleSheet } from 'react-native';
import { colors, radius } from '@/theme';
import { reminderTime } from '@/features/care/shifts';
import { shortTime } from '@/features/care/clock';
import type { ReminderMode } from '@/features/care/types';
import { T } from './T';
import { Icon } from './Icon';
import { Chip } from './Controls';

const OPTS = [5, 10, 15, 30];
const STEP = 5;
const MIN = 5;
const MAX = 120;

// "05:45" / "05:45 y a las 19:45" / "06:00, 14:00 y a las 22:00"
const list = (a: string[]) => (a.length < 2 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} y a las ${a[a.length - 1]}`);

type Draft = { mode?: ReminderMode; min?: number | 'custom'; custom?: number };

// Exact time or N minutes before, with a live preview. Like the design
// component, the picker's own choices override the props only once touched,
// so props that arrive late (live data) still show. Every change is reported
// through onChange. Exact is stored as 0 minutes; switching to "antes" then offers 15.
export function ReminderPicker({
  times,
  mode,
  minutes,
  onChange,
}: {
  times: string[];
  mode: ReminderMode;
  minutes: number;
  onChange: (v: { mode: ReminderMode; minutes: number }) => void;
}) {
  const [st, setSt] = useState<Draft>({});
  const vals = (d: Draft) => {
    const pm = minutes > 0 ? minutes : 15;
    const preset = OPTS.includes(pm);
    const m = d.mode ?? mode;
    const min = d.min ?? (preset ? pm : 'custom');
    const custom = d.custom ?? (preset ? 45 : pm);
    return { mode: m, min, custom, mins: m === 'exact' ? 0 : min === 'custom' ? custom : min };
  };
  const set = (patch: Draft) => {
    const next = { ...st, ...patch };
    setSt(next);
    const v = vals(next);
    onChange({ mode: v.mode, minutes: v.mins });
  };
  // The design's aria-live: announced on both platforms (a live region is Android-only).
  const step = (n: number) => {
    set({ custom: n });
    AccessibilityInfo.announceForAccessibility(`${n} min antes`);
  };

  const v = vals(st);
  const doseTimes = times.map(shortTime);
  const at = list(doseTimes.map((t) => reminderTime(t, v.mode, v.mins)));
  // No valid times yet (new medication form): same sentences without the list.
  const preview = !doseTimes.length
    ? v.mode === 'exact'
      ? 'Sonará justo a la hora de cada dosis.'
      : `Sonará ${v.mins} min antes de cada dosis.`
    : v.mode === 'exact'
      ? `Sonará a las ${at}, justo a la hora de cada dosis.`
      : `Sonará a las ${at}, ${v.mins} min antes de cada dosis.`;

  const radio = (k: ReminderMode, title: string, sub: string) => {
    const sel = v.mode === k;
    return (
      <Pressable
        key={k}
        onPress={() => set({ mode: k })}
        accessibilityRole="radio"
        accessibilityState={{ checked: sel }}
        accessibilityLabel={`${title}. ${sub}`}
        style={[s.mode, sel ? { borderWidth: 2, borderColor: colors.pri, backgroundColor: colors.priSoft } : { borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface }]}
      >
        <View style={[s.ring, { borderColor: sel ? colors.pri : colors.field }]}>
          <View style={[s.dot, { backgroundColor: sel ? colors.pri : 'transparent' }]} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T size={17} bold>{title}</T>
          <T size={15} color={colors.ink2}>{sub}</T>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={s.root}>
      <T size={16} bold>Recordatorio</T>
      <View accessibilityRole="radiogroup" accessibilityLabel="Recordatorio" style={{ gap: 8 }}>
        {radio('exact', 'A la hora exacta', doseTimes.length ? `Suena a las ${list(doseTimes)}` : 'Suena a la hora de cada dosis')}
        {radio('before', 'Unos minutos antes', 'Tú eliges cuánto antes')}
      </View>
      {v.mode === 'before' ? (
        <>
          <View accessibilityLabel="Cuántos minutos antes" style={s.chips}>
            {OPTS.map((m) => (
              <Chip key={m} label={`${m} min`} kind="toggle" look="fill" selected={v.min === m} onPress={() => set({ min: m })} style={s.chip} />
            ))}
            <Chip label="Otro" kind="toggle" look="fill" selected={v.min === 'custom'} onPress={() => set({ min: 'custom' })} style={s.chip} />
          </View>
          {v.min === 'custom' ? (
            <View style={s.stepper}>
              <StepButton icon="minus" label="Cinco minutos menos" disabled={v.custom <= MIN} onPress={() => step(Math.max(MIN, v.custom - STEP))} />
              <T size={24} bold center style={{ flex: 1 }}>{`${v.custom} min antes`}</T>
              <StepButton icon="plus" label="Cinco minutos más" disabled={v.custom >= MAX} onPress={() => step(Math.min(MAX, v.custom + STEP))} />
            </View>
          ) : null}
        </>
      ) : null}
      <View style={s.preview}>
        <Icon name="bell" size={20} color={colors.pri} />
        <T size={16} lh={1.4} style={{ flex: 1 }}>{preview}</T>
      </View>
    </View>
  );
}

function StepButton({ icon, label, disabled, onPress }: { icon: 'minus' | 'plus'; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[s.step, disabled && { opacity: 0.4 }]}
    >
      <Icon name={icon} size={22} color={colors.ink} strokeWidth={2.4} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { gap: 10 },
  mode: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.input },
  ring: { width: 26, height: 26, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 12, height: 12, borderRadius: radius.pill },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minWidth: 64 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  step: {
    width: 56, height: 56, borderRadius: radius.back, borderWidth: 1.5, borderColor: colors.field,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  preview: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.input, backgroundColor: colors.priSoft },
});
