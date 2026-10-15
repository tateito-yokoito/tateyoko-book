// Run before the Supabase client initializes. Its email callback may replace
// the hash while reading Auth tokens, but must not discard the invite token.
if (new URLSearchParams(location.search).has('family_connect')) {
  const fragment = location.hash.slice(1);
  // GoTrue appends its own #access_token=... to a redirect URL that already
  // contains #connect=..., yielding #connect=<token>#access_token=...
  const match = /^connect=([a-f0-9]{64})(?:&otp=(\d{6}))?(?:#(.*))?$/.exec(fragment);
  if (match) {
    sessionStorage.setItem('family-connect-pending', match[1]);
    if (match[2]) sessionStorage.setItem('family-connect-auto-otp', match[2]);
    else sessionStorage.removeItem('family-connect-auto-otp');
    history.replaceState(null, '', location.pathname + location.search + (match[3] ? `#${match[3]}` : ''));
  } else if (fragment.startsWith('connect=')) {
    sessionStorage.removeItem('family-connect-pending');
    sessionStorage.removeItem('family-connect-auto-otp');
  }
}
