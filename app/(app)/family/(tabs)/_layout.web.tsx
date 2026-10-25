import { Tabs } from 'expo-router';
import { tabOptions, useTabScreenOptions } from '@/components/TabBarIcon';

export default function FamilyTabs() {
  return (
    <Tabs screenOptions={useTabScreenOptions()}>
      <Tabs.Screen name="inicio" options={tabOptions('Estado', 'home')} />
      <Tabs.Screen name="historial" options={tabOptions('Historial', 'calendar')} />
      <Tabs.Screen name="mensajes" options={tabOptions('Mensajes', 'message')} />
      <Tabs.Screen name="perfil" options={tabOptions('Perfil', 'user')} />
    </Tabs>
  );
}
