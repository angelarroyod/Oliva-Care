import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Pressable, StyleSheet, AccessibilityInfo } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, ReduceMotion, useReducedMotion } from 'react-native-reanimated';
import { colors, shadow } from '@/theme';
import { T } from './T';

// The toast rises 25 px and fades in (200 ms, strong ease-out) and fades out
// in place (150 ms). Reduce Motion keeps the fade and drops the rise.
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const ENTER = FadeInDown.duration(200).easing(EASE_OUT);
const ENTER_REDUCED = FadeIn.duration(200).easing(EASE_OUT).reduceMotion(ReduceMotion.Never);
const EXIT = FadeOut.duration(150).easing(EASE_OUT).reduceMotion(ReduceMotion.Never);

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

export function ToastHost({ bottom = 12 }: { bottom?: number }) {
  const { toast, hide } = useToast();
  const reduced = useReducedMotion();
  return (
    <View pointerEvents="box-none" style={[s.host, { bottom }]} accessibilityLiveRegion="polite">
      {toast ? (
        // keyed by id: a new toast replaces the old one with a fresh entrance
        <Animated.View key={toast.id} entering={reduced ? ENTER_REDUCED : ENTER} exiting={EXIT} style={s.toast} accessibilityRole="summary">
          <T size={15} bold color={colors.bg} lh={1.35} style={{ flex: 1 }}>
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
              <T size={15} bold color={colors.bg}>Deshacer</T>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  host: { position: 'absolute', left: 14, right: 14 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.ink, borderRadius: 16,
    paddingVertical: 10, paddingRight: 10, paddingLeft: 16, ...shadow.toast,
  },
  undo: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
