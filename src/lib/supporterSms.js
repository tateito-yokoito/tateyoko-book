export function normalizeSupporterPhone(value) {
  const compact = String(value || '').normalize('NFKC').replace(/[\s()-]/g, '');
  const phone = compact.startsWith('0') ? '+81' + compact.slice(1) : '+' + compact.replace(/^\+/, '');
  if (!/^\+81[789]0\d{8}$/.test(phone)) throw Error('携帯電話番号を確認してください。');
  return phone;
}

export async function callSupporterSms(client, body) {
  const { data, error } = await client.functions.invoke('supporter-sms-invite', { body });
  if (error || data?.error) {
    let result = data;
    if (!result && error?.context?.json) result = await error.context.json().catch(() => null);
    // This dedicated endpoint emits only curated messages, never provider text.
    throw Error(typeof result?.error === 'string' ? result.error : '処理できませんでした。時間をおいてお試しください。');
  }
  return data;
}

export function loadSupporterSmsToken(inviteId, browser = window) {
  const hash = new URLSearchParams(browser.location.hash.slice(1));
  const token = hash.get('supporter_token');
  const key = `tateyoko:supporter-sms:${inviteId}`;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    try { browser.sessionStorage.setItem(key, token); } catch { /* In-memory use still works. */ }
    hash.delete('supporter_token');
    browser.history.replaceState(null, '', browser.location.pathname + browser.location.search + (hash.size ? '#' + hash.toString() : ''));
    return token;
  }
  try { return browser.sessionStorage.getItem(key) || ''; } catch { return ''; }
}
