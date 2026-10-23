import { useState, type ReactNode } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, PageHeader } from '@/components/Screen';
import { T, H2 } from '@/components/T';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Card } from '@/components/Card';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { ReminderPicker } from '@/components/ReminderPicker';
import { useCare, useSchedules } from '@/features/care/hooks';
import { reminderRows, shiftLabel } from '@/features/care/shifts';
import { cap, listY, shortTime } from '@/features/care/clock';
import type { ReminderMode } from '@/features/care/types';
import { supabase } from '@/lib/supabase';
import { mutate, saved } from '@/lib/db';
import { colors, radius } from '@/theme';

export default function NurseAviso() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pid, meId, nurses } = useCare();
  const sc = useSchedules(pid).find((x) => x.id === id);
  const [draft, setDraft] = useState<{ mode: ReminderMode; minutes: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);

  const back = () => router.back();
  if (!sc) {
    return (
      <Screen>
        <PageHeader title="Aviso" onBack={back} backLabel="Volver a medicación" size={28} />
      </Screen>
    );
  }

  const times = sc.times.map(shortTime);
  const mode = draft?.mode ?? sc.reminder_mode;
  const minutes = draft ? draft.minutes : sc.reminder_minutes;
  const rows = reminderRows(times, mode, minutes, nurses);
  const cross = rows.find((r) => r.cross);

  const save = async () => {
    setBusy(true);
    const err = await mutate(
      supabase
        .from('medication_schedules')
        .update({ reminder_mode: mode, reminder_minutes: mode === 'exact' ? 0 : minutes, updated_by: meId, updated_at: new Date().toISOString() })
        .eq('id', sc.id),
      'medication_schedules',
    );
    setBusy(false);
    if (err) return Alert.alert('No se pudo guardar', err);
    router.back();
    const at = rows.map((r) => r.time);
    toast.show(
      saved(
        rows.length === 1 && rows[0].nurse
          ? `Aviso guardado. Sonará a las ${at[0]} y le llegará a ${rows[0].nurse.short}.`
          : `Aviso guardado. Sonará a las ${listY(at)}, a quien esté de turno.`,
      ),
    );
  };

  // Suspending stamps the instant: later doses stop being expected, earlier ones
  // (recorded, pending or sin registrar) stay in the history as they were.
  const stop = async () => {
    const stamp = new Date().toISOString();
    setBusy(true);
    const err = await mutate(
      supabase
        .from('medication_schedules')
        .update({ active: false, suspended_at: stamp, updated_by: meId, updated_at: stamp })
        .eq('id', sc.id),
      'medication_schedules',
    );
    setBusy(false);
    if (err) return Alert.alert('No se pudo guardar', err);
    setStopping(false);
    router.back();
    toast.show(saved(`${sc.name}: ya no se dará.`));
  };

  return (
    <Screen>
      <PageHeader
        title={`Aviso de ${sc.name}`}
        sub={cap([sc.dose, `cada día a las ${listY(times)}`].filter(Boolean).join(' · '))}
        onBack={back}
        backLabel="Volver a medicación"
        size={28}
      />

      <Card>
        <ReminderPicker times={times} mode={sc.reminder_mode} minutes={sc.reminder_minutes} onChange={setDraft} />
      </Card>

      <Card gap={12}>
        <H2 size={17}>¿A quién le llega?</H2>
        <View style={s.rows}>
          {rows.map((r) => (
            <View key={r.dose} style={s.row}>
              <View style={s.pill}>
                <T size={17} bold color={colors.pri} center style={s.num}>{r.time}</T>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <T size={16} bold>{r.nurse?.name ?? 'Quien esté de turno'}</T>
                {r.nurse ? <T size={14} color={colors.ink2}>{shiftLabel(r.nurse)}</T> : null}
              </View>
            </View>
          ))}
        </View>
        <T size={15} lh={1.4} color={colors.ink2}>
          Le llega a quien esté de turno cuando suena. Si cambian los turnos, se ajusta solo.
        </T>
        {cross?.nurse && cross.owner ? (
          <View style={s.cross}>
            <Icon name="warn" size={20} color={colors.warnInk} strokeWidth={2.4} />
            <T size={15} bold lh={1.4} color={colors.warnInk} style={{ flex: 1 }}>
              {`El aviso de las ${cross.time} le llega a ${cross.nurse.short}, pero la dosis de las ${cross.dose} cae ya en el turno de ${cross.owner.short}. Si no da tiempo a darla, ${cross.nurse.short} la deja en el relevo.`}
            </T>
          </View>
        ) : null}
      </Card>

      <Card gap={10}>
        <H2 size={17}>Si nadie la registra</H2>
        <View style={{ gap: 8 }}>
          <Step n={1}>A los 30 minutos, se avisa otra vez a quien esté de turno.</Step>
          <Step n={2}>
            A los 60 minutos, queda <T size={15} bold>«Sin registrar»</T> en el historial y en el resumen de la familia.
          </Step>
        </View>
      </Card>

      <Button label="Guardar aviso" onPress={save} disabled={busy} />
      <Button label="Dejar de dar este medicamento" variant="dangerOutline" onPress={() => setStopping(true)} disabled={busy} />

      <Sheet visible={stopping} title={`¿Dejar de dar ${sc.name}?`} onClose={() => setStopping(false)}>
        <View style={{ gap: 8 }}>
          <Bullet>Las tomas que quedan hoy dejarán de aparecer.</Bullet>
          <Bullet>Lo ya anotado se queda en el historial.</Bullet>
        </View>
        <Button label="Sí, dejar de darlo" variant="danger" onPress={stop} disabled={busy} />
      </Sheet>
    </Screen>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <View style={s.item}>
      <T size={15} lh={1.4} style={s.marker}>{`${n}.`}</T>
      <T size={15} lh={1.4} style={{ flex: 1 }}>{children}</T>
    </View>
  );
}

function Bullet({ children }: { children: string }) {
  return (
    <View style={s.item}>
      <T size={16} lh={1.4} style={s.marker}>•</T>
      <T size={16} lh={1.4} style={{ flex: 1 }}>{children}</T>
    </View>
  );
}

const s = StyleSheet.create({
  rows: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pill: { minWidth: 64, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 12, borderCurve: 'continuous', backgroundColor: colors.priSoft },
  num: { fontVariant: ['tabular-nums'] },
  item: { flexDirection: 'row', gap: 6 },
  marker: { width: 18 },
  cross: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: radius.input, borderCurve: 'continuous', borderWidth: 2, borderColor: colors.warn, backgroundColor: colors.warnSoft,
  },
});
