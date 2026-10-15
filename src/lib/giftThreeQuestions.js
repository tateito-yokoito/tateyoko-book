export const GIFT_THREE_FUNCTION = 'gift-three-questions';
const HEX_TOKEN = /^[a-f0-9]{64}$/;
const COMPACT_TOKEN = /^[A-Za-z0-9_-]{43}$/;

// A 32-byte token is still 32 bytes of entropy; only its URL notation changes.
export function compactGiftThreeRecipientUrl(recipientUrl) {
  const url = new URL(recipientUrl);
  const token = url.searchParams.get('gift_three');
  if (!HEX_TOKEN.test(token || '')) return recipientUrl;
  const bytes = token.match(/../g).map(pair => String.fromCharCode(parseInt(pair, 16))).join('');
  url.pathname = `/g/${btoa(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function giftThreeTokenFromLocation(pathname, search) {
  const queryToken = new URLSearchParams(search).get('gift_three');
  if (HEX_TOKEN.test(queryToken || '')) return queryToken;
  const encoded = pathname.match(/^\/g\/([^/]+)\/?$/)?.[1] || '';
  if (!COMPACT_TOKEN.test(encoded)) return '';
  try {
    const bytes = atob(encoded.replaceAll('-', '+').replaceAll('_', '/') + '=');
    if (bytes.length !== 32) return '';
    return Array.from(bytes, char => char.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  } catch { return ''; }
}
export const GIFT_THREE_MESSAGE = recipientUrl => `「縦糸+横糸」

スマホに届く質問に、声で答えていくだけ。
これまでの人生を振り返り、言葉にする体験です。

無料の3問から、試してみませんか？

3問を試す：${recipientUrl}

語った内容は、本人の許可なく共有されません。`;

export async function giftThreeRequest(action, body = {}, accessToken = '') {
  const url = import.meta.env.VITE_SUPABASE_URL || 'https://wquxjeqkumossjxehdop.supabase.co';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const response = await fetch(`${url}/functions/v1/${GIFT_THREE_FUNCTION}`, {
    method: 'POST', headers: {
      'Content-Type': 'application/json', apikey: anonKey,
      Authorization: `Bearer ${accessToken || anonKey}`,
    }, body: JSON.stringify({ action, ...body }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw new Error(result.error || '操作を完了できませんでした。');
  return result;
}

export function giftThreeTokenFromUrl() {
  return giftThreeTokenFromLocation(location.pathname, location.search);
}
