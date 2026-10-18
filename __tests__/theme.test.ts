import { colors, font, radius } from '@/theme';

test('Tend palette tokens', () => {
  expect(colors.bg).toBe('#F4FAF7');
  expect(colors.ink).toBe('#0E2F2B');
  expect(colors.pri).toBe('#0F5C52');
  expect(colors.danger).toBe('#A3321F');
});

test('Atkinson Hyperlegible Next + Bricolage wordmark', () => {
  expect(font.regular).toBe('AtkinsonHyperlegibleNext_400Regular');
  expect(font.bold).toBe('AtkinsonHyperlegibleNext_700Bold');
  expect(font.brand).toBe('BricolageGrotesque_800ExtraBold');
  expect(radius.card).toBe(16);
});
