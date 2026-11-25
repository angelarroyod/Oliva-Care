import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const mockRpc = jest.fn();
const mockDelete = jest.fn();
const mockPrefs: Record<string, string> = {};
let mockIsDevice = true;
let mockProjectId: string | undefined = 'proj-1';
let mockEnv = 'bare';

jest.mock('expo-device', () => ({ get isDevice() { return mockIsDevice; } }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
  default: {
    get executionEnvironment() { return mockEnv; },
    get expoConfig() { return { extra: { eas: { projectId: mockProjectId } } }; },
    easConfig: null,
  },
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: () => ({ delete: () => ({ eq: (...a: unknown[]) => mockDelete(...a) }) }),
  },
}));
jest.mock('@/lib/prefs', () => ({
  readPref: (k: string) => Promise.resolve(mockPrefs[k] ?? null),
  writePref: (k: string, v: string) => { mockPrefs[k] = v; return Promise.resolve(); },
}));

import { disableReminders, enableReminders, forgetReminders, pushSupported, reminderState, routeFromNotification } from '@/features/notifications/push';

const N = Notifications as jest.Mocked<typeof Notifications>;
const perm = (status: string, canAskAgain = true) => ({ status, canAskAgain }) as unknown as Notifications.NotificationPermissionsStatus;

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockPrefs)) delete mockPrefs[k];
  mockIsDevice = true;
  mockProjectId = 'proj-1';
  mockEnv = 'bare';
  mockRpc.mockResolvedValue({ error: null });
  mockDelete.mockResolvedValue({ error: null });
  N.getPermissionsAsync.mockResolvedValue(perm('undetermined'));
  N.requestPermissionsAsync.mockResolvedValue(perm('granted'));
});

test('only known screens open from a notification', () => {
  expect(routeFromNotification({ url: '/nurse/medicacion' })).toBe('/nurse/medicacion');
  expect(routeFromNotification({ url: 'https://evil.example' })).toBeNull();
  expect(routeFromNotification(null)).toBeNull();
});

test('unsupported in Expo Go, on simulators, on web and without an EAS project', () => {
  expect(pushSupported()).toBe(true);
  mockEnv = 'storeClient';
  expect(pushSupported()).toBe(false);
  mockEnv = 'bare';
  mockIsDevice = false;
  expect(pushSupported()).toBe(false);
  mockIsDevice = true;
  mockProjectId = undefined;
  expect(pushSupported()).toBe(false);
  mockProjectId = 'proj-1';
  const os = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
  expect(pushSupported()).toBe(false);
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
});

test('enable asks permission, registers the token and remembers it', async () => {
  expect(await reminderState()).toBe('off');
  expect(await enableReminders()).toEqual({ state: 'on', error: null });
  expect(N.requestPermissionsAsync).toHaveBeenCalled();
  expect(N.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'proj-1' });
  expect(mockRpc).toHaveBeenCalledWith('register_push_token', { p_token: 'ExponentPushToken[test]', p_platform: Platform.OS });
  N.getPermissionsAsync.mockResolvedValue(perm('granted'));
  expect(await reminderState()).toBe('on');
});

test('permission refused: nothing registered', async () => {
  N.requestPermissionsAsync.mockResolvedValue(perm('denied', false));
  expect(await enableReminders()).toEqual({ state: 'denied', error: null });
  expect(mockRpc).not.toHaveBeenCalled();
});

test('a failed registration is written out in Spanish and stays off', async () => {
  mockRpc.mockResolvedValue({ error: { code: 'XX000', message: 'boom' } });
  const r = await enableReminders();
  expect(r.state).toBe('off');
  expect(r.error).toBe('No se pudieron activar los recordatorios. Vuelve a intentarlo.');
  expect(await reminderState()).toBe('off');
});

test('disable deletes this phone token; sign-out forgets it even when the delete fails', async () => {
  await enableReminders();
  expect(await disableReminders()).toBeNull();
  expect(mockDelete).toHaveBeenCalledWith('token', 'ExponentPushToken[test]');
  expect(await reminderState()).toBe('off');

  await enableReminders();
  mockDelete.mockRejectedValue(new Error('offline'));
  await forgetReminders();
  expect(await reminderState()).toBe('off');
});
