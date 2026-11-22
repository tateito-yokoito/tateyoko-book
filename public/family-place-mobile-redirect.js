// The framed page is for desktop review only. On a phone, keep the TEST app
// in the top-level, first-party context used by Supabase session storage.
if (window.matchMedia('(max-width: 430px)').matches) {
  window.location.replace(new URL('/?app=family_place', window.location.origin).href);
}
