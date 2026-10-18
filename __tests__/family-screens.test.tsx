import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import Estado from '../app/(app)/family/(tabs)/inicio';
import Mensajes from '../app/(app)/family/(tabs)/mensajes';
import Perfil from '../app/(app)/family/(tabs)/perfil';
import type { DoseRow, EventRow, MemberRow, ReadingRow, ScheduleRow } from '@/features/care/types';
import type { Nurse } from '@/features/care/shifts';

// Thursday 15 October 2026, 23:40 local: Carmen (night) is on shift.
const mockAt = (d: number, h: number, mi = 0) => new Date(2026, 9, d, h, mi);
const iso = (d: Date) => d.toISOString();

const mockNurses: Nurse[] = [
  { id: 'c', name: 'Carmen Morales', short: 'Carmen', start: '22:00', end: '06:00' },
  { id: 'r', name: 'Rosa García', short: 'Rosa', start: '06:00', end: '22:00' },
];
const member = (id: string, role: MemberRow['role'], name: string, shift?: [string, string]): MemberRow => ({
  id: `m${id}`, patient_id: 'p1', profile_id: id, role, relationship: null, shift: null,
  shift_start: shift ? `${shift[0]}:00` : null, shift_end: shift ? `${shift[1]}:00` : null, profiles: { full_name: name },
});
const mockTeam = [
  member('c', 'nurse', 'Carmen Morales', ['22:00', '06:00']),
  member('r', 'nurse', 'Rosa García', ['06:00', '22:00']),
  member('d', 'doctor', 'Dr. Méndez'),
  member('l', 'family', 'Lucía Rivas'),
];
const mockPatient = { id: 'p1', full_name: 'Elena Rivas', age: 78, room: null, status: 'Estable', allergies: ['penicilina'] };
const mockSchedules: ScheduleRow[] = [
  {
    id: 'met', patient_id: 'p1', name: 'Metformina', dose: '850 mg', purpose: null, times: ['08:00:00', '14:00:00'], reminder_mode: 'exact',
    reminder_minutes: 0, active: true, start_date: '2026-10-13', end_date: null, created_at: iso(mockAt(13, 0)), updated_by: null, updated_at: iso(mockAt(13, 0)),
  },
];
const dose = (d: Date, over: Partial<DoseRow> = {}): DoseRow => ({
  id: `d${d.getTime()}`, schedule_id: 'met', patient_id: 'p1', scheduled_for: iso(d), status: 'given', recorded_at: iso(d),
  recorded_by: 'r', recorded_late: false, skip_reason: null, skip_note: null, ...over,
});
const mockDoseRows = [
  dose(mockAt(13, 8)), dose(mockAt(13, 14), { status: 'skipped', skip_reason: 'refused' }),
  dose(mockAt(14, 8)), dose(mockAt(14, 14)), dose(mockAt(15, 8)),
];
const reading = (kind: ReadingRow['kind'], value: number, d: Date, over: Partial<ReadingRow> = {}): ReadingRow => ({
  id: `${kind}${d.getTime()}`, patient_id: 'p1', control_id: 'ctl1', kind, value, value2: null, context: null, severity: 'ok',
  taken_at: iso(d), taken_by: 'r', note: null, family_notified: false, ...over,
});
const baseReadings = [
  reading('glucose', 140, mockAt(13, 19), { control_id: 'a', context: 'pre_meal' }),
  reading('glucose', 145, mockAt(14, 19), { control_id: 'b', context: 'pre_meal' }),
  reading('glucose', 262, mockAt(15, 19, 45), { context: 'pre_meal', severity: 'alert' }),
  reading('bp', 128, mockAt(15, 19, 45), { value2: 80 }),
];
let mockReadings = baseReadings;
const mockEvents: EventRow[] = [];
const mockMessages = [
  { body: 'Ha merendado bien.', time: '18:05', fromSelf: false, senderId: 'r' }, // day nurse, now off shift
  { body: 'Buenas noches, ya está dormida.', time: '23:10', fromSelf: false, senderId: 'c' },
  { body: 'Gracias por avisar.', time: '23:12', fromSelf: true, senderId: 'l' },
];
const mockNames = (id: string) => mockTeam.find((m) => m.profile_id === id)?.profiles?.full_name ?? '';

const mockRouter = { push: jest.fn(), navigate: jest.fn(), back: jest.fn() };
const mockInsert = jest.fn((_row: Record<string, unknown>) => Promise.resolve({ error: null }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ insert: mockInsert }) } }));
jest.mock('@/features/care/hooks', () => ({
  useCare: () => ({
    pid: 'p1', role: 'family', meId: 'l', myName: 'Lucía Rivas', meNurse: null, patient: mockPatient, short: 'Elena',
    team: mockTeam, nurses: mockNurses, names: mockNames, now: mockAt(15, 23, 40),
  }),
  useSince: () => iso(mockAt(21 - 30, 0)),
  useReadings: () => mockReadings,
  useSchedules: () => mockSchedules,
  useDoseRows: () => mockDoseRows,
  useEvents: () => mockEvents,
  useHandoffs: () => [],
  useVitalPlans: () => [],
  useConditions: () => [
    { patient_id: 'p1', condition: 'hypertension', added_by: null, added_at: '' },
    { patient_id: 'p1', condition: 'diabetes', added_by: null, added_at: '' },
  ],
  useMessages: () => mockMessages,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockReadings = baseReadings;
});

test('Estado: greeting, hero and today', () => {
  render(<Estado />);
  expect(screen.getByText('Hola, Lucía')).toBeTruthy();
  expect(screen.getByText('¿Cómo está Elena?')).toBeTruthy();
  expect(screen.getByText('Estable · en casa')).toBeTruthy();
  expect(screen.getByText('Todo tranquilo con Elena.')).toBeTruthy();
  expect(screen.getByText('Carmen, su enfermera de noche, está con Elena desde las 22:00.')).toBeTruthy();
  expect(screen.getByText('jueves 15 de octubre')).toBeTruthy();
  expect(screen.getByText('1 de 2')).toBeTruthy();
  expect(screen.getByText('1 sin registrar')).toBeTruthy();
  expect(screen.getAllByText('1 alerta')).toHaveLength(2); // today tile + glucose trend badge
  expect(screen.getByText(/glucosa 262 mg\/dL a las 19:45, muy lejos de lo normal para Elena \(90 a 150\)\./)).toBeTruthy();
  expect(screen.getByText(/nadie anotó si se dio Metformina de las 14:00\. Puedes preguntárselo a Carmen\./)).toBeTruthy();
  expect(screen.getByText('Alerta · 19:45')).toBeTruthy();
  expect(screen.getByText('Normal · 19:45')).toBeTruthy();
});

test('Estado: tiles and week days open the history', () => {
  render(<Estado />);
  fireEvent.press(screen.getByLabelText('Medicación de hoy: 1 de 2 dosis dadas. Ver en el historial'));
  expect(mockRouter.navigate).toHaveBeenLastCalledWith({ pathname: '/family/historial', params: { day: '2026-10-15', filter: 'med' } });
  fireEvent.press(screen.getByLabelText('Signos de hoy: 1 control. Ver en el historial'));
  expect(mockRouter.navigate).toHaveBeenLastCalledWith({ pathname: '/family/historial', params: { day: '2026-10-15', filter: 'vitals' } });
  fireEvent.press(screen.getByLabelText('martes 13: 1 dosis no se dio. Ver historial'));
  expect(mockRouter.navigate).toHaveBeenLastCalledWith({ pathname: '/family/historial', params: { day: '2026-10-13', filter: 'med' } });
  fireEvent.press(screen.getByLabelText('Perfil de Elena'));
  expect(mockRouter.navigate).toHaveBeenLastCalledWith('/family/perfil');
  fireEvent.press(screen.getByText('Escribir a Carmen'));
  expect(mockRouter.navigate).toHaveBeenLastCalledWith('/family/mensajes');
});

test('Estado: this week, exceptions and the extra trends', () => {
  render(<Estado />);
  expect(screen.getByText('del 12 al 18 de octubre')).toBeTruthy();
  expect(screen.getByText('La presión se mantuvo en su rango toda la semana. La glucosa tuvo una alerta hoy. Medicación: 4 de 6 dosis dadas.')).toBeTruthy();
  expect(screen.getByText('4 de 6 dosis dadas')).toBeTruthy();
  expect(screen.getByText('1 no se dio · 1 sin registrar')).toBeTruthy();
  expect(screen.getByText('Mar 13 · Metformina 14:00')).toBeTruthy();
  expect(screen.getByText(/no se dio: lo rechazó/)).toBeTruthy();
  expect(screen.getByText('Presión (máxima)')).toBeTruthy();
  expect(screen.getByText('Glucosa antes de cenar')).toBeTruthy();
  expect(screen.queryByText('Dolor')).toBeNull();
  fireEvent.press(screen.getByText('Ver dolor y pulso'));
  expect(screen.getByText('Dolor')).toBeTruthy();
  expect(screen.getByText('Ver menos signos')).toBeTruthy();
});

test('Estado: fever changes the hero and leads the list', () => {
  mockReadings = [...baseReadings, reading('temp', 38.2, mockAt(15, 23), { control_id: 't', severity: 'warn' })];
  render(<Estado />);
  expect(screen.getByText('Necesita atención · en casa')).toBeTruthy();
  expect(screen.getByText('Elena tiene fiebre. Ya está recibiendo atención.')).toBeTruthy();
  expect(screen.getByText('Carmen está con Elena y va a avisar al médico.')).toBeTruthy();
  expect(screen.getByText(/tiene fiebre \(38,2 °C a las 23:00\)\. Carmen va a avisar al médico\./)).toBeTruthy();
});

test('Mensajes: header, bubbles and quick replies', async () => {
  render(<Mensajes />);
  expect(screen.getByText('Carmen Morales')).toBeTruthy();
  expect(screen.getByText('En turno ahora · enfermera de noche')).toBeTruthy();
  expect(screen.getByLabelText('Carmen dijo: Buenas noches, ya está dormida.')).toBeTruthy();
  expect(screen.getByLabelText('Rosa dijo: Ha merendado bien.')).toBeTruthy(); // the real sender, not the nurse on shift
  expect(screen.getByLabelText('Tú dijiste: Gracias por avisar.')).toBeTruthy();
  expect(screen.getByPlaceholderText('Escribe un mensaje…')).toBeTruthy();
  fireEvent.press(screen.getByText('Gracias, Carmen'));
  await waitFor(() => expect(mockInsert).toHaveBeenCalledWith({ patient_id: 'p1', sender_id: 'l', body: 'Gracias, Carmen' }));
  expect(screen.getByText('¿Cómo durmió?')).toBeTruthy();
  expect(screen.getByText('¿Tiene fiebre?')).toBeTruthy();
});

test('Perfil: patient, allergies, conditions, contacts and calls', () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  render(<Perfil />);
  expect(screen.getByText('Elena Rivas')).toBeTruthy();
  expect(screen.getByText('78 años · en casa · estable')).toBeTruthy();
  expect(screen.getByText('Alergias: penicilina')).toBeTruthy();
  expect(screen.getAllByText(/^(Diabetes|Hipertensión)$/).map((t) => t.props.children)).toEqual(['Diabetes', 'Hipertensión']);
  expect(screen.getByText('Enfermera de noche')).toBeTruthy();
  expect(screen.getByText('Enfermera de día')).toBeTruthy();
  expect(screen.getByText('Médico')).toBeTruthy();
  expect(screen.queryByText('Lucía Rivas')).toBeNull();
  fireEvent.press(screen.getByLabelText('Llamar a Dr. Méndez'));
  expect(open).toHaveBeenLastCalledWith('tel:');
  fireEvent.press(screen.getByText('Emergencia: llamar al 112'));
  expect(open).toHaveBeenLastCalledWith('tel:112');
  fireEvent.press(screen.getByText('Ver plan de cuidados'));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/plan');
  fireEvent.press(screen.getByText('Configuración y tamaño de texto'));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/settings');
});
