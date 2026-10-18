import { View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { T } from './T';
import { colors } from '@/theme';

// Tab: 40×4 bar on top when active, 24px stroke icon, 13px label (700 active / 400 inactive).
export function TabBarIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          width: 40, height: 4, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, marginBottom: 6,
          backgroundColor: focused ? colors.pri : 'transparent',
        }}
      />
      <Icon name={name} size={24} color={focused ? colors.pri : colors.ink2} strokeWidth={2} />
    </View>
  );
}

export const tabScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.pri,
  tabBarInactiveTintColor: colors.ink2,
  tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.line, borderTopWidth: 1.5, paddingTop: 0, minHeight: 78 },
  tabBarItemStyle: { minHeight: 64, paddingTop: 0 },
  tabBarIconStyle: { width: 40, height: 34, marginTop: 0 },
} as const;

// Options for one tab: title + icon + scaled label.
export const tabOptions = (title: string, icon: IconName) => ({
  title,
  tabBarAccessibilityLabel: title,
  tabBarIcon: ({ focused }: { focused: boolean }) => <TabBarIcon name={icon} focused={focused} />,
  tabBarLabel: ({ focused }: { focused: boolean }) => (
    <T size={13} bold={focused} color={focused ? colors.pri : colors.ink2} lh={1.2}>
      {title}
    </T>
  ),
});
