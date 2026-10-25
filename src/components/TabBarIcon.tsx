import { useWindowDimensions } from 'react-native';
import type { BottomTabNavigationOptions } from 'expo-router/tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './Icon';
import { T } from './T';
import { GlassFill } from './Glass';
import { colors, glass, radius, shadow } from '@/theme';
import { useTextScale } from '@/features/settings/textScale';

// Tab: 24px stroke icon, 13px label (700 active / 400 inactive). The selected
// tab sits in a soft olive lens; colour is never the only cue (weight + lens).
export function TabBarIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return <Icon name={name} size={24} color={focused ? colors.pri : colors.ink2} strokeWidth={focused ? 2.4 : 2} />;
}

// The bar floats above content like the iOS 26 tab bar: a glass capsule
// inset from the screen edges, content scrolling beneath it.
export const tabBarBottom = (insetBottom: number) => Math.max(insetBottom - 10, 12);
const TAB_RADIUS = 32;
// Tab titles stay small, as on iOS (typography.md): they ignore the in-app
// text size and follow the OS size only up to 1.3×. The bar grows to fit.
const TAB_FONT_CAP = 1.3;

export function useTabScreenOptions(): BottomTabNavigationOptions {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const height = 50 + Math.round(13 * 1.2 * Math.min(fontScale, TAB_FONT_CAP)); // icon + label line, 66 at 1×
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.pri,
    tabBarInactiveTintColor: colors.ink2,
    tabBarActiveBackgroundColor: glass.selected,
    tabBarBackground: () => <GlassFill radius={TAB_RADIUS} />,
    tabBarStyle: {
      position: 'absolute', left: 12, right: 12, bottom: tabBarBottom(insets.bottom),
      height, paddingTop: 0, paddingBottom: 0, paddingHorizontal: 6,
      borderRadius: TAB_RADIUS, borderTopWidth: 0, backgroundColor: 'transparent', ...shadow.float,
    },
    tabBarItemStyle: { marginVertical: 6, borderRadius: radius.pill, overflow: 'hidden', minHeight: 44 }, // clip the lens (painted on the inner button) to the pill
    tabBarIconStyle: { marginTop: 2 },
  };
}

function TabLabel({ title, focused }: { title: string; focused: boolean }) {
  const { pct } = useTextScale();
  return (
    <T size={(13 * 100) / pct} bold={focused} color={focused ? colors.pri : colors.ink2} lh={1.2} maxFontSizeMultiplier={TAB_FONT_CAP}>
      {title}
    </T>
  );
}

// Options for one tab: title + icon + label.
export const tabOptions = (title: string, icon: IconName) => ({
  title,
  tabBarAccessibilityLabel: title,
  tabBarIcon: ({ focused }: { focused: boolean }) => <TabBarIcon name={icon} focused={focused} />,
  tabBarLabel: ({ focused }: { focused: boolean }) => <TabLabel title={title} focused={focused} />,
});
