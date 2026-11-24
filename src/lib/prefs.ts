import * as SecureStore from 'expo-secure-store';

// Small device-local preferences (text size). Never throws: a missing native
// module or blocked storage just means "no saved value".
export async function readPref(key: string): Promise<string | null> {
  try {
    if (process.env.EXPO_OS === 'web') return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    return (await SecureStore.getItemAsync(key)) ?? null;
  } catch {
    return null;
  }
}

export async function writePref(key: string, value: string): Promise<void> {
  try {
    if (process.env.EXPO_OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch {
    // ponytail: preference just isn't remembered; the in-memory value still applies.
  }
}
