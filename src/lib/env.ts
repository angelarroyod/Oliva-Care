const demo = process.env.EXPO_PUBLIC_DEMO === '1';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!demo && (!url || !anonKey)) {
  // Surfaced early in dev; in tests these are undefined and the client is mocked.
  console.warn('[tend] Missing EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY — set them in .env');
}

export const env = {
  // Offline demo with sample data, no backend (src/lib/demo.ts).
  demo,
  supabaseUrl: demo ? 'https://demo.oliva.invalid' : url ?? 'http://localhost',
  supabaseAnonKey: demo ? 'demo' : anonKey ?? 'anon',
};
