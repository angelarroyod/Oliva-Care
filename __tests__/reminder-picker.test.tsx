import { AccessibilityInfo } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ReminderPicker } from '@/components/ReminderPicker';
import { ReasonChip } from '@/components/ReasonChip';

test('before mode previews each reminder and reports chip changes', () => {
  const onChange = jest.fn();
  render(<ReminderPicker times={['08:00', '20:00:00']} mode="before" minutes={15} onChange={onChange} />);
  expect(screen.getByText('Suena a las 08:00 y a las 20:00')).toBeTruthy();
  expect(screen.getByText('Sonará a las 07:45 y a las 19:45, 15 min antes de cada dosis.')).toBeTruthy();
  expect(screen.getByRole('radio', { name: /Unos minutos antes/ }).props.accessibilityState.checked).toBe(true);

  fireEvent.press(screen.getByText('10 min'));
  expect(onChange).toHaveBeenLastCalledWith({ mode: 'before', minutes: 10 });
  expect(screen.getByText('Sonará a las 07:50 y a las 19:50, 10 min antes de cada dosis.')).toBeTruthy();

  fireEvent.press(screen.getByText('A la hora exacta'));
  expect(onChange).toHaveBeenLastCalledWith({ mode: 'exact', minutes: 0 });
  expect(screen.getByText('Sonará a las 08:00 y a las 20:00, justo a la hora de cada dosis.')).toBeTruthy();
  expect(screen.queryByText('10 min')).toBeNull();
});

test('exact stored as 0 offers 15 when switching to before; three times read "a, b y a las c"', () => {
  const onChange = jest.fn();
  render(<ReminderPicker times={['06:00', '14:00', '22:00']} mode="exact" minutes={0} onChange={onChange} />);
  expect(screen.getByText('Sonará a las 06:00, 14:00 y a las 22:00, justo a la hora de cada dosis.')).toBeTruthy();
  fireEvent.press(screen.getByText('Unos minutos antes'));
  expect(onChange).toHaveBeenLastCalledWith({ mode: 'before', minutes: 15 });
  expect(screen.getByText('Sonará a las 05:45, 13:45 y a las 21:45, 15 min antes de cada dosis.')).toBeTruthy();
});

test('"Otro" opens a 5-minute stepper clamped to 5–120', () => {
  const onChange = jest.fn();
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  render(<ReminderPicker times={['06:00']} mode="before" minutes={115} onChange={onChange} />);
  // 115 isn't a preset, so the custom stepper is already open
  expect(screen.getByText('115 min antes')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Cinco minutos más'));
  expect(onChange).toHaveBeenLastCalledWith({ mode: 'before', minutes: 120 });
  expect(screen.getByText('Sonará a las 04:00, 120 min antes de cada dosis.')).toBeTruthy();
  // VoiceOver has no live regions: the new value is announced
  expect(announce).toHaveBeenLastCalledWith('120 min antes');
  expect(screen.getByLabelText('Cinco minutos más').props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByLabelText('Cinco minutos menos'));
  expect(onChange).toHaveBeenLastCalledWith({ mode: 'before', minutes: 115 });
  expect(announce).toHaveBeenLastCalledWith('115 min antes');
  announce.mockRestore();

  fireEvent.press(screen.getByText('5 min'));
  expect(screen.queryByLabelText('Cinco minutos menos')).toBeNull();
  fireEvent.press(screen.getByText('Otro'));
  // the custom value is remembered while switching chips
  expect(screen.getByText('115 min antes')).toBeTruthy();
});

test('props that arrive later show until the user touches the picker', () => {
  const { rerender } = render(<ReminderPicker times={['06:00']} mode="before" minutes={15} onChange={() => {}} />);
  rerender(<ReminderPicker times={['06:00']} mode="before" minutes={30} onChange={() => {}} />);
  expect(screen.getByText('Sonará a las 05:30, 30 min antes de cada dosis.')).toBeTruthy();
});

test('without valid times the preview drops the list', () => {
  render(<ReminderPicker times={[]} mode="before" minutes={15} onChange={() => {}} />);
  expect(screen.getByText('Sonará 15 min antes de cada dosis.')).toBeTruthy();
});

test('ReasonChip is a radio that reports selection and respects disabled', () => {
  const onSelect = jest.fn();
  const { rerender } = render(<ReasonChip label="Paciente dormido" selected={false} onSelect={onSelect} />);
  const chip = screen.getByRole('radio', { name: 'Paciente dormido' });
  expect(chip.props.accessibilityState).toEqual({ checked: false, disabled: false });
  fireEvent.press(chip);
  expect(onSelect).toHaveBeenCalledTimes(1);
  rerender(<ReasonChip label="Paciente dormido" selected={false} disabled onSelect={onSelect} />);
  fireEvent.press(screen.getByRole('radio', { name: 'Paciente dormido' }));
  expect(onSelect).toHaveBeenCalledTimes(1);
});
