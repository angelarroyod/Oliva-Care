import { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { Screen, PageHeader } from '@/components/Screen';
import { T, H2 } from '@/components/T';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { useCare, useSince, useSchedules, useDoseRows, useReadings, useEvents, useHandoffs } from '@/features/care/hooks';
import { nextNurse, shiftEnd, shiftKind, shiftStart } from '@/features/care/shifts';
import { feverState } from '@/features/care/timeline';
import { dosesSpan, handoffBrief, myHandoff, shiftLog } from '@/features/care/nextUp';
import { cap, hhmm } from '@/features/care/clock';
import { supabase } from '@/lib/supabase';
import { lastQueued, mutate, saved, unqueue } from '@/lib/db';
import { colors, radius } from '@/theme';

const TWO_HOURS = 2 * 3_600_000;

export default function NurseRelevo() {
  const toast = useToast();
  const { pid, meId, meNurse, nurses, names, now } = useCare();
  const since = useSince(1); // a night shift started yesterday
  const schedules = useSchedules(pid);
  const rows = useDoseRows(pid, since);
  const readings = useReadings(pid, since);
  const events = useEvents(pid, since);
  const handoffs = useHandoffs(pid, since);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  const kind = meNurse ? shiftKind(meNurse) : null;
  const start = shiftStart(meNurse, now);
  const end = shiftEnd(meNurse, now);
  const next = nextNurse(nurses, meId);
  const nextKind = next ? shiftKind(next) : null;
  const fever = feverState(readings, events, now);
  // Through 2 h after my shift ends: the next nurse's first doses go in "Para …".
  const doses = dosesSpan(schedules, rows, start, new Date((end ?? now).getTime() + TWO_HOURS), now);
  const brief = handoffBrief({ now, start, end, fever, doses, readings, events });
  const log = shiftLog({ now, start, meId, doses, readings, events, handoffs, names, nurses });
  const handed = myHandoff(handoffs, meId, start);

  const sub = [
    kind && meNurse ? `${cap(kind)} de ${meNurse.start} a ${meNurse.end}` : 'Sin turno fijo',
    next ? `para ${next.short}${nextKind ? ` (turno de ${nextKind})` : ''}` : '',
  ].filter(Boolean).join(' · ');
  const tasks = brief.para.length;

  async function handOff() {
    if (!pid || busy) return;
    setBusy(true);
    const id = randomUUID(); // known before the insert, so undo works offline too
    const err = await mutate(
      supabase.from('shift_handoffs').insert({
        id, patient_id: pid, nurse_id: meId, summary: brief.record, recommendation: brief.para.join('\n'),
        started_at: start.toISOString(), ended_at: new Date().toISOString(),
      }),
      'shift_handoffs',
    );
    setBusy(false);
    setSheet(false);
    if (err) return Alert.alert('No se pudo guardar', err);
    const queued = lastQueued();
    toast.show(saved(`Turno entregado${next ? ` a ${next.short}` : ''}.`), async () => {
      if (unqueue(queued)) return;
      const e = await mutate(supabase.from('shift_handoffs').delete().eq('id', id), 'shift_handoffs');
      if (e) Alert.alert('No se pudo deshacer', e);
    });
  }

  return (
    <Screen bottomInset={false}>
      <PageHeader title="Relevo de turno" sub={sub} />

      {handed ? (
        <View style={s.done}>
          <View style={s.doneIcon}>
            <Icon name="check" size={16} color={colors.white} strokeWidth={2.8} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <T size={17} bold color={colors.pri}>
              {`Turno entregado${next ? ` a ${next.short}` : ''} a las ${hhmm(new Date(handed.ended_at ?? handed.started_at ?? now))}`}
            </T>
            <T size={15}>{`${next ? next.short : 'El equipo'} y la familia ya pueden ver este resumen.`}</T>
          </View>
        </View>
      ) : null}

      <Card gap={6}>
        <Eyebrow color={colors.ink2}>RESUMEN</Eyebrow>
        <T size={19} bold lh={1.35}>{brief.summary}</T>
      </Card>

      {brief.watch.length ? (
        <Card tone="warn" gap={6}>
          <View style={s.watchHead}>
            <Icon name="warn" size={18} color={colors.warnInk} strokeWidth={2.4} />
            <Eyebrow color={colors.warnInk}>A VIGILAR</Eyebrow>
          </View>
          {brief.watch.map((w, i) => (
            <T key={i} size={17} bold color={colors.warnInk}>{w.text}</T>
          ))}
        </Card>
      ) : null}

      <Card gap={10}>
        <Eyebrow color={colors.ink2}>{`PARA ${next ? next.short.toUpperCase() : 'EL SIGUIENTE TURNO'}`}</Eyebrow>
        {brief.para.map((p, i) => (
          <View key={i} style={s.bullet}>
            <View style={s.dot} />
            <T size={16} style={{ flex: 1 }}>{p}</T>
          </View>
        ))}
      </Card>

      <View style={{ gap: 10 }}>
        <H2>Lo que va de turno</H2>
        {log.length ? (
          <View style={s.timeline}>
            {log.map((e) => (
              <View key={e.id} style={s.item}>
                <View style={[s.tlDot, { backgroundColor: e.warn ? colors.warn : colors.pri }]} />
                <View style={s.itemHead}>
                  <T size={16} bold style={{ flex: 1 }}>{e.title}</T>
                  <T size={16} bold color={colors.ink2} style={s.num}>{e.time}</T>
                </View>
                {e.body ? <T size={15} color={colors.ink2} style={{ marginTop: 2 }}>{e.body}</T> : null}
              </View>
            ))}
          </View>
        ) : (
          <View style={s.empty}>
            <T size={16} color={colors.ink2} lh={1.45}>
              Aún no hay nada anotado en este turno. Lo que registres aparecerá aquí.
            </T>
          </View>
        )}
      </View>

      {handed ? null : (
        <Button label={`Entregar turno${next ? ` a ${next.short}` : ''}`} onPress={() => setSheet(true)} disabled={!pid} />
      )}

      <Sheet visible={sheet} title={`¿Entregar el turno${next ? ` a ${next.short}` : ''}?`} onClose={() => setSheet(false)}>
        <View style={{ gap: 8 }}>
          {[
            'Resumen del turno',
            brief.watchLine,
            `${tasks} ${tasks === 1 ? 'tarea' : 'tareas'} para el ${nextKind ? `turno de ${nextKind}` : 'siguiente turno'}`,
            'La familia verá el resumen',
          ].map((it) => (
            <View key={it} style={s.sheetItem}>
              <T size={16} accessibilityElementsHidden importantForAccessibility="no">•</T>
              <T size={16} style={{ flex: 1 }}>{it}</T>
            </View>
          ))}
        </View>
        <Button label="Sí, entregar turno" onPress={handOff} disabled={busy} />
      </Sheet>
    </Screen>
  );
}

// 14px bold spaced caps section label (an h2 for screen readers).
function Eyebrow({ children, color }: { children: string; color: string }) {
  return (
    <T size={14} bold color={color} accessibilityRole="header" style={{ letterSpacing: 14 * 0.06 }}>
      {children}
    </T>
  );
}

const s = StyleSheet.create({
  done: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: radius.card, borderCurve: 'continuous',
    backgroundColor: colors.priSoft, borderWidth: 2, borderColor: colors.ok,
  },
  doneIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.pri, alignItems: 'center', justifyContent: 'center' },
  watchHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.pri, marginTop: 8 },
  timeline: { borderLeftWidth: 2, borderLeftColor: colors.line, marginLeft: 6 },
  item: { paddingLeft: 20, paddingBottom: 16 },
  tlDot: { position: 'absolute', left: -8, top: 4, width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: colors.bg },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  num: { fontVariant: ['tabular-nums'] },
  empty: { padding: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.field, borderRadius: radius.card, borderCurve: 'continuous' },
  sheetItem: { flexDirection: 'row', gap: 10, paddingLeft: 4 },
});
