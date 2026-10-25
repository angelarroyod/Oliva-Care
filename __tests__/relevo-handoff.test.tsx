import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ToastProvider } from '@/components/Toast';
import Relevo from '../app/(app)/nurse/(tabs)/relevo';
import type { DoseRow, EventRow, HandoffRow, ReadingRow, ScheduleRow } from '@/features/care/types';
import type { Nurse } from '@/features/care/shifts';

// Thursday 15 October 2026, 23:40 local; Carmen (22:00–06:00) hands over to Rosa (06:00–22:00).
const mockAt = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);
const iso = (d: Date) => d.toISOString();

const mockNurses: Nurse[] = [
  { id: 'c', name: 'Carmen Morales', short: 'Carmen', start: '22:00', end: '06:00' },
  { id: 'r', name: 'Rosa García', short: 'Rosa', start: '06:00', end: '22:00' },
];
const sched = (id: string, name: string, dose: string, times: string[]): ScheduleRow => ({
  id, patient_id: 'p1', name, dose, purpose: null, times: times.map((t) => `${t}:00`), reminder_mode: 'exact', reminder_minutes: 0,
  active: true, start_date: '2026-10-01', end_date: null, created_at: iso(mockAt(1, 0)), updated_by: null, updated_at: iso(mockAt(1, 0)),
});
const mockSchedules = [
  sched('lev', 'Levotiroxina', '50 mcg', ['06:00']),
  sched('met', 'Metformina', '850 mg', ['08:00', '14:00', '20:00']),
  sched('los', 'Losartán', '50 mg', ['23:30']),
];
const row = (sid: string, at: Date, over: Partial<DoseRow> = {}): DoseRow => ({
  id: `${sid}${at.getTime()}`, schedule_id: sid, patient_id: 'p1', scheduled_for: iso(at), status: 'given',
  recorded_at: iso(at), recorded_by: 'r', recorded_late: false, skip_reason: null, skip_note: null, ...over,
});
// 14:00 Metformina never recorded; 23:30 Losartán skipped (asleep).
const ROWS = [
  row('lev', mockAt(15, 6)), row('met', mockAt(15, 8)), row('met', mockAt(15, 20)),
  row('los', mockAt(15, 23, 30), { status: 'skipped', recorded_by: 'c', skip_reason: 'asleep' }),
];
const READINGS: ReadingRow[] = [
  { id: 'hr', patient_id: 'p1', control_id: 'k1', kind: 'hr', value: 72, value2: null, context: null, severity: 'ok', taken_at: iso(mockAt(15, 23)), taken_by: 'c', note: null, family_notified: false },
];
let mockNow = mockAt(15, 23, 40);
let mockRows: DoseRow[] = [];
let mockReadings: ReadingRow[] = [];
let mockEvents: EventRow[] = [];
let mockHandoffs: HandoffRow[] = [];
const rosaHandoff: HandoffRow = { id: 'hr1', patient_id: 'p1', nurse_id: 'r', summary: 'Tarde tranquila.', recommendation: null, started_at: iso(mockAt(15, 6)), ended_at: iso(mockAt(15, 22)) };

jest.mock('@/features/care/hooks', () => ({
  useCare: () => ({
    pid: 'p1', role: 'nurse', meId: 'c', myName: 'Carmen Morales', meNurse: mockNurses[0], patient: null, short: 'Elena', team: [],
    nurses: mockNurses, names: (id?: string | null) => mockNurses.find((n) => n.id === id)?.name ?? '', now: mockNow,
  }),
  useSince: () => iso(mockAt(14, 0)),
  useSchedules: () => mockSchedules,
  useDoseRows: () => mockRows,
  useReadings: () => mockReadings,
  useEvents: () => mockEvents,
  useHandoffs: () => mockHandoffs,
}));

let mockInsertResult: { error: { message: string } | null } = { error: null };
const mockInsert = jest.fn((_row: unknown) => Promise.resolve(mockInsertResult));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'h-new' }));
const mockDeleteEq = jest.fn((_col: string, _id: string) => Promise.resolve({ error: null }));
jest.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ insert: mockInsert, delete: () => ({ eq: mockDeleteEq }) }) },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockNow = mockAt(15, 23, 40);
  mockRows = ROWS;
  mockReadings = READINGS;
  mockEvents = [
    { id: 'n1', patient_id: 'p1', author_id: 'c', type: 'note', title: 'A vigilar', body: 'Tos seca de vez en cuando.', severity: 'warning', occurred_at: iso(mockAt(15, 22, 30)) },
  ];
  mockHandoffs = [rosaHandoff];
  mockInsertResult = { error: null };
});

const renderRelevo = () => render(<ToastProvider><Relevo /></ToastProvider>);

const PARA = [
  'Losartán de las 23:30: no se dio (paciente dormido).',
  'Metformina de las 14:00: sigue sin registrar. Confirmar si se dio.',
  'Dar Levotiroxina 50 mcg a las 06:00.',
  'Avisar al médico si aparece fiebre (más de 37,5 °C).',
];

test('builds the summary, the watch list, the list for Rosa and the shift so far', () => {
  renderRelevo();
  expect(screen.getByText('Relevo de turno')).toBeTruthy();
  expect(screen.getByText('Noche de 22:00 a 06:00 · para Rosa (turno de día)')).toBeTruthy();
  expect(screen.getByText('Turno tranquilo por ahora. Hay 1 cosa a vigilar.')).toBeTruthy();
  expect(screen.getByText('A VIGILAR')).toBeTruthy();
  expect(screen.getByText('A las 22:30: Tos seca de vez en cuando.')).toBeTruthy();
  expect(screen.getByText('PARA ROSA')).toBeTruthy();
  for (const p of PARA) expect(screen.getByText(p)).toBeTruthy();

  // since 22:00, oldest first
  const titles = screen.getAllByText(/^(Rosa entregó|A vigilar|Signos vitales|Losartán 50 mg)/).map((t) => t.props.children);
  expect(titles).toEqual(['Rosa entregó el turno a Carmen', 'A vigilar', 'Signos vitales', 'Losartán 50 mg']);
  expect(screen.getByText('No se dio: paciente dormido.')).toBeTruthy();
});

test('handing off saves the handoff and can be undone', async () => {
  renderRelevo();
  fireEvent.press(screen.getByText('Entregar turno a Rosa'));
  expect(screen.getByText('¿Entregar el turno a Rosa?')).toBeTruthy();
  expect(screen.getByText('1 cosa a vigilar: nota de las 22:30')).toBeTruthy();
  expect(screen.getByText('4 tareas para el turno de día')).toBeTruthy();
  expect(screen.getByText('La familia verá el resumen')).toBeTruthy();

  fireEvent.press(screen.getByText('Sí, entregar turno'));
  await waitFor(() => expect(screen.getByText('Turno entregado a Rosa.')).toBeTruthy());
  expect(mockInsert).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'h-new', // client id: undo works before the insert ever reaches the server
      patient_id: 'p1',
      nurse_id: 'c',
      summary: 'Turno tranquilo por ahora. Hay 1 cosa a vigilar. A las 22:30: Tos seca de vez en cuando.',
      recommendation: PARA.join('\n'),
      started_at: iso(mockAt(15, 22)),
    }),
  );

  fireEvent.press(screen.getByText('Deshacer'));
  await waitFor(() => expect(mockDeleteEq).toHaveBeenCalledWith('id', 'h-new'));
});

test('a failed save is written out in the sheet, which stays open', async () => {
  mockInsertResult = { error: { message: 'sin conexión' } };
  renderRelevo();
  fireEvent.press(screen.getByText('Entregar turno a Rosa'));
  fireEvent.press(screen.getByText('Sí, entregar turno'));
  expect(await screen.findByText('No se pudo guardar. Vuelve a intentarlo.')).toBeTruthy();
  expect(screen.getByText('Sí, entregar turno')).toBeTruthy();
  expect(screen.queryByText('Turno entregado a Rosa.')).toBeNull();
});

test('after handing off: success box, no button', () => {
  mockHandoffs = [rosaHandoff, { id: 'mine', patient_id: 'p1', nurse_id: 'c', summary: '', recommendation: '', started_at: iso(mockAt(15, 22)), ended_at: iso(mockAt(15, 23, 39)) }];
  renderRelevo();
  expect(screen.getByText('Turno entregado a Rosa a las 23:39')).toBeTruthy();
  expect(screen.getByText('Rosa y la familia ya pueden ver este resumen.')).toBeTruthy();
  expect(screen.queryByText('Entregar turno a Rosa')).toBeNull();
});

test('nothing noted yet this shift', () => {
  mockNow = mockAt(15, 22, 10); // Losartán not due until 23:30
  mockRows = ROWS.slice(0, 3);
  mockReadings = [];
  mockEvents = [];
  mockHandoffs = [];
  renderRelevo();
  expect(screen.queryByText('A VIGILAR')).toBeNull();
  expect(screen.getByText('Turno tranquilo por ahora. Nada a vigilar.')).toBeTruthy();
  expect(screen.getByText('Aún no hay nada anotado en este turno. Lo que registres aparecerá aquí.')).toBeTruthy();
});
