import { useEffect, useMemo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { colors, radius } from '@/theme';
import { Screen, PageHeader } from '@/components/Screen';
import { T } from '@/components/T';
import { Icon, type IconName } from '@/components/Icon';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Controls';
import { TimelineItem } from '@/components/TimelineItem';
import { useCare, useDoseRows, useEvents, useHandoffs, useReadings, useSchedules, useSince } from './hooks';
import { addDays, listY, localDate, longDate, startOfDay, WEEKDAYS, WEEKDAYS_SHORT } from './clock';
import { HISTORY_DAYS, dosesForDay } from './doses';
import { DAY_WORD, FILTERS, dayStatus, daySummary, eventsForDay, filterEvents, type DayStatus, type HistoryFilter } from './timeline';

// Historial tab (nurse and family): the last 7 days, one day at a time.
// Each day's status is a shape as well as a colour (the same icons as the
// family week strip); an empty day shows nothing.
const DAY_ICON: Record<DayStatus, { icon?: IconName; ink: string }> = {
  alert: { icon: 'alert', ink: colors.danger },
  warn: { icon: 'warn', ink: colors.warn },
  unrec: { icon: 'clock', ink: colors.field },
  ok: { icon: 'check', ink: colors.ok },
  empty: { ink: colors.line },
};
const TODAY = HISTORY_DAYS - 1; // index of today in the strip (rightmost)
type TabNav = { addListener(type: 'tabPress', cb: (e: { preventDefault?(): void }) => void): () => void };

export default function Historial() {
  const { pid, role, nurses, names, now } = useCare();
  const router = useRouter();
  const navigation = useNavigation<TabNav>();
  const params = useLocalSearchParams<{ day?: string; filter?: string }>();

  // The tab bar re-sends the route's last params, so a tap on "Historial" would reopen
  // the old day and filter. Like the prototype, the tab always opens today with Todo.
  // The native tab bar can't cancel its switch (no preventDefault): it focuses the
  // tab after this navigate has already cleared the params.
  useEffect(() => {
    if (!role) return;
    return navigation.addListener('tabPress', (e) => {
      e.preventDefault?.();
      router.navigate(role === 'nurse' ? '/nurse/historial' : '/family/historial');
    });
  }, [navigation, router, role]);
  const since = useSince(HISTORY_DAYS);
  const schedules = useSchedules(pid);
  const doseRows = useDoseRows(pid, since);
  const readings = useReadings(pid, since);
  const events = useEvents(pid, since);
  const handoffs = useHandoffs(pid, since);

  const today = localDate(now);
  const days = useMemo(() => {
    const t = startOfDay(now);
    return Array.from({ length: HISTORY_DAYS }, (_, i) => addDays(t, i - TODAY));
  }, [today]);

  // The URL params are the state: taps call setParams, so a deep link from Estado
  // ("/family/historial?day=…&filter=…") always wins, even on a tab that stayed mounted.
  // No day = today; a day outside the 7-day window is clamped to it.
  const first = localDate(days[0]);
  const want = params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day) ? params.day : today;
  const selDay = want >= today ? today : want < first ? first : want;
  const filter: HistoryFilter = FILTERS.find((x) => x.id === params.filter)?.id ?? 'all';

  const perDay = useMemo(
    () =>
      days.map((day) =>
        eventsForDay({ day, now, doses: dosesForDay(schedules, doseRows, day, now), readings, events, handoffs, names, nurses }),
      ),
    [days, now, schedules, doseRows, readings, events, handoffs, names, nurses],
  );

  const found = days.findIndex((d) => localDate(d) === selDay);
  const sel = found < 0 ? TODAY : found;
  const day = days[sel];
  const dayEvents = pid ? perDay[sel] : [];
  const shown = filterEvents(dayEvents, filter);
  const sum = daySummary(dayEvents);

  const writers = nurses.map((n) => n.short).filter(Boolean);
  const sub = `${sel === TODAY ? 'Hoy, ' : ''}${longDate(day)}${role === 'family' && writers.length ? ` · lo que anotan ${listY(writers)}` : ''}`;

  return (
    <Screen bottomInset={false} gap={14}>
      <PageHeader title="Historial" sub={sub} />

      <View role="group" accessibilityLabel="Elegir día" style={s.strip}>
        {days.map((d, i) => {
          const selected = i === sel;
          const st: DayStatus = pid ? dayStatus(perDay[i]) : 'empty';
          const ink = selected ? colors.onPri : colors.ink;
          const mark = DAY_ICON[st];
          return (
            <Pressable
              key={localDate(d)}
              onPress={() => router.setParams({ day: i === TODAY ? undefined : localDate(d) })}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${WEEKDAYS[d.getDay()]} ${d.getDate()}${i === TODAY ? ', hoy' : ''}: ${DAY_WORD[st]}`}
              style={[s.day, selected ? s.daySel : s.dayIdle]}
            >
              <T size={13} bold color={ink}>{WEEKDAYS_SHORT[d.getDay()]}</T>
              <T size={19} bold color={ink} style={s.num}>{d.getDate()}</T>
              <View style={s.mark}>
                {mark.icon ? <Icon name={mark.icon} size={16} color={selected ? colors.onPri : mark.ink} strokeWidth={2.6} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {pid ? (
        <Card gap={8} style={s.summary}>
          <SummaryLine icon="pill" text={sum.meds} />
          <SummaryLine icon="pulse" text={sum.vitals} />
        </Card>
      ) : null}

      <View role="group" accessibilityLabel="Filtrar historial" style={s.filters}>
        {FILTERS.map((f) => (
          <Chip key={f.id} label={f.label} kind="toggle" look="fill" height={44} selected={filter === f.id} onPress={() => router.setParams({ filter: f.id })} />
        ))}
      </View>

      {shown.length ? (
        <View accessibilityRole="list" accessibilityLabel="Lo que pasó, de lo último a lo primero">
          {shown.map((e, i) => (
            <TimelineItem key={e.id} event={e} last={i === shown.length - 1} />
          ))}
        </View>
      ) : (
        <View style={s.empty}>
          <T size={16} lh={1.45} color={colors.ink2}>
            {pid
              ? 'No hay nada de este tipo ese día.'
              : 'Aún no sigues a ningún paciente. Únete con el código que te dé la enfermera.'}
          </T>
        </View>
      )}
    </Screen>
  );
}

function SummaryLine({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={s.line}>
      <View style={{ marginTop: 1 }}>
        <Icon name={icon} size={20} color={colors.pri} strokeWidth={2.2} />
      </View>
      <T size={16} lh={1.4} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

const s = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 4 },
  day: {
    flex: 1, minWidth: 0, minHeight: 70, borderRadius: radius.day, borderCurve: 'continuous', paddingVertical: 6,
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  daySel: { backgroundColor: colors.pri, borderWidth: 2, borderColor: colors.pri },
  dayIdle: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  num: { fontVariant: ['tabular-nums'] },
  mark: { width: 16, height: 16 }, // keeps empty days the same height
  summary: { paddingVertical: 14, paddingHorizontal: 16 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  empty: { padding: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.field, borderRadius: radius.card, borderCurve: 'continuous' },
});
