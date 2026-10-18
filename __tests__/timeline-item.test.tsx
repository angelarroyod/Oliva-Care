import { render, screen } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { TimelineItem } from '@/components/TimelineItem';
import type { TimelineEvent } from '@/features/care/timeline';
import { colors } from '@/theme';

let mockPct = 100;
jest.mock('@/features/settings/textScale', () => ({ useTextScale: () => ({ pct: mockPct, setPct: () => {} }) }));
beforeEach(() => {
  mockPct = 100;
});
type Styled = { props: { style?: StyleProp<TextStyle> } };
const flat = (n: Styled): TextStyle => StyleSheet.flatten(n.props.style) ?? {};

const ev = (over: Partial<TimelineEvent>): TimelineEvent => ({
  id: 'x', kind: 'med', status: 'given', at: new Date(2026, 9, 15, 8, 0), time: '08:00',
  title: 'Metformina 850 mg', who: '', detail: '', reason: '', values: [], ...over,
});

test.each([
  ['given', 'Dada'],
  ['skipped', 'Omitida'],
  ['unrecorded', 'Sin registrar'],
  ['pending', 'Pendiente'],
  ['ok', 'Normal'],
  ['warn', 'Atención'],
  ['alert', 'Alerta'],
] as const)('%s shows the "%s" badge', (status, word) => {
  render(<TimelineItem event={ev({ status })} last={false} />);
  expect(screen.getByText(word)).toBeTruthy();
});

test('info notes and handoffs have no badge', () => {
  render(
    <>
      <TimelineItem event={ev({ id: 'n', kind: 'note', status: 'info', title: 'Nota' })} last={false} />
      <TimelineItem event={ev({ id: 'h', kind: 'handoff', status: 'info', title: 'Rosa entregó el turno a Carmen' })} last />
    </>,
  );
  for (const w of ['Dada', 'Normal', 'Pendiente', 'Alerta']) expect(screen.queryByText(w)).toBeNull();
});

test('vitals chips spell out the state, reason, detail and who', () => {
  render(
    <TimelineItem
      event={ev({
        kind: 'vitals', status: 'alert', time: '19:45', title: 'Signos vitales', who: 'Rosa García', detail: 'Se avisó a la familia.',
        values: [
          { label: 'Glucosa', value: '262 mg/dL', status: 'alert' },
          { label: 'Presión', value: '138/86', status: 'ok' },
          { label: 'Pulso', value: '104', status: 'warn' },
        ],
      })}
      last
    />,
  );
  expect(screen.getByText('Glucosa 262 mg/dL · Alerta')).toBeTruthy();
  expect(screen.getByText('Presión 138/86')).toBeTruthy();
  expect(screen.getByText('Pulso 104 · Atención')).toBeTruthy();
  expect(screen.getByText('Se avisó a la familia.')).toBeTruthy();
  expect(screen.getByText('Rosa García')).toBeTruthy();
  expect(
    screen.getByLabelText('19:45. Signos vitales. Alerta. Glucosa 262 mg/dL · Alerta. Presión 138/86. Pulso 104 · Atención. Se avisó a la familia. Rosa García.'),
  ).toBeTruthy();
});

test('skipped dose shows Motivo and a warn card', () => {
  render(<TimelineItem event={ev({ status: 'skipped', reason: 'Lo rechazó', who: 'Rosa García' })} last={false} />);
  expect(screen.getByText(/Lo rechazó/)).toBeTruthy();
  expect(screen.getByText('Motivo:')).toBeTruthy();
  expect(screen.getByLabelText(/Motivo: Lo rechazó/)).toBeTruthy();
  let node = screen.getByText('Motivo:').parent;
  while (node && StyleSheet.flatten(node.props.style)?.borderRadius !== 16) node = node.parent;
  const card = StyleSheet.flatten(node!.props.style);
  expect(card.backgroundColor).toBe(colors.warnSoft);
  expect(card.borderColor).toBe(colors.warn);
});

test('the rail line stops at the dot on the last item', () => {
  const rail = () => screen.UNSAFE_root.findAll((n: Styled & { type: unknown }) => typeof n.type === 'string' && flat(n).width === 2 && flat(n).backgroundColor === colors.line);
  const { unmount } = render(<TimelineItem event={ev({})} last={false} />);
  expect(rail()).toHaveLength(1);
  expect(flat(rail()[0])).toMatchObject({ top: 0, bottom: 0 });
  expect(flat(rail()[0]).height).toBeUndefined();
  unmount();
  render(<TimelineItem event={ev({})} last />);
  expect(flat(rail()[0])).toMatchObject({ top: 0, height: 20 });
  expect(flat(rail()[0]).bottom).toBeUndefined();
});

test('at 200 % text the time grows instead of breaking and the badge can wrap', () => {
  mockPct = 200;
  render(<TimelineItem event={ev({ status: 'unrecorded', time: '23:40' })} last={false} />);
  const time = screen.getByText('23:40');
  expect(time.props.numberOfLines).toBe(1);
  expect(flat(time)).toMatchObject({ fontSize: 32, minWidth: 50, flexShrink: 0 });
  expect(flat(time).width).toBeUndefined();
  const title = screen.getByText('Metformina 850 mg');
  expect(flat(title)).toMatchObject({ flex: 1, minWidth: 192 });
  let head = title.parent;
  while (head && flat(head).justifyContent !== 'space-between') head = head.parent;
  expect(flat(head!).flexWrap).toBe('wrap');
});

test('pending badge is the soft pill, not the dashed box', () => {
  render(<TimelineItem event={ev({ status: 'pending' })} last={false} />);
  // nearest ancestor that is the pill (radius 999)
  let node = screen.getByText('Pendiente').parent;
  while (node && StyleSheet.flatten(node.props.style)?.borderRadius !== 999) node = node.parent;
  const style = StyleSheet.flatten(node!.props.style);
  expect(style.backgroundColor).toBe(colors.priSoft);
  expect(style.borderWidth).toBe(0);
});
