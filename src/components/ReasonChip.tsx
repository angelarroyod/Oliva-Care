import { Pressable, View, StyleSheet } from 'react-native';
import { colors, radius } from '@/theme';
import { T } from './T';
import { Icon } from './Icon';

// Radio-style reason chip ("¿Por qué no se dio?"): 24px ring with a check when selected.
export function ReasonChip({
  label,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const ring = selected ? colors.pri : disabled ? colors.line : colors.field;
  return (
    <Pressable
      onPress={onSelect}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        s.chip,
        selected
          ? { borderWidth: 2, borderColor: colors.pri, backgroundColor: colors.priSoft }
          : { borderWidth: 1.5, borderColor: disabled ? colors.line : colors.field, backgroundColor: colors.surface },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      <View style={[s.ring, { borderColor: ring, backgroundColor: selected ? colors.pri : colors.surface }]}>
        {selected ? <Icon name="check" size={14} color={colors.onPri} strokeWidth={3.2} /> : null}
      </View>
      <T size={16} bold lh={1.25} color={disabled ? colors.ink2 : colors.ink} style={s.label}>
        {label}
      </T>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chip: {
    minHeight: 52, paddingVertical: 10, paddingLeft: 12, paddingRight: 16, borderRadius: radius.pill,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  ring: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  label: { flexShrink: 1 },
});
