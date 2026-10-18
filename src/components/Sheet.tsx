import { Modal, View, ScrollView, Pressable, StyleSheet } from 'react-native';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '@/theme';
import { T } from './T';
import { Button } from './Button';

// Bottom sheet (role=dialog, modal). Always ends with "Volver".
export function Sheet({
  visible,
  title,
  sub,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  sub?: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cerrar" accessibilityRole="button" />
        <View style={s.panel} accessibilityViewIsModal>
          <ScrollView
            contentContainerStyle={[s.content, { paddingBottom: 32 + insets.bottom }]}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <View style={{ gap: 6 }}>
              <T size={26} bold lh={1.15} accessibilityRole="header">{title}</T>
              {sub ? <T size={16} color={colors.ink2}>{sub}</T> : null}
            </View>
            {children}
            <Button label="Volver" variant="neutral" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  panel: { maxHeight: '92%', backgroundColor: colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet },
  content: { paddingTop: 24, paddingHorizontal: 22, gap: 14 },
});
