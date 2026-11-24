import { colors, dark, font, light, radius } from '@/theme';

// WCAG relative luminance contrast ratio.
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Both appearances pass the same checks.
describe.each([['light', light], ['dark', dark]])('%s palette', (_name, c) => {
  test('text pairs meet 4.5:1', () => {
    const pairs: [string, string][] = [
      [c.ink, c.bg], [c.ink2, c.bg], [c.ink2, c.surface], [c.ink2, c.priSoft],
      [c.pri, c.surface], [c.pri, c.bg], [c.pri, c.priSoft], [c.onPri, c.pri], [c.onPri, c.ok], [c.onPri, c.danger],
      [c.white, c.hero], [c.heroSub, c.hero], [c.heroSub, c.heroAlert], [c.white, c.heroAlert],
      [c.ok, c.surface], [c.ok, c.priSoft], [c.danger, c.surface], [c.danger, c.dangerSoft], [c.warnInk, c.warnSoft],
      [c.bg, c.ink], // toast
      [c.ink2, c.welcome], [c.logoInk, c.welcome],
    ];
    expect(pairs.filter(([fg, bg]) => contrast(fg, bg) < 4.5)).toEqual([]); // failures name the pair
  });

  test('input borders and status marks meet 3:1 (non-text)', () => {
    expect(contrast(c.field, c.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(c.field, c.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(c.warn, c.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(c.focus, c.surface)).toBeGreaterThanOrEqual(3);
  });
});

test('light: the primary is the logo ink; dark: the reversed logo is Crema with the leaf cut out', () => {
  expect(light.pri).toBe(light.logoInk);
  expect(dark.logoInk).toBe('#F5F2E6');
  expect(dark.logoLeaf).toBe('transparent');
});

test('the hero is olive in both appearances', () => {
  expect(dark.hero).toBe(light.hero);
  expect(dark.heroAlert).toBe(light.heroAlert);
});

test('tests run in the light appearance', () => {
  expect(colors).toBe(light);
});

test('Atkinson Hyperlegible Next', () => {
  expect(font.regular).toBe('AtkinsonHyperlegibleNext_400Regular');
  expect(font.bold).toBe('AtkinsonHyperlegibleNext_700Bold');
  expect(radius.card).toBe(16);
});
