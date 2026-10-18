import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Button, BackButton } from '@/components/Button';
import { Field, CheckRow, ErrorText } from '@/components/Controls';
import { Notice } from '@/components/Status';
import { H1, T } from '@/components/T';
import { useAuth } from '@/features/auth/useAuth';
import { colors } from '@/theme';

const EMAIL_RE = /.+@.+\..+/;
type Errs = { name?: string; email?: string; pwd?: string; accept?: string };

export default function Signup() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [errs, setErrs] = useState<Errs>({});
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Editing a field clears its written error, as in the prototype.
  const edit = (k: keyof Errs, set: (v: string) => void) => (v: string) => {
    set(v);
    setErrs((e) => ({ ...e, [k]: '' }));
  };

  const submit = async () => {
    const next: Errs = {
      name: name.trim() ? '' : 'Escribe tu nombre.',
      email: EMAIL_RE.test(email.trim()) ? '' : 'Escribe tu correo completo, por ejemplo nombre@correo.com',
      pwd: pwd.length >= 8 ? '' : 'La contraseña necesita al menos 8 letras o números.',
      accept: accepted ? '' : 'Marca la casilla para continuar.',
    };
    setErrs(next);
    setServerErr(null);
    if (Object.values(next).some(Boolean)) return;
    setBusy(true);
    const { error } = await signUp(email.trim(), pwd, name.trim());
    setBusy(false);
    if (error) setServerErr(error);
    else router.replace('/(auth)/onboarding');
  };

  return (
    <Screen gap={18}>
      <View style={s.body}>
        <View style={s.top}>
          <BackButton onPress={() => router.back()} />
          <T size={15} bold color={colors.ink2}>Paso 1 de 3</T>
        </View>
        <View style={s.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {[1, 2, 3].map((n) => (
            <View key={n} style={[s.seg, { backgroundColor: n <= 1 ? colors.pri : colors.line }]} />
          ))}
        </View>
        <H1 size={34}>Crea tu cuenta</H1>
        <Field
          label="Tu nombre"
          value={name}
          onChangeText={edit('name', setName)}
          autoComplete="name"
          textContentType="name"
          error={errs.name}
        />
        <Field
          label="Correo electrónico"
          value={email}
          onChangeText={edit('email', setEmail)}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          error={errs.email}
        />
        <Field
          label="Contraseña"
          value={pwd}
          onChangeText={edit('pwd', setPwd)}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          hint="Al menos 8 letras o números."
          error={errs.pwd}
        />
        <CheckRow
          checked={accepted}
          onPress={() => {
            setAccepted((v) => !v);
            setErrs((e) => ({ ...e, accept: '' }));
          }}
        >
          <T size={15} lh={1.45}>
            Acepto la política de privacidad. Entiendo que Tend sirve para anotar cuidados y{' '}
            <T size={15} lh={1.45} bold>no es un aparato médico</T>.
          </T>
        </CheckRow>
        <Pressable onPress={() => router.push('/legal')} accessibilityRole="link" style={s.link}>
          <T size={15} bold color={colors.pri} style={s.underline}>Leer la política de privacidad</T>
        </Pressable>
        {errs.accept ? (
          <ErrorText style={s.tight}>{errs.accept}</ErrorText>
        ) : null}
        {serverErr ? <Notice tone="alert" alert>{serverErr}</Notice> : null}
        <Button label="Continuar" onPress={submit} disabled={busy} />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  // Access screens use 24/32 padding (Screen gives 20/28).
  body: { gap: 18, paddingHorizontal: 4, paddingBottom: 4 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bar: { flexDirection: 'row', gap: 6 },
  seg: { flex: 1, height: 6, borderRadius: 9 },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: -8 },
  underline: { textDecorationLine: 'underline' },
  tight: { marginTop: -8 },
});
