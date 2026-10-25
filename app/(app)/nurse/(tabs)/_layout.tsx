import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { colors } from '@/theme';

// iOS and Android get the system tab bar (Liquid Glass on iOS 26, Material 3 on
// Android): side placement, minimize on scroll and the Large Content Viewer come
// with it. Web keeps the glass capsule in _layout.web.tsx.
export default function NurseTabs() {
  return (
    <NativeTabs tintColor={colors.pri} iconColor={{ default: colors.ink2, selected: colors.pri }} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="inicio">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label>Inicio</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="signos">
        <NativeTabs.Trigger.Icon sf={{ default: 'waveform.path.ecg', selected: 'waveform.path.ecg.rectangle.fill' }} md="monitor_heart" />
        <NativeTabs.Trigger.Label>Signos</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="historial">
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
        <NativeTabs.Trigger.Label>Historial</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="relevo">
        <NativeTabs.Trigger.Icon sf={{ default: 'list.clipboard', selected: 'list.clipboard.fill' }} md="assignment" />
        <NativeTabs.Trigger.Label>Relevo</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="perfil">
        <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} md="person" />
        <NativeTabs.Trigger.Label>Perfil</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
