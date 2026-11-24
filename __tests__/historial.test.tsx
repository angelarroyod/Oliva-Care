import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { colors } from '@/theme';
import Historial from '@/features/care/Historial';
import NurseHistorial from '../app/(app)/nurse/(tabs)/historial';
import FamilyHistorial from '../app/(app)/family/(tabs)/historial';
import type { DoseRow, EventRow, HandoffRow, ReadingRow, ScheduleRow } from '@/features/care/types';
import type { Nurse } from '@/features/care/shifts';

// Thursday 15 October 2026, 23:40 local. Strip: vie 9 … jue 15.
const mockAt = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);
const iso = (d: Date) => d.toISOString();

const mockNurses: Nurse[] = [
  { id: 'c', name: 'Carmen Morales', short: 'Carmen', start: '22:00', end: '06:00' },
  { id: 'r', name: 'Rosa García', short: 'Rosa', start: '06:00', end: '22:00' },
];
const mockNames = (id: string | null | undefined) => mockNurses.find((n) => n.id === id)?.name ?? '';

const sched = (id: string, name: string, dose: string, times: string[], start: string): ScheduleRow => ({
  id, patient_id: 'p1', name, dose, purpose: null, times, reminder_mode: 'exact', reminder_minutes: 0, active: true,
  start_date: start, end_date: null, created_at: iso(mockAt(Number(start.slice(8)), 0)), updated_by: null, updated_at: iso(mockAt(1, 0)),
});
const mockSchedules = [
  sched('met', 'Metformina', '850 mg', ['08:00:00', '14:00:00'], '2026-10-13'),
  sched('los', 'Losartán', '50 mg', ['23:30:00'], '2026-10-15'),
  // One day only, never recorded: 12 Oct is "algo sin registrar".
  { ...sched('asp', 'Aspirina', '100 mg', ['09:00:00'], '2026-10-12'), end_date: '2026-10-12' },
];
const row = (sid: string, at: Date, over: Partial<DoseRow>): DoseRow => ({
  id: `${sid}${at.getTime()}`, schedule_id: sid, patient_id: 'p1', scheduled_for: iso(at), status: 'given',
  recorded_at: iso(at), recorded_by: 'r', recorded_late: false, skip_reason: null, skip_note: null, ...over,
});
const mockDoseRows = [
  row('met', mockAt(13, 8), {}),
  row('met', mockAt(13, 14), { status: 'skipped', recorded_at: iso(mockAt(13, 14, 5)), skip_reason: 'refused' }),
  row('met', mockAt(14, 8), {}),
  row('met', mockAt(14, 14), {}),
  row('met', mockAt(15, 8), { recorded_at: iso(mockAt(15, 8, 20)) }),
  // 15 Oct 14:00 Metformina: no row → sin registrar; 23:30 Losartán: no row → pendiente
];
const mockReadings: ReadingRow[] = [
  {
    id: 'g', patient_id: 'p1', control_id: 'ctl1', kind: 'glucose', value: 262, value2: null, context: 'pre_meal', severity: 'alert',
    taken_at: iso(mockAt(15, 19, 45)), taken_by: 'r', note: null, family_notified: true,
  },
];
const mockEvents: EventRow[] = [
  { id: 'n1', patient_id: 'p1', author_id: 'c', type: 'note', title: 'A vigilar', body: 'Tos seca de vez en cuando.', severity: 'warning', occurred_at: iso(mockAt(15, 22, 30)) },
];
const mockHandoffs: HandoffRow[] = [
  { id: 'h1', patient_id: 'p1', nurse_id: 'r', summary: 'Tarde tranquila.', recommendation: null, started_at: iso(mockAt(15, 6)), ended_at: iso(mockAt(15, 22)) },
];

let mockPid: string | undefined = 'p1';
let mockRole: 'nurse' | 'family' = 'nurse';
let mockParams: { day?: string; filter?: string } = {};
let mockRefresh: (() => void) | undefined;
let mockTabPress: ((e: { preventDefault(): void }) => void) | undefined;
const mockNavigate = jest.fn();

// Params behave like expo-router's: setParams merges, a bare navigate replaces them,
// and both re-render the screen.
jest.mock('expo-router', () => {
  const { useReducer } = require('react');
  const router = {
    setParams: (p: object) => {
      mockParams = { ...mockParams, ...p };
      mockRefresh?.();
    },
    navigate: (href: string) => {
      mockNavigate(href);
      mockParams = {};
      mockRefresh?.();
    },
  };
  const navigation = {
    addListener: (_: 'tabPress', cb: typeof mockTabPress) => {
      mockTabPress = cb;
      return () => {
        if (mockTabPress === cb) mockTabPress = undefined;
      };
    },
  };
  return {
    useRouter: () => router,
    useNavigation: () => navigation,
    useLocalSearchParams: () => {
      mockRefresh = useReducer((n: number) => n + 1, 0)[1];
      return mockParams;
    },
  };
});
// A navigate() to the already-mounted tab.
const navigateHere = (p: typeof mockParams) => act(() => {
  mockParams = p;
  mockRefresh?.();
});
jest.mock('@/features/care/hooks', () => ({
  useCare: () => ({
    pid: mockPid, role: mockPid ? mockRole : null, meId: 'c', myName: 'Carmen Morales', meNurse: null, patient: null,
    short: 'el paciente', team: [], nurses: mockNurses, names: mockNames, now: mockAt(15, 23, 40),
  }),
  useSince: () => iso(mockAt(8, 0)),
  useSchedules: (pid?: string) => (pid ? mockSchedules : []),
  useDoseRows: (pid?: string) => (pid ? mockDoseRows : []),
  useReadings: (pid?: string) => (pid ? mockReadings : []),
  useEvents: (pid?: string) => (pid ? mockEvents : []),
  useHandoffs: (pid?: string) => (pid ? mockHandoffs : []),
}));

beforeEach(() => {
  mockPid = 'p1';
  mockRole = 'nurse';
  mockParams = {};
  mockNavigate.mockClear();
});

type Styled = { props: { style?: StyleProp<TextStyle> } };
const flat = (n: Styled): TextStyle => StyleSheet.flatten(n.props.style) ?? {};
// The day's status icon: its stroke colour and its shape (path data).
type PathNode = { props: { stroke?: string; d?: string } };
const markOf = (name: string) => {
  const p = screen.getByRole('button', { name }).findAll((n: PathNode) => typeof n.props.d === 'string' && !!n.props.stroke)[0];
  return p ? { stroke: p.props.stroke, d: p.props.d } : null;
};

const titles = () => screen.getAllByText(/^(Metformina|Losartán|Signos vitales|A vigilar|Rosa entregó)/).map((t) => t.props.children);

test('nurse sees today: header, summary and events newest first', () => {
  render(<NurseHistorial />);
  expect(screen.getByText('Historial')).toBeTruthy();
  expect(screen.getByText('Hoy, jueves 15 de octubre')).toBeTruthy();
  expect(screen.getByText('1 de 3 dosis dadas · 1 sin registrar · 1 pendiente')).toBeTruthy();
  expect(screen.getByText('1 control de signos · 1 alerta')).toBeTruthy();
  const today = screen.getByRole('button', { name: 'jueves 15, hoy: con alertas' });
  expect(today.props.accessibilityState.selected).toBe(true);
  expect(titles()).toEqual([
    'Losartán 50 mg', 'A vigilar', 'Rosa entregó el turno a Carmen', 'Signos vitales', 'Metformina 850 mg', 'Metformina 850 mg',
  ]);
  expect(screen.getByText('Glucosa 262 mg/dL · Alerta')).toBeTruthy();
  expect(screen.getByText('Sin registrar')).toBeTruthy();
  expect(screen.getByText('Pendiente')).toBeTruthy();
});

test('day marks read the day status by shape, not colour alone', () => {
  render(<Historial />);
  expect(screen.getByRole('button', { name: 'martes 13: algo a revisar' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'miércoles 14: todo normal' })).toBeTruthy();
  // Unselected days: each status has its own icon, in its colour.
  const unrec = markOf('lunes 12: algo sin registrar');
  const warn = markOf('martes 13: algo a revisar');
  const ok = markOf('miércoles 14: todo normal');
  expect([unrec?.stroke, warn?.stroke, ok?.stroke]).toEqual([colors.field, colors.warn, colors.ok]);
  expect(new Set([unrec?.d, warn?.d, ok?.d]).size).toBe(3);
  expect(markOf('viernes 9: sin registros')).toBeNull(); // an empty day has no mark
  // Selected day: pri fill, onPri text, and the icon keeps its shape in onPri.
  expect(flat(screen.getByRole('button', { name: 'jueves 15, hoy: con alertas' })).backgroundColor).toBe(colors.pri);
  expect(flat(screen.getByText('15')).color).toBe(colors.onPri);
  const alert = markOf('jueves 15, hoy: con alertas');
  expect(alert?.stroke).toBe(colors.onPri);
  expect([unrec?.d, warn?.d, ok?.d]).not.toContain(alert?.d);
  expect(flat(screen.getByRole('button', { name: 'martes 13: algo a revisar' })).backgroundColor).toBe(colors.surface);
  expect(flat(screen.getByText('13')).color).toBe(colors.ink);
});

test('tapping the Historial tab reopens today with Todo', () => {
  mockRole = 'family';
  mockParams = { day: '2026-10-13', filter: 'med' };
  render(<FamilyHistorial />);
  expect(screen.getByText(/^martes 13 de octubre/)).toBeTruthy();
  const e = { preventDefault: jest.fn() };
  act(() => mockTabPress?.(e));
  expect(e.preventDefault).toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith('/family/historial');
  expect(screen.getByText(/^Hoy, jueves 15 de octubre/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Todo' }).props.accessibilityState.selected).toBe(true);
});

test('nurse tab press goes to the nurse route', () => {
  render(<NurseHistorial />);
  act(() => mockTabPress?.({ preventDefault: () => {} }));
  expect(mockNavigate).toHaveBeenCalledWith('/nurse/historial');
});

test('picking a past day shows its events, skipped reason included', () => {
  render(<Historial />);
  fireEvent.press(screen.getByRole('button', { name: 'martes 13: algo a revisar' }));
  expect(screen.getByText('martes 13 de octubre')).toBeTruthy();
  expect(screen.getByText('1 de 2 dosis dadas · 1 no se dio')).toBeTruthy();
  expect(screen.getByText('Omitida')).toBeTruthy();
  expect(screen.getByText(/Lo rechazó/)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'viernes 9: sin registros' }));
  expect(screen.getByText('No hay nada de este tipo ese día.')).toBeTruthy();
});

test('filters narrow the list', () => {
  render(<Historial />);
  fireEvent.press(screen.getByRole('button', { name: 'Medicación' }));
  expect(screen.getByRole('button', { name: 'Medicación' }).props.accessibilityState.selected).toBe(true);
  expect(titles()).toEqual(['Losartán 50 mg', 'Metformina 850 mg', 'Metformina 850 mg']);
  fireEvent.press(screen.getByRole('button', { name: 'Notas y relevos' }));
  expect(titles()).toEqual(['A vigilar', 'Rosa entregó el turno a Carmen']);
  fireEvent.press(screen.getByRole('button', { name: 'Signos' }));
  expect(titles()).toEqual(['Signos vitales']);
});

test('family sub names who writes', () => {
  mockRole = 'family';
  render(<FamilyHistorial />);
  expect(screen.getByText('Hoy, jueves 15 de octubre · lo que anotan Carmen y Rosa')).toBeTruthy();
});

test('search params pick the day and filter, clamped to the window', () => {
  mockParams = { day: '2026-10-13', filter: 'med' };
  const { unmount } = render(<Historial />);
  expect(screen.getByText('martes 13 de octubre')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Medicación' }).props.accessibilityState.selected).toBe(true);
  expect(titles()).toEqual(['Metformina 850 mg', 'Metformina 850 mg']);
  unmount();

  mockParams = { day: '2026-09-01' };
  render(<Historial />);
  expect(screen.getByText('viernes 9 de octubre')).toBeTruthy();
});

test('a repeated deep link wins over taps on the mounted tab', () => {
  mockParams = { day: '2026-10-13', filter: 'med' };
  render(<Historial />);
  fireEvent.press(screen.getByRole('button', { name: 'Todo' }));
  fireEvent.press(screen.getByRole('button', { name: 'jueves 15, hoy: con alertas' }));
  expect(screen.getByText('Hoy, jueves 15 de octubre')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Todo' }).props.accessibilityState.selected).toBe(true);

  navigateHere({ day: '2026-10-13', filter: 'med' });
  expect(screen.getByText('martes 13 de octubre')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Medicación' }).props.accessibilityState.selected).toBe(true);
  expect(titles()).toEqual(['Metformina 850 mg', 'Metformina 850 mg']);
});

test('a future day param falls back to today', () => {
  mockParams = { day: '2026-12-01', filter: 'bogus' };
  render(<Historial />);
  expect(screen.getByText('Hoy, jueves 15 de octubre')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Todo' }).props.accessibilityState.selected).toBe(true);
});

test('no patient yet: join hint', () => {
  mockPid = undefined;
  render(<Historial />);
  expect(screen.getByText('Aún no sigues a ningún paciente. Únete con el código que te dé la enfermera.')).toBeTruthy();
  expect(screen.queryByText(/dosis dadas/)).toBeNull();
});
