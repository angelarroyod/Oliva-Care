import { useMemo, useState, type ReactNode } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, radius } from '@/theme';
import { Screen } from '@/components/Screen';
import { T, H1, H2 } from '@/components/T';
import { Icon, type IconName } from '@/components/Icon';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { HeroLeaf } from '@/components/Logo';
import { Notice, type Tone } from '@/components/Status';
import { TrendCard } from '@/components/TrendCard';
import {
  useCare, useDoseRows, useEvents, useHandoffs, useReadings, useSchedules, useSince, useVitalPlans,
} from '@/features/care/hooks';
import { isLoaded } from '@/features/care/useLiveList';
import { firstName, hhmm, localDate, longDate, sameDay, startOfWeek, weekRange } from '@/features/care/clock';
import { planFromRows } from '@/features/care/vitals';
import { dosesForDay } from '@/features/care/doses';
import { feverState, type HistoryFilter } from '@/features/care/timeline';
import { onShift } from '@/features/care/shifts';
import {
  hero, knows, latestVitals, todayTiles, trends, weekMeds, weekSummary, type DayState, type KnowTone, type Line,
} from '@/features/care/estado';
import type { Severity } from '@/features/care/types';

// Family · Estado: how the patient is now, today's exceptions and the week.
const KNOW: Record<KnowTone, { tone: Tone; icon: IconName }> = {
  alert: { tone: 'alert', icon: 'warn' },
  warn: { tone: 'warn', icon: 'warn' },
  unrec: { tone: 'unrec', icon: 'clock' },
  ok: { tone: 'ok', icon: 'check' },
};
const VITAL: Record<Severity, { word: string; ink: string; icon: IconName; border: object }> = {
  ok: { word: 'Normal', ink: colors.ok, icon: 'check', border: { borderWidth: 1.5, borderColor: colors.line } },
  warn: { word: 'Revisar', ink: colors.warnInk, icon: 'warn', border: { borderWidth: 2, borderColor: colors.warn } },
  alert: { word: 'Alerta', ink: colors.danger, icon: 'alert', border: { borderWidth: 2, borderColor: colors.danger } },
};
const DAY: Record<DayState, { bg: string; ink: string; border: object; icon?: IconName }> = {
  ok: { bg: colors.ok, ink: colors.onPri, border: { borderWidth: 2, borderColor: colors.ok }, icon: 'check' },
  skipped: { bg: colors.warnSoft, ink: colors.warnInk, border: { borderWidth: 2, borderColor: colors.warn }, icon: 'ban' },
  unrec: { bg: colors.surface, ink: colors.ink2, border: { borderWidth: 2, borderColor: colors.field, borderStyle: 'dashed' }, icon: 'clock' },
  pending: { bg: colors.surface, ink: colors.pri, border: { borderWidth: 2, borderColor: colors.pri, borderStyle: 'dashed' }, icon: 'clock' },
  none: { bg: colors.surface, ink: colors.ink2, border: { borderWidth: 1.5, borderColor: colors.line, borderStyle: 'dashed' } },
  future: { bg: colors.surface, ink: colors.ink2, border: { borderWidth: 1.5, borderColor: colors.field, borderStyle: 'dashed' } },
};

export default function Estado() {
  const router = useRouter();
  const { pid, myName, patient, short, nurses, now } = useCare();
  const sinceMonday = (now.getDay() + 6) % 7;
  const since4w = useSince(sinceMonday + 21);
  const sinceWeek = useSince(sinceMonday);
  const sinceYesterday = useSince(1);
  const readings = useReadings(pid, since4w);
  const schedules = useSchedules(pid);
  const doseRows = useDoseRows(pid, sinceWeek);
  const events = useEvents(pid, sinceYesterday);
  const handoffs = useHandoffs(pid, sinceYesterday);
  const planRows = useVitalPlans(pid);
  const [more, setMore] = useState(false);

  const d = useMemo(() => {
    const plan = planFromRows(planRows);
    const nurse = onShift(nurses, hhmm(now));
    const fever = feverState(readings, events, now);
    const todayReadings = readings.filter((r) => sameDay(new Date(r.taken_at), now));
    const todayDoses = dosesForDay(schedules, doseRows, now, now);
    const week = weekMeds(schedules, doseRows, now);
    const ts = trends(readings, plan, short, now);
    return {
      nurse,
      fever,
      hero: hero({ patient, short, fever, nurse, nurses, handoffs, now }),
      tiles: todayTiles(todayDoses, todayReadings),
      knows: knows({ fever, readings: todayReadings, events, doses: todayDoses, plan, short, nurse, now }),
      vitals: latestVitals(todayReadings),
      week,
      trends: ts,
      summary: weekSummary(ts, week, now),
    };
  }, [planRows, nurses, now, readings, events, schedules, doseRows, patient, short, handoffs]);

  const history = (day: string, filter: HistoryFilter) => router.navigate({ pathname: '/family/historial', params: { day, filter } });
  const today = localDate(now);
  const me = firstName(myName);
  const nurseShort = d.nurse?.short ?? 'la enfermera';
  const { med, vitals } = d.tiles;

  const header = (
    <>
      <View style={s.header}>
        <View style={s.flex}>
          <T size={16} color={colors.ink2}>{me ? `Hola, ${me}` : 'Hola'}</T>
          <H1 size={32} style={s.h1}>{`¿Cómo está ${short}?`}</H1>
        </View>
        <Pressable
          onPress={() => router.navigate('/family/perfil')}
          accessibilityRole="button"
          accessibilityLabel={`Perfil de ${short}`}
          style={({ pressed }) => pressed && { opacity: 0.85 }}
        >
          <Avatar initials={(me[0] ?? '?').toUpperCase()} size={48} />
        </Pressable>
      </View>
    </>
  );

  // Until the data is in, say so: an empty list must not read as "todo en orden".
  if (!patient || ![readings, schedules, doseRows, events].every(isLoaded)) {
    return (
      <Screen bottomInset={false} gap={18}>
        {header}
        <View style={s.hero} accessibilityLiveRegion="polite">
          <HeroLeaf />
          <T size={22} bold color={colors.white}>Cargando…</T>
          <T size={16} color={colors.heroSub}>{`Buscando lo último sobre ${short}.`}</T>
        </View>
      </Screen>
    );
  }

  return (
    <Screen bottomInset={false} gap={18}>
      {header}

      <View style={s.hero}>
        {d.fever ? null : <HeroLeaf />}
        <View style={s.row8}>
          <Icon name={d.fever ? 'warn' : 'check'} size={18} color={colors.heroSub} strokeWidth={d.fever ? 2.4 : 2.8} />
          <T size={15} bold color={colors.heroSub} style={s.shrink}>{d.hero.status}</T>
        </View>
        <T size={30} bold lh={1.15} color={colors.white}>{d.hero.headline}</T>
        <T size={16} lh={1.4} color={colors.heroSub}>{d.hero.caregiver}</T>
      </View>

      <View style={s.section}>
        <SectionTitle title="Hoy" sub={longDate(now)} />
        <Pairs>
          {[
            <Tile
              key="med"
              label="Medicación"
              big={`${med.given} de ${med.total}`}
              sub="dosis dadas"
              lines={med.lines}
              aria={`Medicación de hoy: ${med.given} de ${med.total} dosis dadas. Ver en el historial`}
              onPress={() => history(today, 'med')}
            />,
            <Tile
              key="vitals"
              label="Signos"
              big={String(vitals.controls)}
              sub={vitals.controls === 1 ? 'control hoy' : 'controles hoy'}
              lines={vitals.lines}
              aria={`Signos de hoy: ${vitals.controls} ${vitals.controls === 1 ? 'control' : 'controles'}. Ver en el historial`}
              onPress={() => history(today, 'vitals')}
            />,
          ]}
        </Pairs>
        {d.knows.map((k, i) => (
          <Notice key={i} tone={KNOW[k.tone].tone} icon={KNOW[k.tone].icon} lead={k.lead}>
            {k.text}
          </Notice>
        ))}
        <H2 size={17} style={s.h3}>Últimos signos</H2>
        {d.vitals.length ? (
          <Pairs>
            {d.vitals.map((v) => {
              const w = VITAL[v.sev];
              return (
                <View key={v.kind} style={[s.tile, s.vital, w.border]}>
                  <T size={15} bold color={colors.ink2}>{v.label}</T>
                  <T size={24} bold>
                    {v.value} <T size={14} color={colors.ink2}>{v.unit}</T>
                  </T>
                  <View style={s.row5}>
                    <Icon name={w.icon} size={15} color={w.ink} strokeWidth={2.6} />
                    <T size={14} bold color={w.ink} style={s.shrink}>{`${w.word} · ${v.time}`}</T>
                  </View>
                </View>
              );
            })}
          </Pairs>
        ) : (
          <T size={15} color={colors.ink2}>Aún no hay signos hoy.</T>
        )}
      </View>

      <View style={[s.section, s.week]}>
        <SectionTitle title="Esta semana" sub={weekRange(startOfWeek(now))} />
        <T size={17} lh={1.45}>{d.summary}</T>
        <Card gap={12}>
          <H2 size={17}>Medicación</H2>
          <View>
            <T size={24} bold lh={1.2}>{`${d.week.given} de ${d.week.total} dosis dadas`}</T>
            {d.week.sub ? <T size={15} color={colors.ink2} style={s.mt4}>{d.week.sub}</T> : null}
          </View>
          <View style={s.strip}>
            {d.week.days.map((w) => {
              const st = DAY[w.state];
              const future = w.state === 'future';
              return (
                <Pressable
                  key={w.key}
                  onPress={() => history(w.key, 'med')}
                  disabled={future}
                  accessibilityRole="button"
                  accessibilityLabel={w.aria}
                  accessibilityState={{ disabled: future }}
                  style={[s.dayCell, w.today && { backgroundColor: colors.priSoft }]}
                >
                  <T size={13} bold color={future ? colors.ink2 : colors.ink}>{w.letter}</T>
                  <View style={[s.circle, { backgroundColor: st.bg }, st.border]}>
                    {st.icon ? <Icon name={st.icon} size={16} color={st.ink} strokeWidth={2.8} /> : null}
                  </View>
                  <T size={13} color={colors.ink2}>{String(w.n)}</T>
                </Pressable>
              );
            })}
          </View>
          {d.week.exceptions.length ? (
            <View style={s.exceptions}>
              {d.week.exceptions.map((x, i) => (
                <View key={i} style={s.excRow}>
                  <Icon name={x.skipped ? 'ban' : 'clock'} size={18} color={x.skipped ? colors.warnInk : colors.ink2} strokeWidth={2.4} />
                  <T size={15} lh={1.4} style={s.shrink}>
                    <T size={15} bold>{x.text}</T>
                    {` · ${x.st}`}
                  </T>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
        {d.trends.slice(0, more ? 4 : 2).map((t) => (
          <TrendCard key={t.kind} {...t} />
        ))}
        <Pressable
          onPress={() => setMore((m) => !m)}
          accessibilityRole="button"
          accessibilityState={{ expanded: more }}
          style={({ pressed }) => [s.toggle, pressed && { opacity: 0.85 }]}
        >
          <T size={17} bold color={colors.pri} center>{more ? 'Ver menos signos' : 'Ver dolor y pulso'}</T>
        </Pressable>
      </View>

      <Button label={`Escribir a ${nurseShort}`} onPress={() => router.navigate('/family/mensajes')} />
    </Screen>
  );
}

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={s.sectionTitle}>
      <H2 size={22}>{title}</H2>
      <T size={15} color={colors.ink2}>{sub}</T>
    </View>
  );
}

// Two-column grid; an odd last item keeps half width.
function Pairs({ children }: { children: ReactNode[] }) {
  const rows: ReactNode[][] = [];
  children.forEach((c, i) => (i % 2 ? rows[rows.length - 1].push(c) : rows.push([c])));
  return (
    <View style={s.pairs}>
      {rows.map((r, i) => (
        <View key={i} style={s.pairRow}>
          {r.map((c, j) => (
            <View key={j} style={s.flex}>{c}</View>
          ))}
          {r.length === 1 ? <View style={s.flex} /> : null}
        </View>
      ))}
    </View>
  );
}

function Tile({ label, big, sub, lines, aria, onPress }: {
  label: string; big: string; sub: string; lines: Line[]; aria: string; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={aria}
      style={({ pressed }) => [s.tile, s.todayTile, pressed && { opacity: 0.85 }]}
    >
      <T size={15} bold color={colors.ink2}>{label}</T>
      <T size={28} bold lh={1.1}>{big}</T>
      <T size={15} color={colors.ink2}>{sub}</T>
      <View style={s.lines}>
        {lines.map((l) => (
          <View key={l.text} style={s.row6}>
            <Icon name={l.icon} size={15} color={l.ink} strokeWidth={2.6} />
            <T size={14} bold color={l.ink} style={s.shrink}>{l.text}</T>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  mt4: { marginTop: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  h1: { marginTop: 2 },
  h3: { marginTop: 6 },
  hero: { backgroundColor: colors.hero, borderRadius: radius.card, padding: 20, gap: 10, overflow: 'hidden' },
  row5: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  row6: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  row8: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  section: { gap: 10 },
  sectionTitle: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  pairs: { gap: 10 },
  pairRow: { flexDirection: 'row', gap: 10 },
  tile: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 14, gap: 4 },
  todayTile: { minHeight: 150, borderWidth: 1.5, borderColor: colors.line, flexGrow: 1 },
  vital: { flexGrow: 1 },
  lines: { gap: 4, marginTop: 6 },
  week: { gap: 12, paddingTop: 14, borderTopWidth: 1.5, borderTopColor: colors.line },
  strip: { flexDirection: 'row', gap: 2 },
  dayCell: { flex: 1, minHeight: 80, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6 },
  circle: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  exceptions: { paddingTop: 10, borderTopWidth: 1.5, borderTopColor: colors.line, gap: 8 },
  excRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  toggle: {
    minHeight: 52, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.pri, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20,
  },
});
