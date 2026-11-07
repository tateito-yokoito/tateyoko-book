export function canonicalPurchaseUrl(location) {
  const url = new URL(location.href);
  if (url.hostname !== 'tateyoko-book.vercel.app') return null;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const purchase = path === '/' && url.searchParams.get('entry') === 'purchase'
    && !url.searchParams.has('guest_trial') && !url.searchParams.has('checkout');
  const consultation = path === '/support-consultation';
  const landing = path === '/' && (!url.search || url.searchParams.has('info'));
  if (!purchase && !consultation && !landing) return null;
  url.hostname = 'www.tateito-yokoito.jp';
  return url.toString();
}
