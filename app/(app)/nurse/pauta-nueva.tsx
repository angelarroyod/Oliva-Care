import { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, PageHeader } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip, Field } from '@/components/Controls';
import { useToast } from '@/components/Toast';
import { ReminderPicker } from '@/components/ReminderPicker';
import { useCare } from '@/features/care/hooks';
import { parseTimes } from '@/features/care/doses';
import { addDays, atTime, localDate } from '@/features/care/clock';
import type { ReminderMode } from '@/features/care/types';
import { supabase } from '@/lib/supabase';
import { mutate } from '@/lib/db';

const PRESETS = [
  { label: '1 al día', times: '09:00' },
  { label: 'Cada 12 h', times: '09:00, 21:00' },
  { label: 'Cada 8 h', times: '06:00, 14:00, 22:00' },
];

export default function PautaNueva() {
  const router = useRouter();
  const toast = useToast();
  const { pid, meId, now } = useCare();
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [purpose, setPurpose] = useState('');
  const [hours, setHours] = useState('');
  const [days, setDays] = useState('');
  const [rem, setRem] = useState<{ mode: ReminderMode; minutes: number }>({ mode: 'before', minutes: 15 });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const times = parseTimes(hours);
  const n = /^\d+$/.test(days.trim()) ? Number(days.trim()) : null;
  const daysOk = !days.trim() || (n != null && n >= 1 && n <= 365);
  const errors = {
    name: name.trim() ? null : 'Escribe el nombre del medicamento.',
    hours: times ? null : 'Escribe las horas así: 08:00, 20:00 (hasta 12).',
    days: daysOk ? null : 'Escribe un número de días entre 1 y 365.',
  };
  const valid = !errors.name && !errors.hours && !errors.days;
  // Errors show only after the first save attempt, then follow the input live.
  const shown = (e: string | null) => (tried ? e : null);

  const save = async () => {
    setTried(true);
    if (!valid || !times || !pid) return;
    const start = localDate(now);
    setBusy(true);
    const err = await mutate(
      supabase.from('medication_schedules').insert({
        patient_id: pid,
        name: name.trim(),
        dose: dose.trim(),
        purpose: purpose.trim() || null,
        times,
        reminder_mode: rem.mode,
        reminder_minutes: rem.mode === 'exact' ? 0 : rem.minutes,
        start_date: start,
        end_date: n ? localDate(addDays(now, n - 1)) : null,
        created_by: meId,
        updated_by: meId,
      }),
      'medication_schedules',
    );
    setBusy(false);
    if (err) return Alert.alert('No se pudo guardar', err);
    router.back();
    const next = times.find((t) => atTime(now, t).getTime() >= now.getTime());
    toast.show(`${name.trim()} añadido.${next ? ` Próxima dosis hoy a las ${next}.` : ''}`);
  };

  return (
    <Screen>
      <PageHeader
        title="Añadir medicamento"
        sub="Se repetirá cada día a las horas que elijas."
        onBack={() => router.back()}
        backLabel="Volver a medicación"
      />

      <Field label="Medicamento" value={name} onChangeText={setName} error={shown(errors.name)} autoCapitalize="sentences" />
      <Field label="Dosis" optional value={dose} onChangeText={setDose} placeholder="50 mg" />
      <Field label="Para qué es" optional value={purpose} onChangeText={setPurpose} autoCapitalize="sentences" />

      <View style={{ gap: 10 }}>
        <Field
          label="Horas"
          value={hours}
          onChangeText={setHours}
          hint="Por ejemplo: 08:00, 20:00"
          error={shown(errors.hours)}
          keyboardType="numbers-and-punctuation"
        />
        <View style={s.chips}>
          {PRESETS.map((p) => (
            <Chip key={p.label} label={p.label} kind="toggle" selected={hours.trim() === p.times} onPress={() => setHours(p.times)} />
          ))}
        </View>
      </View>

      <Field
        label="Durante (días)"
        optional
        value={days}
        onChangeText={setDays}
        hint="Déjalo vacío si es un tratamiento continuo."
        error={shown(errors.days)}
        keyboardType="number-pad"
      />

      <Card>
        <ReminderPicker times={times ?? []} mode="before" minutes={15} onChange={setRem} />
      </Card>

      <Button label="Guardar medicamento" onPress={save} disabled={busy || (tried && !valid)} />
    </Screen>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
