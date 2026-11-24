import { View, ScrollView, StyleSheet, Platform } from 'react-native';
import { useContext, type ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomTabBarHeightContext } from 'expo-router/tabs';
import { NavigationContext } from 'expo-router/react-navigation';
import { SafeAreaView } from 'react-native-screens/experimental';
import { colors, scheme } from '@/theme';
import { ToastHost } from './Toast';
import { OfflineBanner } from './Offline';
import { H1, T } from './T';
import { BackButton } from './Button';
import { tabBarBottom } from './TabBarIcon';

// Full-screen wrapper: system status bar, safe areas, scrollable content
// (padding 8/20/28, vertical rhythm via gap), the offline banner and the toast host. Pass
// scroll={false} for screens that lay out their own scroll (chat), and
// bottomInset={false} inside a tab navigator (the tab bar covers the bottom
// inset) or when the screen pads its own bottom edge. On web, content scrolls
// beneath the floating glass bar and fades out where it meets it. On iOS and
// Android the system tab bar handles both: the scroll view gets its inset
// automatically, and on iOS (where the bar overlays the screen) fixed layouts
// and the toast sit in the screen's native safe area.
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
  const tabH = useContext(BottomTabBarHeightContext); // undefined outside the tab navigator
  const bar = tabH ? tabH + tabBarBottom(web ? 0 : insets.bottom) : 0; // screen height the floating JS bar (web only) covers
  const nav = useContext(NavigationContext); // undefined outside a navigator (tests)
  const sysBar = Platform.OS === 'ios' && nav?.getState()?.type === 'tab'; // iOS system tab bar over the screen
  return (
    <View style={[s.root, { backgroundColor: bg, paddingTop: top, paddingBottom: scroll ? bottom : Math.max(bottom, bar) }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <OfflineBanner />
      {scroll ? (
        <ScrollView
          style={s.flex}
          contentContainerStyle={[s.content, { gap }, bar ? { paddingBottom: bar + 20 } : null]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentInsetAdjustmentBehavior={sysBar ? 'automatic' : undefined}
        >
          {children}
        </ScrollView>
      ) : sysBar ? (
        <SafeAreaView edges={BOTTOM} style={s.flex}>{children}</SafeAreaView>
      ) : (
        <View style={s.flex}>{children}</View>
      )}
      {scroll && bar ? (
        <LinearGradient pointerEvents="none" colors={[`${bg}00`, `${bg}E6`]} style={[s.edge, { height: bar + 16 }]} />
      ) : null}
      {footer}
      {sysBar ? (
        <SafeAreaView edges={BOTTOM} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <ToastHost />
        </SafeAreaView>
      ) : (
        <ToastHost bottom={bar + 12} />
      )}
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

const BOTTOM = { bottom: true };

const s = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 28, flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  edge: { position: 'absolute', left: 0, right: 0, bottom: 0 }, // scroll edge effect under the tab bar
});
