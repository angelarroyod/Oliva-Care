import { inWrongArea, routeForState } from '@/features/auth/guard';

test('no session -> auth welcome', () => {
  expect(routeForState({ hasSession: false, hasMembership: false, role: null })).toBe('/(auth)/welcome');
});
test('session but no membership -> onboarding', () => {
  expect(routeForState({ hasSession: true, hasMembership: false, role: null })).toBe('/(auth)/onboarding');
});
test('nurse membership -> nurse home', () => {
  expect(routeForState({ hasSession: true, hasMembership: true, role: 'nurse' })).toBe('/(app)/nurse/inicio');
});
test('family membership -> family home', () => {
  expect(routeForState({ hasSession: true, hasMembership: true, role: 'family' })).toBe('/(app)/family/inicio');
});
test('each role is kept out of the other tab group, shared screens stay open', () => {
  expect(inWrongArea('nurse', 'family')).toBe(true);
  expect(inWrongArea('family', 'nurse')).toBe(true);
  expect(inWrongArea('doctor', 'nurse')).toBe(true);
  expect(inWrongArea('nurse', 'nurse')).toBe(false);
  expect(inWrongArea('family', 'family')).toBe(false);
  expect(inWrongArea('doctor', 'family')).toBe(false);
  expect(inWrongArea('nurse', 'plan')).toBe(false);
  expect(inWrongArea('family', 'settings')).toBe(false);
  expect(inWrongArea('nurse', undefined)).toBe(false);
});
