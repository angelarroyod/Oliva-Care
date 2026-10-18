import { View, ScrollView, StyleSheet, Platform } from 'react-native';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
import { ToastHost } from './Toast';
import { OfflineBanner } from './Offline';
import { H1, T } from './T';
import { BackButton } from './Button';

// Full-screen wrapper: system status bar, safe areas, scrollable content
// (padding 8/20/28, vertical rhythm via gap), the offline banner and the toast host. Pass
// scroll={false} for screens that lay out their own scroll (chat), and
// bottomInset={false} inside a tab navigator (the tab bar covers the bottom
// inset) or when the screen pads its own bottom edge.
export function Screen({
  children,
  bg = colors.bg,
  scroll = true,
  gap = 16,
  footer,
  bottomInset = true,
}: {
  children: ReactNode;
  bg?: string;
  scroll?: boolean;
  gap?: number;
  footer?: ReactNode; // pinned below the scroll area (e.g. chat composer)
  bottomInset?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const web = Platform.OS === 'web';
  const top = web ? 0 : insets.top;
  const bottom = web || !bottomInset ? 0 : insets.bottom; // keep the toast and last button off the home indicator
  return (
    <View style={[s.root, { backgroundColor: bg, paddingTop: top, paddingBottom: bottom }]}>
      <StatusBar style="dark" />
      <OfflineBanner />
      {scroll ? (
        <ScrollView
          style={s.flex}
          contentContainerStyle={[s.content, { gap }]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {children}
        </ScrollView>
      ) : (
        <View style={s.flex}>{children}</View>
      )}
      {footer}
      <ToastHost />
    </View>
  );
}

// h1 + optional sub, with an optional 48px back button on the left.
export function PageHeader({
  title,
  sub,
  onBack,
  backLabel,
  size = 32,
}: {
  title: string;
  sub?: string;
  onBack?: () => void;
  backLabel?: string;
  size?: number;
}) {
  return (
    <View style={s.header}>
      {onBack ? <BackButton onPress={onBack} label={backLabel} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: onBack ? 2 : 6 }}>
        <H1 size={onBack ? Math.min(size, 30) : size}>{title}</H1>
        {sub ? <T size={onBack ? 15 : 16} color={colors.ink2}>{sub}</T> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 28, flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
