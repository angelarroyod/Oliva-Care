// Tend design tokens (design_handoff_tend_care_features). Status always pairs
// colour with an icon and a word — never colour alone.
export const colors = {
  bg: '#F4FAF7', // app background
  surface: '#FFFFFF', // cards, sheets, inputs
  ink: '#0E2F2B', // primary text
  ink2: '#3E5B56', // secondary text
  line: '#CFE5DB', // card borders, dividers
  field: '#5E7A74', // input borders, dashed "unrecorded" borders, inactive controls
  pri: '#0F5C52', // primary buttons, active states, hero card
  priSoft: '#D9EEE7', // selected chips, soft badges, info boxes
  heroSub: '#CDEFE4', // secondary text on the pri hero
  ok: '#1F6A4A', // "Normal" / "Dada" text and icons
  warn: '#A35E00', // warning borders and dots
  warnSoft: '#FDEBD3', // warning backgrounds
  warnInk: '#663A00', // warning text
  danger: '#A3321F', // alert borders and text; fever hero; destructive buttons
  dangerSoft: '#FBE4DE', // alert backgrounds
  welcome: '#DDF1E8', // welcome background, logo tile
  logoInk: '#3A5A2C', // Oliva "Olivo": logo disc and wordmark
  logoAccent: '#A9BD7A', // "Hoja": the leaf, only ever inside the olive disc
  focus: '#1B6FD8',
  overlay: 'rgba(10,20,15,0.5)',
  white: '#FFFFFF',
};

export const font = {
  regular: 'AtkinsonHyperlegibleNext_400Regular',
  bold: 'AtkinsonHyperlegibleNext_700Bold',
};

export const radius = { card: 16, input: 14, back: 14, pill: 999, day: 14, sheet: 28 };

// Only the toast casts a shadow.
export const shadow = {
  toast: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
};
