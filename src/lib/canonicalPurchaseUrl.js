export function canonicalPurchaseUrl(location) {
  const url = new URL(location.href);
  if (url.hostname !== 'tateyoko-book.vercel.app'
    || url.searchParams.get('entry') !== 'purchase'
    || url.searchParams.has('guest_trial')
    || url.searchParams.has('checkout')) return null;
  url.hostname = 'www.tateito-yokoito.jp';
  return url.toString();
}
