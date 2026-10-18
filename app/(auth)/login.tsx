import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Button, BackButton } from '@/components/Button';
import { Field } from '@/components/Controls';
import { Notice } from '@/components/Status';
import { H1, T } from '@/components/T';
import { useToast } from '@/components/Toast';
import { AppleButton } from '@/features/auth/appleAuth';
import { useAuth } from '@/features/auth/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/theme';

const EMAIL_RE = /.+@.+\..+/;
const EMAIL_ERR = 'Escribe tu correo completo, por ejemplo nombre@correo.com';

export default function Login() {
  const { signIn } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [errs, setErrs] = useState<{ email?: string; pwd?: string }>({});
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mail = email.trim();
  const emailOk = EMAIL_RE.test(mail);
  // Editing a field clears its written error, as in the prototype.
  const edit = (k: 'email' | 'pwd', set: (v: string) => void) => (v: string) => {
    set(v);
    setErrs((e) => ({ ...e, [k]: '' }));
  };

  const submit = async () => {
    const next = { email: emailOk ? '' : EMAIL_ERR, pwd: pwd ? '' : 'Escribe tu contraseña.' };
    setErrs(next);
    setServerErr(null);
    if (next.email || next.pwd) return;
    setBusy(true);
    const { error } = await signIn(mail, pwd);
    setBusy(false);
    if (error) setServerErr(error);
    else router.replace('/');
  };

  const forgot = async () => {
    if (!emailOk) return toast.show('Escribe tu correo y te enviaremos un enlace.');
    const { error } = await supabase.auth.resetPasswordForEmail(mail);
    toast.show(error ? error.message : `Te enviamos un enlace a ${mail}.`);
  };

  return (
    <Screen gap={20}>
      <View style={s.body}>
        <BackButton onPress={() => router.back()} />
        <H1 size={36}>Entrar</H1>
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
          secureTextEntry={!showPwd}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          error={errs.pwd}
          right={
            <Pressable
              onPress={() => setShowPwd((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ selected: showPwd }}
              style={s.toggle}
            >
              <T size={15} bold color={colors.pri}>{showPwd ? 'Ocultar' : 'Mostrar'}</T>
            </Pressable>
          }
        />
        <Pressable onPress={forgot} accessibilityRole="button" style={s.link}>
          <T size={16} bold color={colors.pri} style={s.underline}>¿Olvidaste tu contraseña?</T>
        </Pressable>
        {serverErr ? <Notice tone="alert" alert>{serverErr}</Notice> : null}
        <Button label="Entrar" onPress={submit} disabled={busy} />
        <AppleButton onError={setServerErr} />
        <View style={s.alt}>
          <T size={16} color={colors.ink2}>¿Primera vez?</T>
          <Pressable onPress={() => router.replace('/(auth)/signup')} accessibilityRole="button" style={s.altLink}>
            <T size={16} bold color={colors.pri} style={s.underline}>Crear cuenta</T>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  // Access screens use 24/32 padding (Screen gives 20/28).
  body: { gap: 20, paddingHorizontal: 4, paddingBottom: 4 },
  toggle: {
    minWidth: 92, minHeight: 56, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.input,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12,
  },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  alt: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  altLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
});
