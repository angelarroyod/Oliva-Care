import { View, StyleSheet } from 'react-native';
import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Screen, PageHeader } from '@/components/Screen';
import { Card } from '@/components/Card';
import { H2, T } from '@/components/T';

// Outside the session gate so signup can open it before an account exists.
function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <View style={s.list}>
      {items.map((it, i) => (
        <View key={i} style={s.item}>
          <T size={16} lh={1.45} style={s.bullet} accessibilityElementsHidden importantForAccessibility="no">•</T>
          <T size={16} lh={1.45} style={s.text}>{it}</T>
        </View>
      ))}
    </View>
  );
}

export default function Legal() {
  const router = useRouter();
  return (
    <Screen gap={14}>
      <PageHeader title="Privacidad y aviso médico" size={28} onBack={() => router.back()} />
      <Card>
        <H2 size={19}>Tus datos</H2>
        <Bullets
          items={[
            'Guardamos tu cuenta y lo que se anota del cuidado: signos, medicación, novedades y mensajes.',
            'Solo lo ve el equipo de cuidado del paciente.',
            'Nunca vendemos tus datos ni los usamos para publicidad.',
            'Puedes borrar tu cuenta cuando quieras, en Configuración.',
          ]}
        />
      </Card>
      <Card>
        <H2 size={19}>Aviso médico</H2>
        <Bullets
          items={[
            'Oliva sirve para anotar y compartir el cuidado.',
            'Oliva no es un aparato médico. No diagnostica ni sustituye a un profesional de la salud.',
            <T key="sos" size={16} lh={1.45} bold>En una emergencia, llama al 112.</T>,
          ]}
        />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  list: { gap: 10 },
  item: { flexDirection: 'row' },
  bullet: { width: 20 },
  text: { flex: 1 },
});
