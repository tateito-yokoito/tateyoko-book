const CHECKOUT_RETURN_KEYS = [
  'purchase_for', 'checkout', 'session_id', 'checkout_context',
  'checkout_premium', 'family_invite_checkout'
];

export function preserveCheckoutReturnForAuth(sourceSearch, returnUrl) {
  for (const key of CHECKOUT_RETURN_KEYS) {
    const value = new URLSearchParams(sourceSearch).get(key);
    if (value) returnUrl.searchParams.set(key, value);
  }
  return returnUrl;
}

export function purchasedSupportProjectUrl(currentUrl, projectId) {
  const url = new URL(currentUrl);
  url.searchParams.set('app', '1');
  url.searchParams.set('entry', 'purchased');
  url.searchParams.set('support_project', projectId);
  url.searchParams.delete('checkout');
  url.searchParams.delete('session_id');
  url.searchParams.delete('family_invite_checkout');
  url.searchParams.delete('purchase_review');
  url.searchParams.delete('purchase_handoff');
  return url;
}
