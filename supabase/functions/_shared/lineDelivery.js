export function lineQuestionMessage(question, questionUrl) {
  const url = new URL(questionUrl);
  if (url.protocol !== 'https:' || url.hostname === 'liff.line.me' || url.username || url.password) throw new Error('Invalid LINE question URL');
  url.searchParams.set('openExternalBrowser', '1');
  const text = String(question || '').trim();
  if (!text) throw new Error('Question is required');
  return { type: 'text', text: `【縦糸＋横糸】\n今日の問いをお届けします。\n\n${text.slice(0, 2000)}\n\n下のリンクから、声でお答えください。\n${url.toString()}` };
}

export async function sendLineQuestion({ token, recipient, question, questionUrl, retryKey, fetcher = fetch }) {
  if (!token || !/^U[0-9a-f]{32}$/.test(recipient) || !/^[0-9a-f-]{36}$/i.test(retryKey)) throw new Error('LINE delivery is not configured');
  const payload = JSON.stringify({ to: recipient, messages: [lineQuestionMessage(question, questionUrl)] });
  let response;
  try {
    response = await fetcher('https://api.line.me/v2/bot/message/push', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Line-Retry-Key': retryKey },
      body: payload,
    });
  } catch { throw Object.assign(new Error('LINE request timed out or failed'), { code: 'LINE_NETWORK' }); }
  if (response.status === 409 && response.headers.get('x-line-accepted-request-id')) {
    // The original request may already own this ID in a unique delivery log.
    return { providerMessageId: null, providerStatus: 'accepted_duplicate' };
  }
  if (response.ok) return { providerMessageId: response.headers.get('x-line-request-id'), providerStatus: 'accepted' };
  // Provider bodies can echo data. Store only a bounded status code in logs.
  throw Object.assign(new Error(response.status === 429 ? 'LINE sending limit reached' : `LINE request failed (${response.status})`), { code: `LINE_${response.status}` });
}
