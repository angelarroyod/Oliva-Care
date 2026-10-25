import { Appearance } from 'react-native';

// Oliva design tokens. Status always pairs colour with an icon and a word —
// never colour alone. The palette is the olive leaf: `pri` is the dark upper
// side (haz, the logo ink), `bg` the silvery underside (envés). Contrast
// (WCAG): ink/bg 13.4, ink2/bg 7.0, pri/surface 7.8, heroSub/pri 6.0, field/surface 5.0.
export const light = {
  bg: '#F1F3EC', // app background: envés, the silver underside of the leaf
  surface: '#FFFFFF', // cards, sheets, inputs
  ink: '#1F2A18', // primary text
  ink2: '#4A5641', // secondary text
  line: '#D6DDCB', // card borders, dividers
  field: '#69735E', // input borders, dashed "unrecorded" borders, inactive controls
  pri: '#3A5A2C', // primary buttons, active states, links (= logoInk)
  onPri: '#FFFFFF', // text and icons on a pri, ok or danger fill
  priSoft: '#E4ECD6', // selected chips, soft badges, info boxes
  hero: '#3A5A2C', // the hero card: olive in both appearances, white text on it
  heroAlert: '#A3321F', // the fever hero
  heroSub: '#D9E7C3', // secondary text on either hero
  ok: '#1F6A4A', // "Normal" / "Dada" text and icons: teal-green, kept apart from olive pri
  warn: '#A35E00', // warning borders and dots
  warnSoft: '#FDEBD3', // warning backgrounds
  warnInk: '#663A00', // warning text
  danger: '#A3321F', // alert borders and text; destructive buttons
  dangerSoft: '#FBE4DE', // alert backgrounds
  welcome: '#E6ECDA', // welcome background, logo tile
  logoInk: '#3A5A2C', // Oliva "Olivo": logo disc and wordmark
  logoLeaf: '#A9BD7A', // "Hoja" inside the disc; transparent in the reversed (dark) logo
  logoAccent: '#A9BD7A', // "Hoja" on the olive hero
  focus: '#1B6FD8',
  overlay: 'rgba(10,20,15,0.5)',
  white: '#FFFFFF',
};

// Dark: the leaf turns into the accent (pri/surface 7.9, onPri/pri 8.7), the
// hero stays olive, and the logo is the reversed one-colour cut in Crema
// (design/logo/oliva/kit/GUIDE.md). ink/bg 15.4, ink2/surface 7.6, field/surface 4.4.
export const dark: typeof light = {
  bg: '#121610',
  surface: '#1C2219',
  ink: '#E8EDE0',
  ink2: '#AAB59F',
  line: '#323B2C',
  field: '#7E8973',
  pri: '#A9BD7A',
  onPri: '#141A10',
  priSoft: '#2A3622',
  hero: '#3A5A2C',
  heroAlert: '#A3321F',
  heroSub: '#D9E7C3',
  ok: '#7FD1A6',
  warn: '#E0A040',
  warnSoft: '#3A2A12',
  warnInk: '#F3C47E',
  danger: '#F2917C',
  dangerSoft: '#3B1D16',
  welcome: '#2A3622', // olive-tinted, so the surface panel below it still reads as a sheet
  logoInk: '#F5F2E6',
  logoLeaf: 'transparent',
  logoAccent: '#A9BD7A',
  focus: '#6AA6FF',
  overlay: 'rgba(0,0,0,0.6)',
  white: '#FFFFFF',
};

// ponytail: the appearance is read once at launch, because the StyleSheets
// below every screen are built at module scope. A system switch while the app
// runs applies on the next launch; live switching needs a useColors() hook and
// styles built per render.
export const scheme: 'light' | 'dark' = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
export const colors = scheme === 'dark' ? dark : light;

export const font = {
  regular: 'AtkinsonHyperlegibleNext_400Regular',
  bold: 'AtkinsonHyperlegibleNext_700Bold',
};

export const radius = { card: 16, input: 14, back: 14, pill: 999, day: 14, sheet: 28 };

// Only the floating layer (toast, tab bar) casts a shadow.
export const shadow = {
  toast: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  float: { shadowColor: '#1F2A18', shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
};

// Glass fallback where the system material isn't available (web, Android,
// Reduce Transparency): the fill over a backdrop blur, or the opaque fill.
export const glass =
  scheme === 'dark'
    ? { fill: 'rgba(28,34,25,0.72)', opaque: '#1C2219', rim: 'rgba(255,255,255,0.12)', selected: 'rgba(169,189,122,0.18)' }
    : {
        fill: 'rgba(250,251,247,0.72)',
        opaque: '#FAFBF7',
        rim: 'rgba(255,255,255,0.7)', // 1px highlight on the edge; opaque swaps in `line`
        selected: 'rgba(58,90,44,0.12)', // the lens behind the selected tab (pri at 12 %)
      };
