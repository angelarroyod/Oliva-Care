import { createContext, use, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { colors } from '@/theme';
import { flush, invalidateAll, outboxSnapshot, setOnline, subscribeOutbox } from '@/lib/db';
import { Icon } from './Icon';
import { T } from './T';
import { useToast } from './Toast';

type Role = 'nurse' | 'family' | 'doctor';
const RoleContext = createContext<Role | null>(null);

// On web NetInfo checks reachability with a GET to '/', which is a 404 when the
// app is served under a base path (the GitHub Pages demo at /<repo>/) and would
// read as offline. Check the app's own root instead ('' in dev).
if (process.env.EXPO_OS === 'web') NetInfo.configure({ reachabilityUrl: `${process.env.EXPO_BASE_URL ?? ''}/` });

const records = (n: number) => (n === 1 ? '1 registro' : `${n} registros`);

export function flushText({ sent, failed }: { sent: number; failed: number }) {
  return [
    'Conexión recuperada.',
    sent ? (sent === 1 ? 'Se envió 1 registro.' : `Se enviaron ${sent} registros.`) : '',
    failed ? (failed === 1 ? 'No se pudo enviar 1 registro.' : `No se pudieron enviar ${failed} registros.`) : '',
  ].filter(Boolean).join(' ');
}

// Mounted once inside the signed-in app: follows the connection, sends the
// outbox when it comes back and says how many records went out.
export function OfflineSync({ role, children }: { role: Role; children: ReactNode }) {
  const { show } = useToast();
  useEffect(
    () =>
      NetInfo.addEventListener(async (s) => {
        // null = not checked yet; only a definite "no" counts as offline.
        const on = s.isConnected !== false && s.isInternetReachable !== false;
        const back = setOnline(on) && on;
        if (!on) return;
        const r = await flush();
        if (r.sent || r.failed) show(flushText(r));
        if (back) invalidateAll();
      }),
    [show],
  );
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

// Dark strip at the top of every signed-in screen while there's no connection.
export function OfflineBanner() {
  const role = use(RoleContext);
  const { online, pending } = useSyncExternalStore(subscribeOutbox, outboxSnapshot);
  if (!role || online) return null;
  const text =
    role === 'family'
      ? 'Estás viendo lo último que se guardó. Se actualizará al volver la conexión.'
      : 'Lo que anotes se guarda en el teléfono y se enviará al volver la conexión.';
  return (
    <View style={s.bar} accessibilityRole="summary" accessibilityLiveRegion="polite">
      <View style={s.icon}>
        <Icon name="wifiOff" size={20} color={colors.surface} />
      </View>
      <T size={15} lh={1.35} color={colors.surface} style={s.flex}>
        <T size={15} bold color={colors.surface}>Sin conexión.</T>
        {` ${text}`}
        {pending ? ` ${records(pending)} ${pending === 1 ? 'pendiente' : 'pendientes'} de enviar.` : ''}
      </T>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: colors.ink },
  icon: { marginTop: 1 },
  flex: { flex: 1 },
});
