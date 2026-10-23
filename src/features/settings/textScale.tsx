import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { readPref, writePref } from '@/lib/prefs';

// In-app text size (Configuración → Tamaño del texto), 100–200 % in steps of 10.
// Multiplies every font size on top of the OS font scale.
const KEY = 'tend.textScale';
export const MIN_SCALE = 100;
export const MAX_SCALE = 200;

export const clampScale = (pct: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(pct / 10) * 10));

type Ctx = { pct: number; setPct: (pct: number) => void };
const TextScaleContext = createContext<Ctx>({ pct: MIN_SCALE, setPct: () => {} });

export function TextScaleProvider({ children }: { children: ReactNode }) {
  const [pct, setState] = useState(MIN_SCALE);
  useEffect(() => {
    readPref(KEY).then((v) => {
      const n = Number(v);
      if (v && Number.isFinite(n)) setState(clampScale(n));
    });
  }, []);
  const setPct = (next: number) => {
    const c = clampScale(next);
    setState(c);
    writePref(KEY, String(c));
  };
  return <TextScaleContext.Provider value={{ pct, setPct }}>{children}</TextScaleContext.Provider>;
}

export const useTextScale = () => use(TextScaleContext);
