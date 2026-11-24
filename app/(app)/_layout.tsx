import { Redirect, Stack, useSegments } from 'expo-router';
import { useAuth } from '@/features/auth/useAuth';
import { useMembership } from '@/features/auth/useMembership';
import { OfflineSync } from '@/components/Offline';
import { inWrongArea, routeForState } from '@/features/auth/guard';

export default function AppLayout() {
  const { session, loading: authLoading } = useAuth();
  const { membership, loading: memLoading } = useMembership();
  const segments: string[] = useSegments();
  if (authLoading || (session && memLoading)) return null;
  if (!session) return <Redirect href="/(auth)/welcome" />;
  if (!membership) return <Redirect href="/(auth)/onboarding" />;
  if (inWrongArea(membership.role, segments[1])) {
    return <Redirect href={routeForState({ hasSession: true, hasMembership: true, role: membership.role })} />;
  }
  return (
    <OfflineSync role={membership.role}>
      <Stack screenOptions={{ headerShown: false }} />
    </OfflineSync>
  );
}
