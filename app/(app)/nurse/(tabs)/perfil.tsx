import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { T, H1 } from '@/components/T';
import { Avatar, initialsOf } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card, RowLink } from '@/components/Card';
import { ErrorText, Field } from '@/components/Controls';
import { useToast } from '@/components/Toast';
import { useCare } from '@/features/care/hooks';
import { shiftKind, shiftLabel } from '@/features/care/shifts';
import { parseTimes } from '@/features/care/doses';
import { generateInviteCode } from '@/features/auth/invite';
import { supabase } from '@/lib/supabase';
import { mutate, saved } from '@/lib/db';
import { colors } from '@/theme';

const TIME_ERROR = 'Escribe una hora, por ejemplo 22:00.';
// One 'HH:MM' or null.
const oneTime = (text: string) => {
  const t = parseTimes(text);
  return t && t.length === 1 ? t[0] : null;
};

export default function NursePerfil() {
  const router = useRouter();
  const toast = useToast();
  const { pid, meId, myName, meNurse, short } = useCare();
  const kind = meNurse ? shiftKind(meNurse) : null;

  // Shift editor (not in the prototype: real nurses set their own window).
  const [editing, setEditing] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [errors, setErrors] = useState<{ from?: string; to?: string }>({});
  const [saving, setSaving] = useState(false);
  const [shiftErr, setShiftErr] = useState<string | null>(null);
  const [codeErr, setCodeErr] = useState<string | null>(null);

  // Invite code: the newest unexpired, unaccepted family invite.
  const [code, setCode] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadInvite = useCallback(async () => {
    if (!pid) return;
    const { data } = await supabase
      .from('invites')
      .select('code')
      .eq('patient_id', pid)
      .eq('role', 'family')
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setCode(data?.code ?? null);
    setLoaded(true);
  }, [pid]);

  useEffect(() => {
    loadInvite();
  }, [loadInvite]);

  function openEditor() {
    setFrom(meNurse?.start ?? '');
    setTo(meNurse?.end ?? '');
    setErrors({});
    setShiftErr(null);
    setEditing(true);
  }

  async function saveShift(start: string | null, end: string | null) {
    if (!pid || saving) return;
    setSaving(true);
    const err = await mutate(supabase.rpc('set_my_shift', { p_patient: pid, p_start: start, p_end: end }), 'care_memberships');
    setSaving(false);
    if (err) return setShiftErr(err);
    setEditing(false);
    toast.show(saved('Turno guardado.'));
  }

  function submitShift() {
    const start = oneTime(from);
    const end = oneTime(to);
    setErrors({ from: start ? undefined : TIME_ERROR, to: end ? undefined : TIME_ERROR });
    if (start && end) saveShift(start, end);
  }

  async function createCode() {
    if (!pid || saving) return;
    setSaving(true);
    const next = generateInviteCode();
    const err = await mutate(
      supabase.from('invites').insert({ patient_id: pid, code: next, role: 'family', invited_by: meId }),
      'invites',
    );
    setSaving(false);
    if (err) return setCodeErr(err);
    setCodeErr(null);
    setCode(next);
  }

  return (
    <Screen bottomInset={false} gap={14}>
      <H1>Perfil</H1>

      <View style={s.me}>
        <Avatar initials={initialsOf(myName || '?')} size={60} rounded={20} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={19} bold>{myName}</T>
          <T size={15} color={colors.ink2}>
            {kind && meNurse ? `Enfermera · turno de ${kind}, ${meNurse.start} a ${meNurse.end}` : 'Enfermera · sin turno fijo'}
          </T>
        </View>
      </View>

      <Card gap={12}>
        <T size={17} bold>Tu turno</T>
        <T size={15} color={colors.ink2}>{meNurse ? shiftLabel(meNurse) : 'Sin turno fijo'}</T>
        {editing ? (
          <>
            <View style={s.fields}>
              <Field
                label="Empieza" value={from} onChangeText={setFrom} placeholder="22:00" error={errors.from}
                keyboardType="numbers-and-punctuation" maxLength={5} style={{ flex: 1 }}
              />
              <Field
                label="Termina" value={to} onChangeText={setTo} placeholder="06:00" error={errors.to}
                keyboardType="numbers-and-punctuation" maxLength={5} style={{ flex: 1 }}
              />
            </View>
            {shiftErr ? <ErrorText>{shiftErr}</ErrorText> : null}
            <Button label="Guardar turno" onPress={submitShift} disabled={saving} />
            {kind ? <Button label="Quitar turno fijo" variant="neutral" onPress={() => saveShift(null, null)} disabled={saving} /> : null}
            <Button label="Cancelar" variant="neutral" height={52} onPress={() => setEditing(false)} />
          </>
        ) : (
          <Button label="Cambiar turno" variant="secondary" height={52} onPress={openEditor} disabled={!pid} />
        )}
      </Card>

      <Card gap={12}>
        <T size={17} bold>Invitar a la familia</T>
        <T size={15} color={colors.ink2}>{`Comparte este código para que sigan el cuidado de ${short}.`}</T>
        {code ? (
          <>
            <View style={s.code} accessible accessibilityLabel={`Código ${code.split('').join(' ')}`}>
              <T size={30} bold center style={{ letterSpacing: 30 * 0.3 }}>{code}</T>
            </View>
            <Button
              label="Compartir código"
              variant="secondary"
              height={52}
              size={17}
              onPress={() => Share.share({ message: `Únete al cuidado de ${short} en Oliva. Código: ${code}` })}
            />
          </>
        ) : loaded ? (
          <>
            {codeErr ? <ErrorText>{codeErr}</ErrorText> : null}
            <Button label="Crear código" onPress={createCode} disabled={saving} />
          </>
        ) : null}
      </Card>

      <RowLink title="Configuración y tamaño de texto" onPress={() => router.push('/settings')} />
    </Screen>
  );
}

const s = StyleSheet.create({
  me: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  fields: { flexDirection: 'row', gap: 12 },
  code: { padding: 10, borderRadius: 12, borderCurve: 'continuous', backgroundColor: colors.bg },
});
