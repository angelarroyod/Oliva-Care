import { useState, useSyncExternalStore } from 'react';
import { View, Pressable, StyleSheet, AccessibilityInfo } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, PageHeader } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Card, RowLink } from '@/components/Card';
import { Notice } from '@/components/Status';
import { Sheet } from '@/components/Sheet';
import { H2, T } from '@/components/T';
import { useAuth } from '@/features/auth/useAuth';
import { useCare } from '@/features/care/hooks';
import { useTextScale, MIN_SCALE, MAX_SCALE } from '@/features/settings/textScale';
import { dropQueued, outboxSnapshot, subscribeOutbox } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/theme';

// A− / A+: fixed-size glyphs in the prototype, so undo the text scale T applies.
function ScaleButton({ glyph, size, label, disabled, onPress }: {
  glyph: string; size: number; label: string; disabled: boolean; onPress: () => void;
}) {
  const { pct } = useTextScale();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[s.scaleBtn, disabled && { opacity: 0.4 }]}
    >
      <T size={(size * 100) / pct} bold lh={1.1}>{glyph}</T>
    </Pressable>
  );
}

export default function Settings() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { patient, short } = useCare();
  const { pct, setPct } = useTextScale();
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState(false);
  const { pending } = useSyncExternalStore(subscribeOutbox, outboxSnapshot);

  // aria-live in the design: announce on both platforms (accessibilityLiveRegion is Android-only).
  const scale = (next: number) => {
    setPct(next);
    AccessibilityInfo.announceForAccessibility?.(`${next} %`);
  };

  const leave = async () => {
    await signOut();
    router.replace('/(auth)/welcome');
  };

  const deleteAccount = async () => {
    setBusy(true);
    setDeleteErr(false);
    const { error } = await supabase.functions.invoke('delete-account');
    if (error) {
      setBusy(false);
      setDeleteErr(true);
      return;
    }
    setDeleting(false);
    await dropQueued(); // what this account saved offline goes with it
    await leave();
  };

  return (
    <Screen gap={14}>
      <PageHeader title="Configuración" size={30} onBack={() => router.back()} backLabel="Volver al perfil" />

      <Card gap={12}>
        <H2 size={17}>Tamaño del texto</H2>
        <View style={s.scaleRow}>
          <ScaleButton glyph="A−" size={18} label="Texto más pequeño" disabled={pct <= MIN_SCALE} onPress={() => scale(pct - 10)} />
          <T size={22} bold center style={s.flex}>{`${pct} %`}</T>
          <ScaleButton glyph="A+" size={24} label="Texto más grande" disabled={pct >= MAX_SCALE} onPress={() => scale(pct + 10)} />
        </View>
        <T size={16} color={colors.ink2}>Así se verá el texto en toda la app.</T>
      </Card>

      <Card gap={4}>
        <T size={15} color={colors.ink2}>Cuenta</T>
        <T size={17} bold>{session?.user.email ?? ''}</T>
      </Card>

      <RowLink title="Privacidad y aviso médico" onPress={() => router.push('/legal')} />

      {pending ? (
        <Notice tone="alert">
          {`${pending === 1 ? 'Tienes 1 registro' : `Tienes ${pending} registros`} sin enviar. Se enviará${pending === 1 ? '' : 'n'} cuando vuelvas a entrar con esta cuenta y haya conexión.`}
        </Notice>
      ) : null}
      <Pressable onPress={leave} accessibilityRole="button" style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]}>
        <T size={17} bold>Cerrar sesión</T>
      </Pressable>

      <Button label="Eliminar mi cuenta" variant="dangerOutline" onPress={() => setDeleting(true)} style={s.delete} />

      <Sheet visible={deleting} title="¿Eliminar tu cuenta?" onClose={() => { setDeleting(false); setDeleteErr(false); }}>
        <View style={s.list}>
          {[
            'Se borrarán tu cuenta y tus mensajes.',
            'No se puede deshacer.',
            `El cuidado ${patient ? `de ${short}` : 'del paciente'} seguirá para el resto del equipo.`,
          ].map((it) => (
            <View key={it} style={s.item}>
              <T size={16} style={s.bullet} accessibilityElementsHidden importantForAccessibility="no">•</T>
              <T size={16} style={s.flex}>{it}</T>
            </View>
          ))}
        </View>
        {deleteErr ? <Notice tone="alert" alert>No se pudo eliminar la cuenta.</Notice> : null}
        <Button label="Sí, eliminar mi cuenta" variant="danger" onPress={deleteAccount} disabled={busy} />
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  scaleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scaleBtn: {
    width: 56, height: 56, borderRadius: radius.input, borderCurve: 'continuous', borderWidth: 1.5, borderColor: colors.field,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  row: {
    minHeight: 64, paddingVertical: 14, paddingHorizontal: 16, justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.card, borderCurve: 'continuous',
  },
  delete: { marginTop: 8 },
  list: { gap: 8 },
  item: { flexDirection: 'row' },
  bullet: { width: 20 },
});
