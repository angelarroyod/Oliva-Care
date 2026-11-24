import { View, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { AnimatedLogo } from '@/components/AnimatedLogo';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { T } from '@/components/T';
import { colors } from '@/theme';

function Bullet({ icon, children }: { icon: IconName; children: string }) {
  return (
    <View style={s.bullet}>
      <View style={s.tile}>
        <Icon name={icon} size={20} color={colors.pri} />
      </View>
      <T size={17} style={s.bulletText}>{children}</T>
    </View>
  );
}

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <Screen bg={colors.welcome} scroll={false} bottomInset={false}>
      <ScrollView contentContainerStyle={s.scroll} bounces={false}>
        <View style={s.hero}>
          <AnimatedLogo />
          <T size={19} color={colors.ink2} center style={s.tagline}>
            Cuidado profesional en casa, con la familia al tanto.
          </T>
        </View>
        <View style={[s.panel, { paddingBottom: 32 + insets.bottom }]}>
          <T size={19} bold>Cuida a tu familiar en equipo, en un solo lugar.</T>
          <View style={s.bullets}>
            <Bullet icon="pulse">La enfermera anota cómo va el turno.</Bullet>
            <Bullet icon="heart">La familia ve cómo está, en cualquier momento.</Bullet>
          </View>
          <View style={s.actions}>
            <Button label="Crear cuenta" onPress={() => router.push('/(auth)/signup')} />
            <Button label="Ya tengo cuenta" variant="secondary" onPress={() => router.push('/(auth)/login')} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingTop: 8, paddingHorizontal: 28, paddingBottom: 40 },
  tagline: { maxWidth: 290 },
  panel: {
    backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 28, paddingHorizontal: 24, gap: 22,
  },
  bullets: { gap: 14 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  tile: { width: 36, height: 36, borderRadius: 12, borderCurve: 'continuous', backgroundColor: colors.priSoft, alignItems: 'center', justifyContent: 'center' },
  bulletText: { flex: 1, paddingTop: 6 },
  actions: { gap: 12 },
});
