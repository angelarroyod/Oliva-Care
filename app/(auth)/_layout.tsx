import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/features/auth/useAuth';
import { useMembership } from '@/features/auth/useMembership';
import { routeForState } from '@/features/auth/guard';

export default function AuthLayout() {
  const { session, loading: authLoading } = useAuth();
  const { membership } = useMembership();
  // Keep this stack mounted while the membership loads: unmounting it would drop
  // the signup → onboarding navigation already in flight.
  if (authLoading) return null;
  // Signed-in members go to their role home; signed-in users without a
  // membership stay here so onboarding can render.
  if (session && membership) {
    return <Redirect href={routeForState({ hasSession: true, hasMembership: true, role: membership.role })} />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
