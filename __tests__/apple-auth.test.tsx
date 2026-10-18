import { createElement, type ReactElement } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

const mockSignInAsync = jest.fn();
const mockIdToken = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

const OS = Platform.OS;
afterEach(() => {
  Platform.OS = OS;
  jest.clearAllMocks();
});

test('AppleButton renders nothing off iOS', () => {
  // Force a non-iOS platform before the module computes its enabled flag.
  Platform.OS = 'android';
  const { AppleButton } = require('@/features/auth/appleAuth');
  const { toJSON } = render(<AppleButton />);
  expect(toJSON()).toBeNull();
});

// Fresh module registry: the enabled flag is computed at import time (jest-expo defaults to iOS).
function loadIos() {
  let AppleButton!: (p: { onError?: (m: string) => void }) => ReactElement | null;
  jest.isolateModules(() => {
    jest.doMock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
    jest.doMock('expo-constants', () => ({ __esModule: true, default: { appOwnership: null } }));
    jest.doMock('@/lib/supabase', () => ({ supabase: { auth: { signInWithIdToken: (a: unknown) => mockIdToken(a) } } }));
    jest.doMock('expo-apple-authentication', () => ({
      signInAsync: (a: unknown) => mockSignInAsync(a),
      AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
      AppleAuthenticationButtonType: { CONTINUE: 1 },
      AppleAuthenticationButtonStyle: { BLACK: 2 },
      // Host element only: no hooks from the isolated React copy.
      AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) => createElement('RCTView', { testID: 'apple', onPress }),
    }));
    AppleButton = require('@/features/auth/appleAuth').AppleButton;
  });
  return AppleButton;
}

test('iOS: exchanges the Apple token with Supabase and goes to "/"', async () => {
  const AppleButton = loadIos();
  mockSignInAsync.mockResolvedValue({ identityToken: 'tok' });
  mockIdToken.mockResolvedValue({ error: null });
  const onError = jest.fn();
  render(<AppleButton onError={onError} />);
  fireEvent.press(screen.getByTestId('apple'));
  await waitFor(() => expect(mockIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'tok' }));
  // index then sends a first-time Apple user (no membership yet) to onboarding.
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  expect(onError).not.toHaveBeenCalled();
});

test('iOS: a Supabase error is reported and does not navigate', async () => {
  const AppleButton = loadIos();
  mockSignInAsync.mockResolvedValue({ identityToken: 'tok' });
  mockIdToken.mockResolvedValue({ error: { message: 'Token inválido' } });
  const onError = jest.fn();
  render(<AppleButton onError={onError} />);
  fireEvent.press(screen.getByTestId('apple'));
  await waitFor(() => expect(onError).toHaveBeenCalledWith('Token inválido'));
  expect(mockReplace).not.toHaveBeenCalled();
});

test('iOS: a cancelled sheet is silent, other failures are reported', async () => {
  const AppleButton = loadIos();
  const onError = jest.fn();
  render(<AppleButton onError={onError} />);
  mockSignInAsync.mockRejectedValueOnce({ code: 'ERR_REQUEST_CANCELED', message: 'cancelled' });
  fireEvent.press(screen.getByTestId('apple'));
  await waitFor(() => expect(mockSignInAsync).toHaveBeenCalledTimes(1));
  mockSignInAsync.mockRejectedValueOnce({ code: 'ERR_REQUEST_FAILED', message: 'Apple falló' });
  fireEvent.press(screen.getByTestId('apple'));
  await waitFor(() => expect(onError).toHaveBeenCalledWith('Apple falló'));
  expect(onError).toHaveBeenCalledTimes(1);
  expect(mockReplace).not.toHaveBeenCalled();
});
