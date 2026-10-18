import { View, Linking, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/theme';
import { Screen } from '@/components/Screen';
import { T, H1, H2 } from '@/components/T';
import { Button } from '@/components/Button';
import { Card, RowLink } from '@/components/Card';
import { Notice } from '@/components/Status';
import { useTextScale } from '@/features/settings/textScale';
import { useCare, useConditions } from '@/features/care/hooks';
import { lc } from '@/features/care/clock';
import { CONDITIONS, CONDITION_ORDER } from '@/features/care/vitals';
import { shiftKind } from '@/features/care/shifts';
import type { MemberRow } from '@/features/care/types';

// Family · Perfil de {paciente}: allergies, conditions, contacts, emergency.
const ROLE_NAME = { nurse: 'Enfermera', doctor: 'Médico', family: 'Familia' } as const;

// ponytail: phone numbers aren't stored yet, so "Llamar" opens the dialer empty.
const call = (url: string) => Linking.openURL(url).catch(() => {});

export default function Perfil() {
  const router = useRouter();
  const { pid, meId, patient, team, nurses } = useCare();
  const conditions = useConditions(pid);
  const { pct } = useTextScale();

  const fullName = patient?.full_name?.trim() || 'Paciente';
  const sub = [patient?.age != null ? `${patient.age} años` : '', 'en casa', lc(patient?.status?.trim() || 'Estable')]
    .filter(Boolean)
    .join(' · ');
  const allergies = (patient?.allergies ?? []).map((a) => a.trim()).filter(Boolean).join(', ');
  const conds = [...conditions].sort((a, b) => CONDITION_ORDER.indexOf(a.condition) - CONDITION_ORDER.indexOf(b.condition));
  const roleLine = (m: MemberRow) => {
    if (m.role !== 'nurse') return ROLE_NAME[m.role];
    const n = nurses.find((x) => x.id === m.profile_id);
    const kind = n ? shiftKind(n) : null;
    return kind ? `Enfermera de ${kind}` : 'Enfermera';
  };
  const contacts = team.filter((m) => m.profile_id !== meId);

  return (
    <Screen bottomInset={false} gap={14}>
      <View style={s.header}>
        <View style={s.tile} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {/* Fixed 28px like the prototype: undo the in-app scale so it fits the 60px tile. */}
          <T size={(28 * 100) / pct} bold color={colors.pri} allowFontScaling={false}>{(fullName[0] ?? '?').toUpperCase()}</T>
        </View>
        <View style={s.flex}>
          <H1 size={24}>{fullName}</H1>
          <T size={15} color={colors.ink2} style={s.mt2}>{sub}</T>
        </View>
      </View>

      {allergies ? <Notice tone="alert" icon="warn">{`Alergias: ${allergies}`}</Notice> : null}

      <Card gap={10}>
        <H2 size={17}>Condiciones</H2>
        {conds.length ? (
          <View style={s.list}>
            {conds.map((c) => (
              <View key={c.condition} style={s.bullet}>
                <T size={16} lh={1.4}>•</T>
                <T size={16} lh={1.4} style={s.flex}>{CONDITIONS[c.condition].name}</T>
              </View>
            ))}
          </View>
        ) : (
          <T size={16} color={colors.ink2}>Sin condiciones anotadas.</T>
        )}
        <Button label="Ver plan de cuidados" variant="secondary" height={48} onPress={() => router.push('/plan')} />
      </Card>

      {contacts.length ? (
        <Card gap={6}>
          <H2 size={17} style={s.mb4}>Contactos</H2>
          {contacts.map((m) => {
            const name = m.profiles?.full_name?.trim() || ROLE_NAME[m.role];
            return (
              <View key={m.id} style={s.contact}>
                <View style={s.flex}>
                  <T size={16} bold>{name}</T>
                  <T size={14} color={colors.ink2} style={s.mt2}>{roleLine(m)}</T>
                </View>
                <Button
                  label="Llamar"
                  icon="phone"
                  variant="secondary"
                  height={48}
                  accessibilityLabel={`Llamar a ${name}`}
                  onPress={() => call('tel:')}
                  style={s.callBtn}
                />
              </View>
            );
          })}
        </Card>
      ) : null}

      <Button label="Emergencia: llamar al 112" variant="danger" onPress={() => call('tel:112')} />
      <RowLink title="Configuración y tamaño de texto" onPress={() => router.push('/settings')} />
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  mt2: { marginTop: 2 },
  mb4: { marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tile: { width: 60, height: 60, borderRadius: 20, backgroundColor: colors.priSoft, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 6 },
  bullet: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  callBtn: { alignSelf: 'center', paddingHorizontal: 16 },
});
