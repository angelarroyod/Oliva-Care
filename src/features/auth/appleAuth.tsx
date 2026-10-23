import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { radius } from '@/theme';

// Sign in with Apple needs the native module, which is absent in Expo Go.
// Render only on iOS in a native/dev build; otherwise render nothing.
const isExpoGo = Constants.appOwnership === 'expo';
// Platform.OS, not process.env.EXPO_OS: Babel inlines EXPO_OS at build time, and the
// off-iOS test in __tests__/apple-auth.test.tsx flips Platform.OS at runtime.
const enabled = Platform.OS === 'ios' && !isExpoGo;

// "Continuar con Apple": Apple's own black button, as a 56px pill. A cancelled
// sheet is not an error; anything else is reported through onError. On success
// go to "/" like the email path: index routes a new user (no membership) to onboarding.
export function AppleButton({ onError }: { onError?: (message: string) => void }) {
  const router = useRouter();
  if (!enabled) return null;
  // Lazy require so Expo Go / web / tests never load the native module.
  const AppleAuthentication = require('expo-apple-authentication');
  const signIn = async () => {
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!cred.identityToken) return;
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken });
      if (error) onError?.(error.message);
      else router.replace('/');
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code !== 'ERR_REQUEST_CANCELED') onError?.(err.message ?? String(e));
    }
  };
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={radius.pill}
      style={{ height: 56, alignSelf: 'stretch' }}
      onPress={signIn}
    />
  );
}
