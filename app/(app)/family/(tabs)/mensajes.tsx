import { useEffect, useRef, useState } from 'react';
import { View, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform, Alert, StyleSheet, AccessibilityInfo } from 'react-native';
import { colors, font, radius } from '@/theme';
import { Screen } from '@/components/Screen';
import { T, H1 } from '@/components/T';
import { Icon } from '@/components/Icon';
import { Avatar, initialsOf } from '@/components/Avatar';
import { useTextScale } from '@/features/settings/textScale';
import { useCare, useMessages, type Message } from '@/features/care/hooks';
import { firstName, hhmm } from '@/features/care/clock';
import { onShift, shiftKind } from '@/features/care/shifts';
import { supabase } from '@/lib/supabase';
import { mutate } from '@/lib/db';

// Family · Mensajes: chat with the nurse on shift.
export default function Mensajes() {
  const { pid, meId, nurses, names, now } = useCare();
  const messages = useMessages(pid, meId);
  const { pct } = useTextScale();
  const [draft, setDraft] = useState('');
  const list = useRef<ScrollView>(null);

  const on = onShift(nurses, hhmm(now));
  const nurse = on ?? nurses[0] ?? null;
  const kind = on ? shiftKind(on) : null;
  const name = nurse?.name ?? 'Enfermera';
  const short = nurse?.short ?? 'La enfermera';
  const quick = [nurse ? `Gracias, ${nurse.short}` : 'Gracias', '¿Cómo durmió?', '¿Tiene fiebre?'];

  // Live log: read out each new incoming message (not the initial load, not my own).
  const seen = useRef<number | null>(null);
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (seen.current !== null && messages.length > seen.current && last && !last.fromSelf) {
      AccessibilityInfo.announceForAccessibility(`${firstName(names(last.senderId)) || short} dijo: ${last.body}`);
    }
    seen.current = messages.length;
  }, [messages, names, short]);

  const send = async (text: string) => {
    const body = text.trim();
    if (!body || !pid) return;
    setDraft('');
    const err = await mutate(supabase.from('messages').insert({ patient_id: pid, sender_id: meId, body }), 'messages');
    if (err) {
      setDraft(body);
      Alert.alert('No se pudo enviar', err);
    }
  };

  return (
    <Screen bottomInset={false} scroll={false}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <Avatar initials={nurse ? initialsOf(nurse.name) : '?'} size={44} />
          <View style={s.flex}>
            <H1 size={18}>{name}</H1>
            {on && kind ? (
              <View style={s.status}>
                <View style={s.dot} />
                <T size={14} bold color={colors.ok}>{`En turno ahora · enfermera de ${kind}`}</T>
              </View>
            ) : (
              <T size={14} bold color={colors.ink2} style={s.mt2}>Enfermera</T>
            )}
          </View>
        </View>

        <ScrollView
          ref={list}
          style={s.flex}
          contentContainerStyle={s.list}
          accessibilityLabel={`Mensajes con ${name}`}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((m, i) => (
            <Bubble key={i} m={m} who={firstName(names(m.senderId)) || short} />
          ))}
        </ScrollView>

        <View style={s.composer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.quick} accessibilityLabel="Respuestas rápidas">
            {quick.map((q) => (
              <Pressable key={q} onPress={() => send(q)} accessibilityRole="button" style={({ pressed }) => [s.chip, pressed && { opacity: 0.85 }]}>
                <T size={15} bold color={colors.pri}>{q}</T>
              </Pressable>
            ))}
          </ScrollView>
          <View style={s.inputRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={() => send(draft)}
              submitBehavior="submit" // keep the keyboard up for the next message
              returnKeyType="send"
              placeholder="Escribe un mensaje…"
              placeholderTextColor={colors.ink2}
              accessibilityLabel={`Escribe un mensaje a ${name}`}
              style={[s.input, { fontSize: (16 * pct) / 100 }]}
            />
            <Pressable
              onPress={() => send(draft)}
              accessibilityRole="button"
              accessibilityLabel="Enviar mensaje"
              style={({ pressed }) => [s.send, pressed && { opacity: 0.85 }]}
            >
              <Icon name="send" size={22} color={colors.white} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Bubble({ m, who }: { m: Message; who: string }) {
  const self = m.fromSelf;
  return (
    <View style={[s.bubbleWrap, { alignSelf: self ? 'flex-end' : 'flex-start' }]}>
      <View accessible accessibilityLabel={self ? `Tú dijiste: ${m.body}` : `${who} dijo: ${m.body}`} style={[s.bubble, self ? s.self : s.other]}>
        <T size={16} lh={1.4} color={self ? colors.white : colors.ink}>{m.body}</T>
      </View>
      <T size={13} color={colors.ink2} style={{ textAlign: self ? 'right' : 'left', fontVariant: ['tabular-nums'] }}>{m.time}</T>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  mt2: { marginTop: 2 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 6, paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1.5, borderBottomColor: colors.line, backgroundColor: colors.surface,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.ok },
  list: { paddingVertical: 16, paddingHorizontal: 20, gap: 12 },
  bubbleWrap: { maxWidth: '82%', gap: 4 },
  bubble: { borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 14 },
  self: {
    backgroundColor: colors.pri, borderColor: colors.pri,
    borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 6, borderBottomLeftRadius: 18,
  },
  other: {
    backgroundColor: colors.surface, borderColor: colors.line,
    borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 6,
  },
  composer: {
    backgroundColor: colors.surface, borderTopWidth: 1.5, borderTopColor: colors.line,
    paddingTop: 10, paddingHorizontal: 16, paddingBottom: 14, gap: 10,
  },
  quick: { gap: 8 },
  chip: {
    minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.pri,
    backgroundColor: colors.surface, justifyContent: 'center',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1, minWidth: 0, minHeight: 52, borderWidth: 1.5, borderColor: colors.field, borderRadius: radius.pill,
    paddingHorizontal: 18, backgroundColor: colors.surface, color: colors.ink, fontFamily: font.regular,
  },
  send: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: colors.pri, alignItems: 'center', justifyContent: 'center' },
});
