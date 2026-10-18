// Local-time helpers. Spanish names are spelled out by hand: Hermes' Intl
// support for 'es' isn't guaranteed on Android, and tests must not depend on ICU.
export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const WEEKDAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const MINUTE = 60_000;
const pad2 = (n: number) => String(n).padStart(2, '0');

// 'HH:MM' or 'HH:MM:SS' → minutes since midnight.
export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

// minutes → 'HH:MM', wrapping around midnight.
export const fromMin = (m: number) => {
  const w = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(w / 60))}:${pad2(w % 60)}`;
};

// Postgres time 'HH:MM:SS' → 'HH:MM'.
export const shortTime = (t: string) => t.slice(0, 5);

export const hhmm = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const minOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
export const localDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const sameDay = (a: Date, b: Date) => localDate(a) === localDate(b);
// Local instant for a wall-clock time on a day (the local constructor handles DST).
export const atTime = (day: Date, t: string) => {
  const [h, m] = t.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
};
// Monday 00:00 of the week containing d.
export const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
export const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / MINUTE);

// "jueves 15 de octubre"
export const longDate = (d: Date) => `${WEEKDAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
// "15 de octubre"
export const dayMonth = (d: Date) => `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
// "del 12 al 18 de octubre" / "del 29 de septiembre al 5 de octubre"
export const weekRange = (monday: Date) => {
  const sunday = addDays(monday, 6);
  return monday.getMonth() === sunday.getMonth()
    ? `del ${monday.getDate()} al ${dayMonth(sunday)}`
    : `del ${dayMonth(monday)} al ${dayMonth(sunday)}`;
};

// "hoy" / "ayer" / "el martes" / "el 3 de octubre" relative to now.
export const relativeDay = (d: Date, now: Date) => {
  const diff = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / (24 * 60 * MINUTE));
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'ayer';
  if (diff > 1 && diff < 7) return `el ${WEEKDAYS[d.getDay()]}`;
  return `el ${dayMonth(d)}`;
};

export const greeting = (now: Date) => {
  const h = now.getHours();
  return h >= 6 && h < 13 ? 'Buenos días' : h >= 13 && h < 21 ? 'Buenas tardes' : 'Buenas noches';
};

// Text helpers shared by the copy builders.
export const listY = (a: string[]) => (a.length < 2 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} y ${a[a.length - 1]}`);
export const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? '';
// Accepts "37,5" or "37.5"; '' / garbage → null.
export const num = (raw: string | number | null | undefined): number | null => {
  if (raw === '' || raw == null) return null;
  const s = String(raw).trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return parseFloat(s);
};
