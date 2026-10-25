import { Tabs } from 'expo-router';
import { tabOptions, useTabScreenOptions } from '@/components/TabBarIcon';

export default function NurseTabs() {
  return (
    <Tabs screenOptions={useTabScreenOptions()}>
      <Tabs.Screen name="inicio" options={tabOptions('Inicio', 'home')} />
      <Tabs.Screen name="signos" options={tabOptions('Signos', 'pulse')} />
      <Tabs.Screen name="historial" options={tabOptions('Historial', 'calendar')} />
      <Tabs.Screen name="relevo" options={tabOptions('Relevo', 'clipboard')} />
      <Tabs.Screen name="perfil" options={tabOptions('Perfil', 'user')} />
    </Tabs>
  );
}
