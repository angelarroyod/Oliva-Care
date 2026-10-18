import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { Pressable } from 'react-native';
import { Button } from '@/components/Button';
import { Avatar, initialsOf } from '@/components/Avatar';
import { Chip, Field, SwitchRow, CheckRow } from '@/components/Controls';
import { Notice, Badge, ProgressBar } from '@/components/Status';
import { Sheet } from '@/components/Sheet';
import { T } from '@/components/T';
import { ToastProvider, ToastHost, useToast, TOAST_MS } from '@/components/Toast';
import { TextScaleProvider, useTextScale, clampScale } from '@/features/settings/textScale';

test('Button fires onPress and respects disabled', () => {
  const fn = jest.fn();
  const { rerender } = render(<Button label="Guardar" onPress={fn} />);
  fireEvent.press(screen.getByText('Guardar'));
  expect(fn).toHaveBeenCalledTimes(1);
  rerender(<Button label="Guardar" onPress={fn} disabled />);
  fireEvent.press(screen.getByText('Guardar'));
  expect(fn).toHaveBeenCalledTimes(1);
});

test('Avatar shows initials', () => {
  render(<Avatar initials={initialsOf('Carmen Morales')} />);
  // decorative: hidden from screen readers (the surrounding button carries the label)
  expect(screen.getByText('CM', { includeHiddenElements: true })).toBeTruthy();
});

test('Chip is a radio with checked state', () => {
  const fn = jest.fn();
  render(<Chip label="Lo rechazó" selected onPress={fn} />);
  const chip = screen.getByRole('radio');
  expect(chip.props.accessibilityState.checked).toBe(true);
  fireEvent.press(chip);
  expect(fn).toHaveBeenCalled();
});

test('SwitchRow toggles', () => {
  const fn = jest.fn();
  render(<SwitchRow title="Avisar a la familia" value={false} onChange={fn} />);
  fireEvent.press(screen.getByRole('switch'));
  expect(fn).toHaveBeenCalledWith(true);
});

test('CheckRow ignores presses when disabled', () => {
  const fn = jest.fn();
  render(<CheckRow checked onPress={fn} disabled><T>Ya se mide</T></CheckRow>);
  fireEvent.press(screen.getByRole('checkbox'));
  expect(fn).not.toHaveBeenCalled();
});

test('Field shows a visible label and an announced error', () => {
  render(<Field label="Correo electrónico" error="Escribe tu correo completo" value="" onChangeText={() => {}} />);
  expect(screen.getByText('Correo electrónico')).toBeTruthy();
  expect(screen.getByRole('alert')).toBeTruthy();
});

test('Notice, Badge and ProgressBar render words, not just colour', () => {
  render(
    <>
      <Notice tone="alert" lead="Importante:">glucosa 262 mg/dL</Notice>
      <Badge tone="skipped" label="Omitida" />
      <ProgressBar value={5} max={7} label="5 de 7 dosis dadas hoy" />
    </>,
  );
  expect(screen.getByText(/Importante:/)).toBeTruthy();
  expect(screen.getByText('Omitida')).toBeTruthy();
  expect(screen.getByLabelText('5 de 7 dosis dadas hoy')).toBeTruthy();
});

test('Sheet always ends with Volver', () => {
  const close = jest.fn();
  render(<Sheet visible title="¿Por qué no se dio?" onClose={close}><T>contenido</T></Sheet>);
  fireEvent.press(screen.getByText('Volver'));
  expect(close).toHaveBeenCalled();
});

test('text scale multiplies font sizes and clamps to 100–200 %', () => {
  expect(clampScale(250)).toBe(200);
  expect(clampScale(94)).toBe(100);
  let setPct: (n: number) => void = () => {};
  function Probe() {
    setPct = useTextScale().setPct;
    return <T size={16}>Hola</T>;
  }
  render(<TextScaleProvider><Probe /></TextScaleProvider>);
  act(() => setPct(150));
  const style = [screen.getByText('Hola').props.style].flat(Infinity).reduce((a: object, b: object) => ({ ...a, ...b }), {});
  expect(style.fontSize).toBe(24);
});

test('toast shows, undoes, and auto-dismisses after 7 s', () => {
  jest.useFakeTimers();
  const undo = jest.fn();
  function Trigger() {
    const { show } = useToast();
    return <Pressable accessibilityRole="button" onPress={() => show('Control guardado.', undo)}><T>go</T></Pressable>;
  }
  render(<ToastProvider><Trigger /><ToastHost /></ToastProvider>);
  fireEvent.press(screen.getByText('go'));
  expect(screen.getByText('Control guardado.')).toBeTruthy();
  fireEvent.press(screen.getByText('Deshacer'));
  expect(undo).toHaveBeenCalled();
  expect(screen.queryByText('Control guardado.')).toBeNull();
  fireEvent.press(screen.getByText('go'));
  act(() => jest.advanceTimersByTime(TOAST_MS));
  expect(screen.queryByText('Control guardado.')).toBeNull();
  jest.useRealTimers();
});
