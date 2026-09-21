export const TEST_SUPABASE_URL = 'https://zpswxefgfabzvxdbtyvq.supabase.co';

// An explicitly built public QA app must never silently fall back to production.
export function assertPublicTestEnvironment(env) {
  if (env.VITE_PUBLIC_TEST_MODE !== 'true') return;
  if (env.VITE_SUPABASE_URL !== TEST_SUPABASE_URL ||
      env.VITE_EXPERIENCE_V2_TEST_ONLY !== 'true' ||
      env.VITE_EXPERIENCE_NOTIFICATIONS_ENABLED !== 'false' ||
      !env.VITE_SUPABASE_ANON_KEY || env.VITE_DEV_LOGIN_EMAIL || env.VITE_DEV_LOGIN_PASSWORD) {
    throw new Error('Public test configuration rejected');
  }
  // anon is a public client key, not a secret. Reject server-role keys even if
  // someone accidentally configures one in the public build environment.
  try {
    const claims = JSON.parse(atob(env.VITE_SUPABASE_ANON_KEY.split('.')[1]));
    if (claims.role !== 'anon' || claims.ref !== 'zpswxefgfabzvxdbtyvq') throw Error();
  } catch { throw new Error('Public test client key rejected'); }
}
