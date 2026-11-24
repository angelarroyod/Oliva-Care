// What a failed request tells the person: in Spanish, what went wrong and what
// to do next. Never the server's own message, which is English and technical.
// ponytail: known Postgres/PostgREST and Supabase Auth codes; anything else
// gets the caller's fallback. Add a code here when a new one shows up in logs.
type Failure = { code?: string; message?: string } | null | undefined;

const INVALID = 'Algún dato no es válido. Revísalo y vuelve a intentarlo.';
const EXPIRED = 'Tu sesión ha caducado. Sal y vuelve a entrar.';
const TOO_MANY = 'Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.';
const ACCOUNT_EXISTS = 'Ya hay una cuenta con ese correo. Entra con tu contraseña.';
export const SAVE_FAILED = 'No se pudo guardar. Vuelve a intentarlo.';
export const OFFLINE_ERROR = 'No hay conexión con el servidor. Comprueba internet y vuelve a intentarlo.';

const BY_CODE: Record<string, string> = {
  // Postgres / PostgREST
  '42501': 'No tienes permiso para hacer este cambio.',
  '23505': 'Esto ya estaba guardado.',
  '23503': 'Ese dato ya no existe. Vuelve atrás y ábrelo de nuevo.',
  '23502': INVALID,
  '23514': INVALID,
  '22P02': INVALID,
  '22007': INVALID,
  '22008': INVALID,
  PGRST301: EXPIRED,
  PGRST303: EXPIRED,
  // Supabase Auth
  invalid_credentials: 'El correo o la contraseña no son correctos.',
  email_not_confirmed: 'Aún no has confirmado tu correo. Abre el enlace que te enviamos y vuelve a entrar.',
  user_already_exists: ACCOUNT_EXISTS,
  email_exists: ACCOUNT_EXISTS,
  weak_password: 'Esa contraseña es fácil de adivinar. Usa una más larga, con letras y números.',
  over_request_rate_limit: TOO_MANY,
  over_email_send_rate_limit: TOO_MANY,
  session_expired: EXPIRED,
  refresh_token_not_found: EXPIRED,
};

export function errorText(e: Failure, fallback = SAVE_FAILED): string | null {
  if (!e) return null;
  if (e.code && BY_CODE[e.code]) return BY_CODE[e.code];
  if (/fetch|network/i.test(e.message ?? '')) return OFFLINE_ERROR;
  return fallback;
}

// "No se pudo deshacer." / "No se pudo enviar." plus the reason. The generic
// failure only adds "Vuelve a intentarlo.", so it doesn't say "no se pudo" twice.
export const failedTo = (what: string, err: string) => `${what} ${err === SAVE_FAILED ? 'Vuelve a intentarlo.' : err}`;
