import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { errorText } from '@/lib/errors';
import { readPref, writePref } from '@/lib/prefs';

// Dose reminders on this phone. The server (supabase/functions/dose-reminders)
// decides when and to whom; the phone only registers its Expo push token in
// push_tokens. Opt-in from Configuración, never asked at launch.
//
// Token writes go straight to the server, not through mutate()'s outbox: a
// queued registration could replay after someone else signs in on this phone.
// A failed one is retried at the next launch (refreshReminders).

export const CHANNEL = 'dosis'; // channelId the Edge Function sends
const PREF = 'oliva.pushToken'; // the registered token; '' when reminders are off
export const REMINDER_ROUTES = ['/nurse/medicacion'] as const;

export type PushState = 'unsupported' | 'off' | 'on' | 'denied';

const projectId = (): string | undefined =>
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;

// Remote push needs a native build on a real phone: not web, not a simulator,
// not Expo Go, and an EAS project id for the Expo token.
export const pushSupported = () =>
  Platform.OS !== 'web' &&
  Device.isDevice &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient &&
  !!projectId();

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

// Where a tapped reminder opens. Only known screens: the payload comes from the network.
export function routeFromNotification(data: unknown): (typeof REMINDER_ROUTES)[number] | null {
  const url = (data as { url?: unknown } | null | undefined)?.url;
  return REMINDER_ROUTES.find((r) => r === url) ?? null;
}

async function channel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Recordatorios de dosis',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
}

export async function reminderState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const token = await readPref(PREF);
  if (!token) return 'off';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'on' : 'denied';
}

async function register(): Promise<string | null> {
  await channel();
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
  const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  if (error) return errorText(error, 'No se pudieron activar los recordatorios. Vuelve a intentarlo.');
  await writePref(PREF, token);
  return null;
}

// Asks for permission if needed, then registers this phone.
export async function enableReminders(): Promise<{ state: PushState; error: string | null }> {
  if (!pushSupported()) return { state: 'unsupported', error: null };
  try {
    let { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && canAskAgain) ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return { state: 'denied', error: null };
    const error = await register();
    return { state: error ? 'off' : 'on', error };
  } catch {
    return { state: 'off', error: 'No se pudieron activar los recordatorios. Comprueba internet y vuelve a intentarlo.' };
  }
}

// Stops reminders on this phone. Also called before signing out, while the
// session can still delete its own row.
export async function disableReminders(): Promise<string | null> {
  const token = await readPref(PREF);
  if (!token) return null;
  try {
    const { error } = await supabase.from('push_tokens').delete().eq('token', token);
    if (error) return errorText(error, 'No se pudieron desactivar los recordatorios. Vuelve a intentarlo.');
  } catch {
    return 'No se pudieron desactivar los recordatorios. Comprueba internet y vuelve a intentarlo.';
  }
  await writePref(PREF, '');
  return null;
}

// At launch: tokens can change (reinstall, restore), so register again if on.
export async function refreshReminders(): Promise<void> {
  try {
    if ((await reminderState()) === 'on') await register();
  } catch {
    // ponytail: offline at launch; the next launch tries again.
  }
}

// Before signing out: the next account on this phone has to turn reminders on
// itself. ponytail: offline, the old row stays until another account registers
// this phone (register_push_token moves it) or Expo reports it gone.
export async function forgetReminders(): Promise<void> {
  if (Platform.OS === 'web') return;
  await disableReminders().catch(() => null);
  await writePref(PREF, '');
}
