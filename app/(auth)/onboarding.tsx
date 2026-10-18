import { useEffect, useRef, useState } from 'react';
import { View, Pressable, StyleSheet, AccessibilityInfo, type Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Button, BackButton } from '@/components/Button';
import { ErrorText, Field } from '@/components/Controls';
import { Notice } from '@/components/Status';
import { H1, T, type TProps } from '@/components/T';
import { supabase } from '@/lib/supabase';
import { normalizeInviteCode } from '@/features/auth/invite';
import { useAuth } from '@/features/auth/useAuth';
import { useTextScale } from '@/features/settings/textScale';
import { colors, font, radius } from '@/theme';

type Role = 'nurse' | 'family';
type Step = 'role' | 'patient' | 'code';

const ROLES: [Role, string, string][] = [
  ['nurse', 'Soy enfermera o enfermero', 'Anoto los signos, la medicación y cómo va el turno.'],
  ['family', 'Soy familiar', 'Quiero saber cómo está mi ser querido.'],
];
const ROLE_Q = '¿Cómo vas a usar Tend?';

// Back button + "Paso n de 3" + the 3-segment bar (decorative; the words say it).
function Steps({ n, onBack }: { n: number; onBack: () => void }) {
  return (
    <>
      <View style={s.top}>
        <BackButton onPress={onBack} />
        <T size={15} bold color={colors.ink2}>{`Paso ${n} de 3`}</T>
      </View>
      <View style={s.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[1, 2, 3].map((i) => (
          <View key={i} style={[s.seg, { backgroundColor: i <= n ? colors.pri : colors.line }]} />
        ))}
      </View>
    </>
  );
}

function RoleCard({ title, sub, selected, onPress }: { title: string; sub: string; selected: boolean; onPress: () => void }) {
  const border = selected ? colors.pri : colors.line;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      style={[s.card, { borderColor: border, backgroundColor: selected ? colors.priSoft : colors.surface }]}
    >
      <View style={s.cardText}>
        <T size={19} bold>{title}</T>
        <T size={15} color={colors.ink2}>{sub}</T>
      </View>
      <View style={[s.ring, { borderColor: border }]}>
        <View style={[s.dot, selected && { backgroundColor: colors.pri }]} />
      </View>
    </Pressable>
  );
}


export default function Onboarding() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { pct } = useTextScale();
  const [step, setStep] = useState<Step>('role');
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [room, setRoom] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const h1 = useRef<Text>(null);
  // ponytail: TProps has no `ref` type yet; React 19 passes it through T to the Text.
  const h1Ref = { ref: h1 } as unknown as TProps;

  // Steps are one route: move screen-reader focus to the new step's h1 ourselves.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (h1.current) AccessibilityInfo.sendAccessibilityEvent(h1.current, 'focus');
  }, [step]);

  const go = (next: Step) => {
    setErr('');
    setServerErr(null);
    setStep(next);
  };

  // The account already exists here, and index sends a member-less session straight
  // back to this screen, so leaving onboarding means signing out.
  const leave = async () => {
    await signOut();
    router.replace('/(auth)/welcome');
  };

  const doRole = () => {
    if (!role) return setErr('Elige una de las dos opciones.');
    go(role === 'nurse' ? 'patient' : 'code');
  };

  const doPatient = async () => {
    if (!name.trim()) return setErr('Escribe el nombre del paciente.');
    setErr('');
    setServerErr(null);
    setBusy(true);
    const { error } = await supabase.rpc('create_patient_with_nurse', {
      p_name: name.trim(),
      p_age: age ? Number(age) : null,
      p_room: room.trim() || null,
    });
    setBusy(false);
    if (error) setServerErr(error.message);
    else router.replace('/(app)/nurse/inicio');
  };

  const doCode = async () => {
    if (code.length !== 6) return setErr(`El código tiene 6 caracteres. Has escrito ${code.length}.`);
    setErr('');
    setServerErr(null);
    setBusy(true);
    const { error } = await supabase.rpc('redeem_invite', { p_code: code });
    setBusy(false);
    if (error) setServerErr('Código inválido o expirado');
    else router.replace('/(app)/family/inicio');
  };

  return (
    <Screen gap={18}>
      <View style={s.body}>
        {step === 'role' ? (
          <>
            <Steps n={2} onBack={leave} />
            <H1 {...h1Ref} size={34}>{ROLE_Q}</H1>
            <View accessibilityRole="radiogroup" accessibilityLabel={ROLE_Q} style={s.group}>
              {ROLES.map(([k, title, sub]) => (
                <RoleCard
                  key={k}
                  title={title}
                  sub={sub}
                  selected={role === k}
                  onPress={() => {
                    setRole(k);
                    setErr('');
                  }}
                />
              ))}
            </View>
            {err ? <ErrorText>{err}</ErrorText> : null}
            <View style={s.foot}>
              <Button label="Continuar" onPress={doRole} />
            </View>
          </>
        ) : step === 'patient' ? (
          <>
            <Steps n={3} onBack={() => go('role')} />
            <H1 {...h1Ref} size={34}>¿A quién vas a cuidar?</H1>
            <Field label="Nombre del paciente" value={name} onChangeText={(v) => { setName(v); setErr(''); }} autoComplete="off" error={err || undefined} />
            <Field
              label="Edad"
              value={age}
              onChangeText={(v) => setAge(v.replace(/\D/g, ''))}
              keyboardType="number-pad"
              maxLength={3}
              inputStyle={s.age}
            />
            <Field label="Habitación" optional value={room} onChangeText={setRoom} />
            {serverErr ? <Notice tone="alert" alert>{serverErr}</Notice> : null}
            <View style={s.foot}>
              <Button label="Empezar el turno" onPress={doPatient} disabled={busy} />
            </View>
          </>
        ) : (
          <>
            <Steps n={3} onBack={() => go('role')} />
            <H1 {...h1Ref} size={34}>Únete con un código</H1>
            <T size={17} lh={1.45} color={colors.ink2}>
              Pídeselo a la enfermera. Ella lo encuentra en <T size={17} lh={1.45} bold>Perfil → Invitar a la familia</T>.
            </T>
            <Field
              label="Código de invitación"
              value={code}
              onChangeText={(v) => {
                // ponytail: no maxLength, it would cut a pasted " VX7-K2P" before normalising.
                setCode(normalizeInviteCode(v).slice(0, 6));
                setErr('');
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              inputSize={28}
              inputStyle={[s.code, { letterSpacing: (28 * pct * 0.3) / 100 }]}
              hint={`6 letras o números. Llevas ${code.length}.`}
              error={err || undefined}
            />
            {serverErr ? <Notice tone="alert" alert>{serverErr}</Notice> : null}
            <View style={s.foot}>
              <Button label="Unirme al cuidado" onPress={doCode} disabled={busy} />
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  // Access screens use 24/32 padding (Screen gives 20/28); the button sits at the bottom.
  body: { flexGrow: 1, gap: 18, paddingHorizontal: 4, paddingBottom: 4 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  bar: { flexDirection: 'row', gap: 6 },
  seg: { flex: 1, height: 6, borderRadius: 9 },
  group: { gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.card, borderWidth: 2 },
  cardText: { flex: 1, gap: 4 },
  ring: { width: 28, height: 28, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: radius.pill },
  foot: { marginTop: 'auto' },
  age: { flex: 0, width: 140 },
  code: { minHeight: 64, fontFamily: font.bold, textAlign: 'center' },
});
