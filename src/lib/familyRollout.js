// UI availability only. DB relationships, consent and rollout remain authoritative.
export function familyRollout(env = {}) {
  const url=env.VITE_SUPABASE_URL;
  const test=url==='https://zpswxefgfabzvxdbtyvq.supabase.co';
  const production=url==='https://wquxjeqkumossjxehdop.supabase.co';
  const enabled=(test&&env.VITE_FAMILY_CONNECTION_TEST==='true') ||
    (production&&env.VITE_FAMILY_PRODUCTION_ENABLED==='true');
  return {test,enabled,subjectConnection:enabled&&env.VITE_FAMILY_SUBJECT_CONNECTION_ENABLED==='true',delivery:test&&enabled};
}
