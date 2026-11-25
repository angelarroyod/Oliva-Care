// Make fonts resolve instantly in tests without pulling native font loaders.
jest.mock('expo-font', () => ({
  __esModule: true,
  useFonts: () => [true, null],
  isLoaded: () => true,
  loadAsync: jest.fn(() => Promise.resolve()),
}));

// NetInfo's native module doesn't exist under Jest; its package ships this mock.
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock.js'));

// Worklets has no native part under Jest; both packages ship their test setup.
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
require('react-native-reanimated').setUpTests();

// Provide safe-area insets without needing a provider in unit tests.
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// No native push under Jest. Tests that care about reminders mock
// '@/features/notifications/push' themselves.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'undetermined', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'denied', canAskAgain: false })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ type: 'expo', data: 'ExponentPushToken[test]' })),
  useLastNotificationResponse: jest.fn(() => null),
  AndroidImportance: { HIGH: 4 },
}));
jest.mock('expo-device', () => ({ isDevice: false }));
