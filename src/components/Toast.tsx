import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Pressable, StyleSheet, AccessibilityInfo } from 'react-native';
import { colors, shadow } from '@/theme';
import { T } from './T';

// Global toast with an optional "Deshacer" closure; auto-dismisses after 7 s.
// State lives at the root so a toast survives navigation (save → go home →
// toast). Each <Screen> renders a <ToastHost/> so it sits above the tab bar.
export const TOAST_MS = 7000;

type ToastState = { text: string; undo?: () => void; id: number } | null;
type Ctx = { toast: ToastState; show: (text: string, undo?: () => void) => void; hide: () => void };

const ToastContext = createContext<Ctx>({ toast: null, show: () => {}, hide: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);
  const show = useCallback((text: string, undo?: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, undo, id: Date.now() });
    AccessibilityInfo.announceForAccessibility?.(text);
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <ToastContext.Provider value={{ toast, show, hide }}>{children}</ToastContext.Provider>;
}

export const useToast = () => useContext(ToastContext);

export function ToastHost() {
  const { toast, hide } = useToast();
  return (
    <View pointerEvents="box-none" style={s.host} accessibilityLiveRegion="polite">
      {toast ? (
        <View style={s.toast} accessibilityRole="summary">
          <T size={15} bold color={colors.white} lh={1.35} style={{ flex: 1 }}>
            {toast.text}
          </T>
          {toast.undo ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const undo = toast.undo;
                hide();
                undo?.();
              }}
              style={s.undo}
            >
              <T size={15} bold color={colors.white}>Deshacer</T>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  host: { position: 'absolute', left: 14, right: 14, bottom: 12 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.ink, borderRadius: 16,
    paddingVertical: 10, paddingRight: 10, paddingLeft: 16, ...shadow.toast,
  },
  undo: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
});
