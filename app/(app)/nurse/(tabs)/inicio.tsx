import { useState } from 'react';
import { View, Pressable, StyleSheet, Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { BrandHeader } from '@/components/Logo';
import { Avatar, initialsOf } from '@/components/Avatar';
import { T, H1, H2 } from '@/components/T';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/Button';
import { Card, RowLink } from '@/components/Card';
import { useToast } from '@/components/Toast';
import {
  useCare, useSince, useSchedules, useDoseRows, useReadings, useEvents, useHandoffs, useConditions, useVitalPlans,
} from '@/features/care/hooks';
import { dosesForDay, summarize } from '@/features/care/doses';
import { CONDITIONS, VITALS, planFromRows, routineKinds } from '@/features/care/vitals';
import { nextNurse, shiftKind, shiftStart } from '@/features/care/shifts';
import { feverState } from '@/features/care/timeline';
import { dosesSpan, doctorRef, feverText, heroNext, myHandoff } from '@/features/care/nextUp';
import { firstName, greeting, hhmm, lc, listY } from '@/features/care/clock';
import { supabase } from '@/lib/supabase';
import { mutate, saved } from '@/lib/db';
import { colors, radius } from '@/theme';

export default function NurseInicio() {
  const router = useRouter();
  const toast = useToast();
  const { pid, meId, myName, meNurse, patient, team, nurses, now } = useCare();
  const since = useSince(1); // a night shift started yesterday; fever looks back 24 h
  const schedules = useSchedules(pid);
  const rows = useDoseRows(pid, since);
  const readings = useReadings(pid, since);
  const events = useEvents(pid, since);
  const handoffs = useHandoffs(pid, since);
  const conditions = useConditions(pid);
  const plan = planFromRows(useVitalPlans(pid));
  const [busy, setBusy] = useState(false);

  const first = firstName(myName);
  const kind = meNurse ? shiftKind(meNurse) : null;
  const start = shiftStart(meNurse, now);
  const next = nextNurse(nurses, meId);
  const fever = feverState(readings, events, now);
  const doctor = team.find((m) => m.role === 'doctor')?.profiles?.full_name?.trim() || null;
  const hero = heroNext({
    now, me: meNurse, meId, myFirst: first, next, start, fever, plan, doctor, readings, events, handoffs,
    doses: dosesSpan(schedules, rows, start, now, now),
  });

  const today = dosesForDay(schedules, rows, now, now);
  const sum = summarize(today);
  const unrec = today.find((d) => d.status === 'unrecorded');
  const routine = routineKinds(plan).map((k) => lc(VITALS[k].short));
  const lastControl = Math.max(0, ...readings.map((r) => new Date(r.taken_at).getTime()).filter((t) => t >= start.getTime()));
  const handed = myHandoff(handoffs, meId, start);

  async function callDoctor() {
    if (!fever || !pid || busy) return;
    setBusy(true);
    const err = await mutate(
      supabase.from('care_events').insert({
        patient_id: pid, author_id: meId, type: 'doctor_call', title: 'Aviso al médico', body: `${feverText(fever)}.`, severity: 'warning',
      }),
      'care_events',
    );
    setBusy(false);
    if (err) return Alert.alert('No se pudo guardar', err);
    // ponytail: no phone numbers are stored yet, so this only opens the dialer. Store the doctor's phone to dial it directly.
    Linking.openURL('tel:').catch(() => {});
    toast.show(saved(`Llamando ${doctorRef(doctor)}… Queda anotado que avisaste al médico.`));
  }

  const heroGo = {
    fever: callDoctor,
    dose: () => router.push('/nurse/medicacion'),
    vitals: () => router.navigate('/nurse/signos'),
    handoff: () => router.navigate('/nurse/relevo'),
    done: () => router.navigate('/nurse/relevo'),
  }[hero.kind];

  const medSub = `${sum.given} de ${sum.total} dosis dadas hoy${sum.unrecorded ? ` · ${sum.unrecorded} sin registrar` : ''}${
    sum.skipped ? ` · ${sum.skipped} ${sum.skipped === 1 ? 'no se dio' : 'no se dieron'}` : ''
  }`;
  const vitalsSub = lastControl
    ? `Último control a las ${hhmm(new Date(lastControl))}`
    : routine.length ? `Según su plan: ${listY(routine)}` : undefined;
  const relevoSub = handed
    ? `Entregado${next ? ` a ${next.short}` : ''}`
    : kind && meNurse ? `Entregar a las ${meNurse.end}` : 'Entregar el turno';

  return (
    <Screen bottomInset={false} gap={20}>
      <View style={s.header}>
        <BrandHeader />
        <Pressable
          onPress={() => router.navigate('/nurse/perfil')}
          accessibilityRole="button"
          accessibilityLabel={`Tu perfil${myName ? `, ${myName}` : ''}`}
          hitSlop={4}
        >
          <Avatar initials={initialsOf(myName || '?')} size={48} />
        </Pressable>
      </View>

      <View style={{ gap: 8 }}>
        <H1 size={34}>{first ? `${greeting(now)}, ${first}` : greeting(now)}</H1>
        <T size={16} color={colors.ink2}>
          {kind && meNurse ? `Turno de ${kind} · de ${meNurse.start} a ${meNurse.end}` : 'Sin turno fijo'}
        </T>
      </View>

      <View style={[s.hero, { backgroundColor: hero.kind === 'fever' ? colors.danger : colors.pri }]}>
        <T size={14} bold color={colors.heroSub} accessibilityRole="header" style={{ letterSpacing: 14 * 0.08 }}>
          {hero.eyebrow}
        </T>
        <T size={22} bold color={colors.white} lh={1.25}>{hero.title}</T>
        <T size={16} color={colors.heroSub}>{hero.sub}</T>
        <Button label={hero.cta} variant="onHero" height={52} size={17} iconRight="chevronRight" onPress={heroGo} disabled={busy} style={{ marginTop: 12 }} />
      </View>

      {unrec ? (
        <Card tone="unrec" gap={12}>
          <View style={s.unrecRow}>
            <Icon name="clock" size={22} color={colors.ink2} strokeWidth={2.2} />
            <T size={16} style={{ flex: 1 }}>
              <T size={16} bold>{`${unrec.name} de las ${unrec.time} quedó sin registrar.`}</T> Si sabes qué pasó, anótalo.
            </T>
          </View>
          <Button label="Revisar en Medicación" variant="secondary" height={48} onPress={() => router.push('/nurse/medicacion')} />
        </Card>
      ) : null}

      {patient ? (
        <Card gap={14} style={{ padding: 18 }} accessibilityLabel="Paciente">
          <View style={s.patientRow}>
            <View style={s.patientTile} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <T size={24} bold color={colors.pri} lh={1.1}>{patient.full_name.trim().charAt(0).toUpperCase()}</T>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T size={18} bold>{patient.full_name}</T>
              <T size={15} color={colors.ink2}>
                {[patient.age != null ? `${patient.age} años` : '', patient.room?.trim() || 'En casa'].filter(Boolean).join(' · ')}
              </T>
            </View>
          </View>
          <View style={s.chips} accessibilityLabel="Estado y condiciones">
            {patient.status ? (
              <View style={[s.chip, s.statusChip]}>
                <Icon name="check" size={16} color={colors.pri} strokeWidth={2.8} />
                <T size={14} bold color={colors.pri}>{patient.status}</T>
              </View>
            ) : null}
            {conditions.map((c) => (
              <View key={c.condition} style={[s.chip, s.condChip]}>
                <T size={14} bold color={colors.ink2}>{CONDITIONS[c.condition]?.name ?? c.condition}</T>
              </View>
            ))}
          </View>
          <Button label="Plan de cuidados" variant="secondary" height={52} size={17} onPress={() => router.push('/plan')} />
        </Card>
      ) : null}

      <View style={{ gap: 10 }}>
        <H2>En este turno</H2>
        <RowLink title="Medicación" sub={medSub} onPress={() => router.push('/nurse/medicacion')} />
        <RowLink title="Signos vitales" sub={vitalsSub} onPress={() => router.navigate('/nurse/signos')} />
        <RowLink title="Historial" sub="Todo lo de hoy, hora a hora" onPress={() => router.navigate('/nurse/historial')} />
        <RowLink title="Relevo de turno" sub={relevoSub} onPress={() => router.navigate('/nurse/relevo')} />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { borderRadius: radius.card, padding: 20, gap: 6 },
  unrecRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  patientRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  patientTile: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.priSoft, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 12 },
  statusChip: { backgroundColor: colors.priSoft },
  condChip: { borderWidth: 1.5, borderColor: colors.line },
});
