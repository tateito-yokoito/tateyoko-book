const PRODUCTION_HOST = 'www.tateito-yokoito.jp';
const PRODUCTION_HOSTS = new Set([PRODUCTION_HOST, 'tateito-yokoito.jp']);
const SOURCES = new Set(['merone', 'instagram', 'facebook', 'x', 'twitter', 'line', 'google', 'yahoo', 'bing']);
const MEDIUMS = new Set(['referral', 'social', 'organic', 'email', 'qr']);

export function hpAnalyticsContext(location, referrer = '') {
  if (location.protocol !== 'https:' || !PRODUCTION_HOSTS.has(location.hostname) || location.pathname !== '/') return null;

  const params = new URLSearchParams(location.search);
  for (const [key, value] of params) {
    if (key === 'info' && value === 'privacy') continue;
    if (key === 'utm_source' && SOURCES.has(value.toLowerCase())) continue;
    if (key === 'utm_medium' && MEDIUMS.has(value.toLowerCase())) continue;
    // An unexpected query may contain a private token or personal information.
    return null;
  }

  const context = {
    page_location: `https://${PRODUCTION_HOST}/`,
    page_referrer: '',
    page_title: '縦糸横糸｜人生を、声でのこす。',
  };
  try {
    const previous = new URL(referrer);
    if (previous.protocol === 'https:' || previous.protocol === 'http:') {
      context.page_referrer = previous.origin + '/';
    }
  } catch { /* No usable referrer. */ }
  if (params.has('utm_source')) context.campaign_source = params.get('utm_source').toLowerCase();
  if (params.has('utm_medium')) context.campaign_medium = params.get('utm_medium').toLowerCase();
  return context;
}

export function startHpAnalytics({ measurementId, location, referrer, document, window }) {
  if (!/^G-[A-Z0-9]+$/.test(measurementId || '') || window.__tateyokoHpAnalyticsStarted) return false;
  const context = hpAnalyticsContext(location, referrer);
  if (!context) return false;
  window.__tateyokoHpAnalyticsStarted = true;

  // Apply this only to the public HP. No full query or referral path leaves the browser.
  const referrerPolicy = document.createElement('meta');
  referrerPolicy.name = 'referrer';
  referrerPolicy.content = 'origin';
  document.head.appendChild(referrerPolicy);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    ...context,
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_expires: 30 * 24 * 60 * 60,
    cookie_update: false,
  });
  window.gtag('event', 'page_view', { ...context, send_to: measurementId });

  const script = document.createElement('script');
  script.async = true;
  script.referrerPolicy = 'origin';
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);
  return true;
}
