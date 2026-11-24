import { render, renderHook, screen } from '@testing-library/react-native';
import { StyleSheet, type TextStyle } from 'react-native';
import * as RN from 'react-native';
import { TabBarIcon, tabOptions, useTabScreenOptions } from '@/components/TabBarIcon';

// In-app text size at 200 %.
jest.mock('@/features/settings/textScale', () => ({ useTextScale: () => ({ pct: 200, setPct: () => {} }) }));

test('renders focused color', () => {
  expect(() => render(<TabBarIcon name="home" focused />)).not.toThrow();
});

test('renders unfocused', () => {
  expect(() => render(<TabBarIcon name="user" focused={false} />)).not.toThrow();
});

test('tab title ignores the in-app text size and caps the OS size', () => {
  render(<>{tabOptions('Inicio', 'home').tabBarLabel({ focused: true })}</>);
  const label = screen.getByText('Inicio');
  expect((StyleSheet.flatten(label.props.style) as TextStyle).fontSize).toBe(13);
  expect(label.props.maxFontSizeMultiplier).toBe(1.3);
});

test('the bar grows with the OS text size, up to the cap', () => {
  const dims = (fontScale: number) => ({ width: 375, height: 812, scale: 3, fontScale });
  const spy = jest.spyOn(RN.Dimensions, 'get').mockReturnValue(dims(1));
  const height = () => (renderHook(() => useTabScreenOptions()).result.current.tabBarStyle as { height: number }).height;
  expect(height()).toBe(66);
  spy.mockReturnValue(dims(2.35)); // AX3
  expect(height()).toBe(70); // 13 × 1.2 × 1.3, not × 2.35
  spy.mockRestore();
});

// iOS/Android use the system tab bar (_layout.tsx); web keeps the JS bar (_layout.web.tsx).
// Same tabs, labels and order as the web bar.
import type { ReactElement } from 'react';
import NurseTabs from '../app/(app)/nurse/(tabs)/_layout';
import FamilyTabs from '../app/(app)/family/(tabs)/_layout';

type El = ReactElement<{ name: string; children: ReactElement<{ children?: string; sf?: unknown; md?: unknown }>[] }>;
const nativeTabs = (Layout: () => ReactElement<{ children: El[] }>) =>
  Layout().props.children.map((t) => {
    const label = t.props.children.find((c) => typeof c.props.children === 'string')!.props.children;
    const icon = t.props.children.find((c) => c.props.sf)!.props;
    expect(icon.md).toBeTruthy(); // Android needs its own Material symbol
    return [t.props.name, label];
  });

test('the system tab bar lists every tab with its Spanish label', () => {
  expect(nativeTabs(NurseTabs as never)).toEqual([['inicio', 'Inicio'], ['signos', 'Signos'], ['historial', 'Historial'], ['relevo', 'Relevo'], ['perfil', 'Perfil']]);
  expect(nativeTabs(FamilyTabs as never)).toEqual([['inicio', 'Estado'], ['historial', 'Historial'], ['mensajes', 'Mensajes'], ['perfil', 'Perfil']]);
});
