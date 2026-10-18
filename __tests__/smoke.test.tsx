import { render, act } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

// Every screen must render on first load, before any data has arrived
// (patient null, empty lists) — the state every user sees for a moment.
const mockRole = { current: 'nurse' as 'nurse' | 'family' };
const mockNow = new Date(2026, 9, 15, 23, 40);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), setParams: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({ addListener: () => () => {}, setOptions: jest.fn() }),
  Stack: Object.assign(() => null, { Screen: () => null }),
  Tabs: Object.assign(() => null, { Screen: () => null }),
  Redirect: () => null,
  Link: () => null,
}));
jest.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'me', email: 'a@b.com' } }, loading: false, signIn: jest.fn(), signUp: jest.fn(), signOut: jest.fn() }),
}));
jest.mock('@/features/auth/useMembership', () => ({
  useMembership: () => ({ membership: { patient_id: 'p1', role: mockRole.current }, loading: false }),
}));
jest.mock('@/features/care/hooks', () => ({
  useNow: () => mockNow,
  useSince: () => new Date(2026, 9, 8).toISOString(),
  usePatient: () => null,
  useTeam: () => [],
  useSchedules: () => [],
  useDoseRows: () => [],
  useReadings: () => [],
  useConditions: () => [],
  useVitalPlans: () => [],
  useEvents: () => [],
  useHandoffs: () => [],
  useMessages: () => [],
  mapMessage: jest.fn(),
  useCare: () => ({
    pid: 'p1', role: mockRole.current, meId: 'me', myName: '', meNurse: null, patient: null,
    short: 'el paciente', team: [], nurses: [], names: () => '', now: mockNow,
  }),
}));
// Any query chain resolves to "no rows".
jest.mock('@/lib/supabase', () => {
  const result = Promise.resolve({ data: null, error: null });
  const chain: Record<string, unknown> = new Proxy({}, {
    get: (_t, k) => (k === 'then' ? result.then.bind(result) : () => chain),
  });
  return { supabase: { from: () => chain, rpc: () => chain, channel: () => chain, removeChannel: jest.fn(), functions: { invoke: () => result }, auth: { resetPasswordForEmail: () => result } } };
});

import Welcome from '../app/(auth)/welcome';
import Login from '../app/(auth)/login';
import Signup from '../app/(auth)/signup';
import Onboarding from '../app/(auth)/onboarding';
import Legal from '../app/legal';
import Settings from '../app/(app)/settings/index';
import Plan from '../app/(app)/plan';
import NInicio from '../app/(app)/nurse/(tabs)/inicio';
import NSignos from '../app/(app)/nurse/(tabs)/signos';
import NHistorial from '../app/(app)/nurse/(tabs)/historial';
import NRelevo from '../app/(app)/nurse/(tabs)/relevo';
import NPerfil from '../app/(app)/nurse/(tabs)/perfil';
import NMed from '../app/(app)/nurse/medicacion';
import NAviso from '../app/(app)/nurse/aviso/[id]';
import NPauta from '../app/(app)/nurse/pauta-nueva';
import FEstado from '../app/(app)/family/(tabs)/inicio';
import FHistorial from '../app/(app)/family/(tabs)/historial';
import FMsg from '../app/(app)/family/(tabs)/mensajes';
import FPerfil from '../app/(app)/family/(tabs)/perfil';

const nurse: [string, () => React.JSX.Element | null][] = [
  ['Welcome', Welcome], ['Login', Login], ['Signup', Signup], ['Onboarding', Onboarding], ['Legal', Legal],
  ['Settings', Settings], ['Plan (nurse)', Plan], ['NurseInicio', NInicio], ['NurseSignos', NSignos],
  ['NurseHistorial', NHistorial], ['NurseRelevo', NRelevo], ['NursePerfil', NPerfil], ['NurseMedicacion', NMed],
  ['NurseAviso', NAviso], ['NursePautaNueva', NPauta],
];
const family: [string, () => React.JSX.Element | null][] = [
  ['Plan (family)', Plan], ['FamilyEstado', FEstado], ['FamilyHistorial', FHistorial], ['FamilyMensajes', FMsg], ['FamilyPerfil', FPerfil],
];

// Keep the welcome logo static: its animation is covered by welcome.test.
beforeAll(() => { jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true); });

describe('nurse', () => {
  beforeAll(() => { mockRole.current = 'nurse'; });
  test.each(nurse)('%s renders with no data yet', async (_name, C) => {
    expect(() => render(<C />)).not.toThrow();
    await act(async () => {}); // let mount-time promises settle inside act
  });
});

describe('family', () => {
  beforeAll(() => { mockRole.current = 'family'; });
  test.each(family)('%s renders with no data yet', async (_name, C) => {
    expect(() => render(<C />)).not.toThrow();
    await act(async () => {});
  });
});

test('family Estado says it is loading instead of "todo en orden" before data arrives', async () => {
  mockRole.current = 'family';
  const { getByText, queryByText } = render(<FEstado />);
  await act(async () => {});
  expect(getByText('Cargando…')).toBeTruthy();
  expect(queryByText(/Todo en orden/)).toBeNull();
});
