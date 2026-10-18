import { render, screen } from '@testing-library/react-native';
import { TrendCard, chartPaths, type TrendCardProps } from '@/components/TrendCard';

// Days 0 and 1 in week 1 (1 is high), days 21 and 22 this week (22 is past the alert band).
const points: (number | null)[] = Array(28).fill(null);
points[0] = 100;
points[1] = 150;
points[21] = 100;
points[22] = 200;

test('chartPaths builds lines, bands and out-of-range dots', () => {
  const g = chartPaths(points, [90, 140], [80, 180], [80, 200]);
  expect(g.prevPath).toBe('M0 103.3 L11.8 56.7 M247.3 103.3');
  expect(g.curPath).toBe('M247.3 103.3 L259.1 10.0');
  expect(g.warnDots).toBe('M8.3 56.7a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0');
  expect(g.alertDots).toBe('M254.1 10.0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0');
  expect(g.seps).toBe('M76.5 0V132M159.0 0V132M241.4 0V132');
  expect([g.bandY, g.bandH, g.curX, g.curW]).toEqual([66, 46.7, 241.4, 80.6]);
  expect([g.readings, g.outCur]).toEqual([2, 1]);
});

const props: TrendCardProps = {
  title: 'Glucosa antes de cenar', status: 'alert', word: '1 alerta', summary: 'Hoy a las 19:45 llegó a 262.',
  compare: 'La semana pasada hubo 1 lectura fuera de su rango.', bandLabel: 'Rango de Elena (90 a 150)',
  points, band: [90, 140], alertBand: [80, 180], domain: [80, 200],
  weeks: ['21 sep', '28 sep', '5 oct', 'Esta semana'], emptyText: 'Aún no hay suficientes lecturas.',
};

test('TrendCard shows the badge, labelled chart, legend and comparison', () => {
  render(<TrendCard {...props} />);
  expect(screen.getByRole('header', { name: 'Glucosa antes de cenar' })).toBeTruthy();
  expect(screen.getByText('1 alerta')).toBeTruthy();
  expect(screen.getByText('Hoy a las 19:45 llegó a 262.')).toBeTruthy();
  expect(screen.getByLabelText('Glucosa antes de cenar: gráfica de 4 semanas. Esta semana, 2 días con lecturas, 1 fuera de su rango.')).toBeTruthy();
  expect(screen.getByText('Rango de Elena (90 a 150)')).toBeTruthy();
  expect(screen.getByText('La semana pasada hubo 1 lectura fuera de su rango.')).toBeTruthy();
});

test('TrendCard empty state shows only the title and the empty text', () => {
  render(<TrendCard {...props} status="empty" />);
  expect(screen.getByText('Aún no hay suficientes lecturas.')).toBeTruthy();
  expect(screen.queryByText('1 alerta')).toBeNull();
  expect(screen.queryByText('Hoy a las 19:45 llegó a 262.')).toBeNull();
  expect(screen.queryByLabelText(/gráfica de 4 semanas/)).toBeNull();
});
