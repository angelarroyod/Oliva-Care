import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import Medicacion from '../app/(app)/nurse/medicacion';
import { ToastProvider } from '@/components/Toast';
import type { DoseRow, ScheduleRow } from '@/features/care/types';
import type { Nurse } from '@/features/care/shifts';

// Thursday 15 October 2026, 23:40 local; Carmen (night) is on shift.
const mockAt = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);
const iso = (d: Date) => d.toISOString();

const mockNurses: Nurse[] = [
  { id: 'c', name: 'Carmen Morales', short: 'Carmen', start: '22:00', end: '06:00' },
  { id: 'r', name: 'Rosa García', short: 'Rosa', start: '06:00', end: '22:00' },
];
const mockNames = (id: string | null | undefined) => mockNurses.find((n) => n.id === id)?.name ?? '';

const sched = (id: string, name: string, dose: string, purpose: string | null, times: string[], mode: 'exact' | 'before', min: number): ScheduleRow => ({
  id, patient_id: 'p1', name, dose, purpose, times, reminder_mode: mode, reminder_minutes: min, active: true,
  start_date: '2026-10-01', end_date: null, created_at: iso(mockAt(1, 0)), updated_by: null, updated_at: iso(mockAt(1, 0)),
});
const SCHEDULES = [
  sched('met', 'Metformina', '850 mg', 'Diabetes · con la comida', ['08:00:00', '14:00:00'], 'exact', 0),
  sched('ome', 'Omeprazol', '20 mg', null, ['22:00:00'], 'exact', 0),
  sched('los', 'Losartán', '50 mg', 'Presión arterial', ['23:30:00'], 'before', 15),
  sched('par', 'Paracetamol', '1 g', null, ['23:55:00'], 'exact', 0),
];
const row = (sid: string, at: Date, over: Partial<DoseRow>): DoseRow => ({
  id: `${sid}${at.getTime()}`, schedule_id: sid, patient_id: 'p1', scheduled_for: iso(at), status: 'given',
  recorded_at: iso(at), recorded_by: 'r', recorded_late: false, skip_reason: null, skip_note: null, ...over,
});
const ROWS = [
  row('met', mockAt(15, 8), { recorded_at: iso(mockAt(15, 8, 2)) }),
  row('ome', mockAt(15, 22), { status: 'skipped', recorded_by: 'c', recorded_at: iso(mockAt(15, 22, 10)), skip_reason: 'asleep' }),
];
let mockSchedules: ScheduleRow[] = SCHEDULES;
let mockRows: DoseRow[] = ROWS;
let mockNow = mockAt(15, 23, 40);
let mockUndoError: null | { message: string } = null;

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn(), navigate: jest.fn() }) }));
jest.mock('@/features/care/hooks', () => ({
  useCare: () => ({
    pid: 'p1', role: 'nurse', meId: 'c', myName: 'Carmen Morales', meNurse: mockNurses[0], patient: null,
    short: 'Elena', team: [], nurses: mockNurses, names: mockNames, now: mockNow,
  }),
  useSince: () => iso(mockAt(15, 0)),
  useSchedules: () => mockSchedules,
  useDoseRows: () => mockRows,
}));

const mockUpsert = jest.fn((..._a: unknown[]) => Promise.resolve({ error: null as null | { message: string } }));
const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockChain: { eq: typeof mockEq; then: (ok: (v: { error: null | { message: string } }) => void) => void } = {
  eq: mockEq,
  then: (ok) => ok({ error: mockUndoError }),
};
mockEq.mockImplementation(() => mockChain);
mockUpdate.mockImplementation(() => mockChain);
jest.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ upsert: mockUpsert, update: mockUpdate }) } }));

beforeEach(() => {
  mockSchedules = SCHEDULES;
  mockRows = ROWS;
  mockNow = mockAt(15, 23, 40);
  mockUndoError = null;
  jest.clearAllMocks();
  mockEq.mockImplementation(() => mockChain);
  mockUpdate.mockImplementation(() => mockChain);
  mockUpsert.mockImplementation(() => Promise.resolve({ error: null }));
});

const show = () => render(<ToastProvider><Medicacion /></ToastProvider>);

test('header, progress and grouped dose cards come from live data', () => {
  show();
  expect(screen.getByText('Medicación')).toBeTruthy();
  expect(screen.getByText('Elena · jueves 15 de octubre')).toBeTruthy();
  expect(screen.getByLabelText('Volver al inicio')).toBeTruthy();
  expect(screen.getAllByText('1 de 5 dosis dadas hoy')).toHaveLength(1);
  expect(screen.getByLabelText('1 de 5 dosis dadas hoy').props.accessibilityValue).toEqual({ min: 0, max: 5, now: 1 });
  expect(screen.getByText('1 no se dio · 1 sin registrar · 2 pendientes')).toBeTruthy();
  for (const h of ['Ahora', 'Más tarde', 'Sin registrar', 'Registradas hoy', 'Avisos']) expect(screen.getByRole('header', { name: h })).toBeTruthy();

  // pending and due
  expect(screen.getByText('Hace 10 min')).toBeTruthy();
  expect(screen.getByText('Aviso enviado a Carmen a las 23:15.')).toBeTruthy();
  // pending later
  expect(screen.getByText('A las 23:55')).toBeTruthy();
  expect(screen.getByText('Se avisará a Carmen a las 23:55.')).toBeTruthy();
  // unrecorded: re-reminder at +30 goes to whoever was on shift then
  expect(screen.getByText('Nadie la registró. A las 14:30 se avisó otra vez a Rosa. Si sabes qué pasó, anótalo.')).toBeTruthy();
  // skipped and given
  expect(screen.getByText('Motivo: paciente dormido. Lo anotó Carmen a las 22:10.')).toBeTruthy();
  expect(screen.getByText('Dada · 08:02')).toBeTruthy();
  expect(screen.getByText('Por Rosa García.')).toBeTruthy();
  expect(screen.getAllByText('Diabetes · con la comida')).toHaveLength(2);
});

test('a dose recorded offline shows as given and says it has not gone out yet', () => {
  mockRows = [...ROWS, row('los', mockAt(15, 23, 30), { recorded_by: 'c', recorded_at: iso(mockAt(15, 23, 35)), pending: true })];
  show();
  expect(screen.getByText('Dada · 23:35')).toBeTruthy();
  expect(screen.getByText('Por Carmen Morales. Pendiente de enviar.')).toBeTruthy();
  expect(screen.getByText('Por Rosa García.')).toBeTruthy(); // sent: no marker
});

test('Marcar como dada upserts the dose and Deshacer sets it back to pending', async () => {
  show();
  fireEvent.press(screen.getAllByText('Marcar como dada')[0]);
  await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
  expect(mockUpsert).toHaveBeenCalledWith(
    expect.objectContaining({
      schedule_id: 'los', patient_id: 'p1', scheduled_for: iso(mockAt(15, 23, 30)), status: 'given',
      recorded_by: 'c', recorded_late: false, skip_reason: null, skip_note: null,
    }),
    { onConflict: 'schedule_id,scheduled_for' },
  );
  expect(await screen.findByText(/^Losartán dada a las \d\d:\d\d\.$/)).toBeTruthy();

  fireEvent.press(screen.getByText('Deshacer'));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({
    status: 'pending', recorded_at: null, recorded_by: null, recorded_late: false, skip_reason: null, skip_note: null,
  }));
  expect(mockEq).toHaveBeenCalledWith('schedule_id', 'los');
  expect(mockEq).toHaveBeenCalledWith('scheduled_for', iso(mockAt(15, 23, 30)));
});

test('Sí, se dio records an unrecorded dose as late', async () => {
  show();
  fireEvent.press(screen.getByText('Sí, se dio'));
  await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
  expect(mockUpsert.mock.calls[0][0]).toEqual(expect.objectContaining({ schedule_id: 'met', status: 'given', recorded_late: true }));
  expect(await screen.findByText('Metformina de las 14:00 anotada como dada.')).toBeTruthy();
});

test('omit sheet validates the reason and saves it', async () => {
  show();
  fireEvent.press(screen.getAllByText('No se dio')[0]);
  expect(screen.getByText('¿Por qué no se dio?')).toBeTruthy();
  expect(screen.getByText('Losartán 50 mg · 23:30')).toBeTruthy();
  expect(screen.getByText('Rosa y la familia lo verán en el historial, con el motivo.')).toBeTruthy();
  expect(screen.getAllByRole('radio')).toHaveLength(7);

  fireEvent.press(screen.getByText('Guardar: no se dio'));
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByText('Elige un motivo.')).toBeTruthy();

  fireEvent.press(screen.getByText('Otro motivo'));
  expect(screen.getByText(' (obligatoria)')).toBeTruthy();
  fireEvent.press(screen.getByText('Guardar: no se dio'));
  expect(screen.getByText('Escribe el motivo en la nota.')).toBeTruthy();
  expect(mockUpsert).not.toHaveBeenCalled();

  fireEvent.press(screen.getByText('Paciente dormido'));
  expect(screen.getByRole('radio', { name: 'Paciente dormido' }).props.accessibilityState.checked).toBe(true);
  fireEvent.changeText(screen.getByLabelText('Nota'), 'Se lo doy al despertar.');
  fireEvent.press(screen.getByText('Guardar: no se dio'));
  await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
  expect(mockUpsert.mock.calls[0][0]).toEqual(
    expect.objectContaining({ schedule_id: 'los', status: 'skipped', skip_reason: 'asleep', skip_note: 'Se lo doy al despertar.', recorded_by: 'c' }),
  );
  expect(await screen.findByText('Losartán: anotado que no se dio (paciente dormido).')).toBeTruthy();
  expect(screen.queryByText('Guardar: no se dio')).toBeNull();

  fireEvent.press(screen.getByText('Deshacer'));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', skip_reason: null, skip_note: null })));
  expect(mockEq).toHaveBeenCalledWith('scheduled_for', iso(mockAt(15, 23, 30)));
});

test('a failed save keeps the sheet open and shows the error', async () => {
  mockUpsert.mockImplementation(() => Promise.resolve({ error: { message: 'Sin conexión' } }));
  show();
  fireEvent.press(screen.getAllByText('No se dio')[0]);
  fireEvent.press(screen.getByText('Lo rechazó'));
  fireEvent.press(screen.getByText('Guardar: no se dio'));
  expect(await screen.findByText('Sin conexión')).toBeTruthy();
  expect(screen.getByText('Guardar: no se dio')).toBeTruthy();
});

test('Avisos rows open the reminder; Añadir medicamento opens the new plan form', () => {
  show();
  expect(screen.getByText('Le llegan a quien esté de turno cuando suenan.')).toBeTruthy();
  expect(screen.getByText('08:00 y 14:00 · a la hora exacta')).toBeTruthy();
  expect(screen.getByText('23:30 · 15 min antes')).toBeTruthy();
  fireEvent.press(screen.getByText('23:30 · 15 min antes'));
  expect(mockPush).toHaveBeenCalledWith('/nurse/aviso/los');
  fireEvent.press(screen.getByText('Añadir medicamento'));
  expect(mockPush).toHaveBeenCalledWith('/nurse/pauta-nueva');
});

test('empty state when there is no medication yet', () => {
  mockSchedules = [];
  mockRows = [];
  show();
  expect(screen.getByText('Aún no hay medicación. Añade la primera con «Añadir medicamento».')).toBeTruthy();
  expect(screen.queryByText('Avisos')).toBeNull();
  expect(screen.getByText('Añadir medicamento')).toBeTruthy();
});

test('a later dose whose "before" reminder already fired says it was sent', () => {
  mockSchedules = [...SCHEDULES, sched('ins', 'Insulina', '10 UI', null, ['23:50:00'], 'before', 15)];
  show();
  expect(screen.getByText('A las 23:50')).toBeTruthy();
  expect(screen.getByText('Aviso enviado a Carmen a las 23:35.')).toBeTruthy();
});

test('late records and skip notes are written out', () => {
  mockRows = [
    ...ROWS.slice(0, 1),
    row('met', mockAt(15, 14), { recorded_by: 'c', recorded_at: iso(mockAt(15, 22, 5)), recorded_late: true }),
    row('ome', mockAt(15, 22), { status: 'skipped', recorded_by: 'c', recorded_at: iso(mockAt(15, 22, 10)), skip_reason: 'asleep', skip_note: 'Dormía profundamente.' }),
  ];
  show();
  expect(screen.getByText('Dada · 22:05')).toBeTruthy();
  expect(screen.getByText('Por Carmen Morales, anotada más tarde.')).toBeTruthy();
  expect(screen.getByText('Motivo: paciente dormido. Dormía profundamente. Lo anotó Carmen a las 22:10.')).toBeTruthy();
});

test('dose buttons name the medicine for screen readers', () => {
  show();
  expect(screen.getByLabelText('Marcar como dada: Losartán de las 23:30')).toBeTruthy();
  expect(screen.getByLabelText('No se dio: Losartán de las 23:30')).toBeTruthy();
  expect(screen.getByLabelText('Sí, se dio: Metformina de las 14:00')).toBeTruthy();
});

test('just after midnight, yesterday 23:30 is still in Ahora', () => {
  mockNow = mockAt(16, 0, 10);
  show();
  expect(screen.getByText('Hace 40 min')).toBeTruthy();
  // today's 23:30 is in Más tarde; the labels tell the two apart
  expect(screen.getByLabelText('Marcar como dada: Losartán de las 23:30 de ayer')).toBeTruthy();
  expect(screen.getByLabelText('Marcar como dada: Losartán de las 23:30')).toBeTruthy();
  // the progress card counts today's plan only
  expect(screen.getAllByText('0 de 5 dosis dadas hoy')).toHaveLength(1);
});

test('yesterday 23:30 goes Sin registrar after midnight and can still be recorded', async () => {
  mockNow = mockAt(16, 0, 40);
  show();
  expect(screen.getByText('Hace 45 min')).toBeTruthy(); // 23:55 still pending
  expect(screen.getByText('Nadie la registró. A las 00:00 se avisó otra vez a Carmen. Si sabes qué pasó, anótalo.')).toBeTruthy();
  // recorded yesterday: not carried over
  expect(screen.queryByText('Motivo: paciente dormido. Lo anotó Carmen a las 22:10.')).toBeNull();

  fireEvent.press(screen.getByLabelText('Sí, se dio: Losartán de las 23:30 de ayer'));
  await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
  expect(mockUpsert.mock.calls[0][0]).toEqual(
    expect.objectContaining({ schedule_id: 'los', scheduled_for: iso(mockAt(15, 23, 30)), status: 'given', recorded_late: true }),
  );
  expect(await screen.findByText('Losartán de las 23:30 anotada como dada.')).toBeTruthy();
});

test('a failed give or undo is shown to the user', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockUpsert.mockImplementationOnce(() => Promise.resolve({ error: { message: 'Sin conexión' } }));
  show();
  fireEvent.press(screen.getByLabelText('Marcar como dada: Losartán de las 23:30'));
  await waitFor(() => expect(alert).toHaveBeenCalledWith('No se pudo guardar', 'Sin conexión'));
  expect(screen.queryByText('Deshacer')).toBeNull();

  mockUndoError = { message: 'Sin conexión' };
  fireEvent.press(screen.getByLabelText('Marcar como dada: Losartán de las 23:30'));
  fireEvent.press(await screen.findByText('Deshacer'));
  await waitFor(() => expect(alert).toHaveBeenCalledWith('No se pudo deshacer', 'Sin conexión'));
  alert.mockRestore();
});

test('the omit sheet refuses to overwrite a dose someone else recorded meanwhile', async () => {
  const { rerender } = render(<ToastProvider><Medicacion /></ToastProvider>);
  fireEvent.press(screen.getAllByText('No se dio')[0]);
  fireEvent.press(screen.getByText('Paciente dormido'));
  // Rosa gives the Losartán while the sheet is open; realtime refreshes the rows
  mockRows = [...ROWS, row('los', mockAt(15, 23, 30), { recorded_by: 'r', recorded_at: iso(mockAt(15, 23, 41)) })];
  rerender(<ToastProvider><Medicacion /></ToastProvider>);
  fireEvent.press(screen.getByText('Guardar: no se dio'));
  expect(await screen.findByText('Ya la anotó Rosa García.')).toBeTruthy();
  expect(mockUpsert).not.toHaveBeenCalled();
});
