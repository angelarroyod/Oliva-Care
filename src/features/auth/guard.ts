export type AuthState = {
  hasSession: boolean;
  hasMembership: boolean;
  role: 'nurse' | 'family' | 'doctor' | null;
};

// Pure decision: where the router should be for a given auth/membership state.
export function routeForState(s: AuthState): string {
  if (!s.hasSession) return '/(auth)/welcome';
  if (!s.hasMembership || !s.role) return '/(auth)/onboarding';
  return s.role === 'nurse' ? '/(app)/nurse/inicio' : '/(app)/family/inicio';
}

// True when the first segment under (app) is the other role's tab group.
// Shared screens (plan, settings) aren't under either, so they always pass.
export function inWrongArea(role: AuthState['role'], area: string | undefined): boolean {
  if (area !== 'nurse' && area !== 'family') return false;
  return (area === 'nurse') !== (role === 'nurse');
}
