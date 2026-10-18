import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useLiveList } from '@/features/care/useLiveList';
import { invalidate } from '@/lib/db';

const mockOrder = jest.fn(() => Promise.resolve({ data: [{ n: 1 }, { n: 2 }] }));
const mockGte = jest.fn(() => ({ order: mockOrder }));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ order: mockOrder, gte: mockGte }) }) }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: jest.fn(),
  },
}));

beforeEach(() => jest.clearAllMocks());

test('fetches and maps rows for a patient', async () => {
  const { result } = renderHook(() =>
    useLiveList('vitals', 'p1', { col: 'taken_at', asc: false }, (r: { n: number }) => r.n * 10),
  );
  await waitFor(() => expect(result.current).toEqual([10, 20]));
});

test('returns empty with no patient', () => {
  const { result } = renderHook(() =>
    useLiveList('vitals', undefined, { col: 'taken_at', asc: false }, (r: unknown) => r),
  );
  expect(result.current).toEqual([]);
});

test('since filters with gte; invalidate refetches', async () => {
  renderHook(() =>
    useLiveList('vital_readings', 'p1', { col: 'taken_at', asc: true }, (r: unknown) => r, { since: { col: 'taken_at', value: '2026-10-01' } }),
  );
  await waitFor(() => expect(mockGte).toHaveBeenCalledWith('taken_at', '2026-10-01'));
  const before = mockOrder.mock.calls.length;
  await act(async () => invalidate('vital_readings'));
  expect(mockOrder.mock.calls.length).toBe(before + 1);
});

test('a failed refetch (offline) keeps showing the last rows', async () => {
  const { result } = renderHook(() =>
    useLiveList('vitals', 'p1', { col: 'taken_at', asc: false }, (r: { n: number }) => r.n * 10),
  );
  await waitFor(() => expect(result.current).toEqual([10, 20]));
  mockOrder.mockImplementationOnce(() => Promise.resolve({ data: null, error: { message: 'Network request failed' } }) as never);
  await act(async () => invalidate('vitals'));
  expect(mockOrder).toHaveBeenCalledTimes(2);
  expect(result.current).toEqual([10, 20]);
});
