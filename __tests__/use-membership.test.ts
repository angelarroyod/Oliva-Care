import { renderHook, waitFor } from '@testing-library/react-native';
import { useMembership } from '@/features/auth/useMembership';

const mockEq = jest.fn((_col: string, _val: string) => Promise.resolve({ data: [{ role: 'family', patient_id: 'p' }] }));
const mockAuth = { session: { user: { id: 'u1' } } as { user: { id: string } } | null };
jest.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: mockEq }) }) } }));
jest.mock('@/features/auth/useAuth', () => ({ useAuth: () => mockAuth }));

beforeEach(() => {
  mockEq.mockClear();
  mockAuth.session = { user: { id: 'u1' } };
});

test("asks only for the user's own rows (co-members' rows are readable too)", async () => {
  const { result } = renderHook(() => useMembership());
  await waitFor(() => expect(result.current.membership).toEqual({ role: 'family', patient_id: 'p' }));
  expect(mockEq).toHaveBeenCalledWith('profile_id', 'u1');
});

test('a token refresh (new session object, same user) neither reloads nor flips loading', async () => {
  const { result, rerender } = renderHook(() => useMembership());
  await waitFor(() => expect(result.current.loading).toBe(false));
  mockAuth.session = { user: { id: 'u1' } };
  rerender({});
  expect(result.current.loading).toBe(false);
  expect(mockEq).toHaveBeenCalledTimes(1);
});

test('signed out: not loading, no membership', async () => {
  mockAuth.session = null;
  const { result } = renderHook(() => useMembership());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.membership).toBeNull();
});
