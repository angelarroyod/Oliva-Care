import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { AtkinsonHyperlegibleNext_400Regular } from '@expo-google-fonts/atkinson-hyperlegible-next/400Regular';
import { AtkinsonHyperlegibleNext_700Bold } from '@expo-google-fonts/atkinson-hyperlegible-next/700Bold';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { TextScaleProvider } from '@/features/settings/textScale';
import { ToastProvider } from '@/components/Toast';
import { colors } from '@/theme';

export default function RootLayout() {
  const [loaded] = useFonts({
    AtkinsonHyperlegibleNext_400Regular,
    AtkinsonHyperlegibleNext_700Bold,
    BricolageGrotesque_800ExtraBold,
  });
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <TextScaleProvider>
        <ToastProvider>
          <AuthProvider>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
          </AuthProvider>
        </ToastProvider>
      </TextScaleProvider>
    </SafeAreaProvider>
  );
}
