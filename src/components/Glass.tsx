import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, View, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { colors, glass, scheme } from '@/theme';

// Liquid Glass belongs to the floating functional layer only (the tab bar),
// never to cards or content. iOS 26+ gets the system material; web gets a
// backdrop blur; Android and anyone with Reduce Transparency or Increase
// Contrast gets an opaque fill.
function systemGlass() {
  try {
    return Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false; // native module missing (Expo Go on an older SDK, tests)
  }
}
const SYSTEM = systemGlass();

const media = (q: string) => (Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null);

// True when the person asked for less transparency or more contrast.
export function useOpaque() {
  const [opaque, setOpaque] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const qs = [media('(prefers-reduced-transparency: reduce)'), media('(prefers-contrast: more)')].filter((q) => q != null);
      const sync = () => setOpaque(qs.some((q) => q.matches));
      sync();
      qs.forEach((q) => q.addEventListener?.('change', sync));
      return () => qs.forEach((q) => q.removeEventListener?.('change', sync));
    }
    AccessibilityInfo.isReduceTransparencyEnabled?.().then(setOpaque).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setOpaque);
    return () => sub.remove();
  }, []);
  return opaque;
}

// Fills its parent (use as a background). `radius` clips the blur to the shape.
export function GlassFill({ radius }: { radius: number }) {
  const opaque = useOpaque();
  const shape: ViewStyle = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius, overflow: 'hidden' };
  if (SYSTEM && !opaque) return <GlassView style={shape} glassEffectStyle="regular" colorScheme={scheme} />;
  const web = Platform.OS === 'web' && !opaque;
  return (
    <View
      style={[
        shape,
        { borderWidth: 1, borderColor: opaque ? colors.line : glass.rim },
        web
          ? ({ backgroundColor: glass.fill, backdropFilter: 'blur(24px) saturate(1.4)', WebkitBackdropFilter: 'blur(24px) saturate(1.4)' } as ViewStyle)
          : { backgroundColor: glass.opaque },
      ]}
    />
  );
}
