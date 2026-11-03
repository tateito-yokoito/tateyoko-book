import { CHILDHOOD_TRIAL_QUESTIONS } from './childhoodTrial.js';

const ids = new Set(CHILDHOOD_TRIAL_QUESTIONS.map(question => question.id));
const tenDays = 10 * 24 * 60 * 60 * 1000;

export function guestTrialEndpoint(supabaseUrl) {
  const url = new URL(String(supabaseUrl || '').replace(/\/$/, ''));
  if (url.protocol !== 'https:') throw new Error('体験の接続先を確認できません');
  return `${url.origin}/functions/v1/guest-trial`;
}

export async function guestTrialStorageKey(giftToken = null) {
  if (!giftToken) return 'tateyoko:guest-trial:self:v1';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(giftToken));
  const fingerprint = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  return `tateyoko:guest-trial:gift:${fingerprint}:v1`;
}

export function readGuestTrialSession(storage, key) {
  let value;
  try { value = JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
  // Do not discard the only recovery capability solely from the old local
  // ten-day timestamp: a completed payment can extend server retention while
  // this device is closed. The server remains the expiry authority.
  if (!value || !/^[a-f0-9]{64}$/.test(value.token || '')
    || !Number.isFinite(Date.parse(value.expiresAt))) {
    try { storage.removeItem(key); } catch { /* Reading still fails closed. */ }
    return null;
  }
  return value;
}

export function ensureGuestTrialStorage(storage) {
  const probe = 'tateyoko:guest-trial:storage-check';
  try {
    storage.setItem(probe, 'ok');
    storage.removeItem(probe);
  } catch {
    throw new Error('このブラウザでは体験を保存できません。プライベートモードを終了して、もう一度お試しください');
  }
}

export function storeGuestTrialSession(storage, key, session) {
  if (!/^[a-f0-9]{64}$/.test(session?.sessionToken || '')) throw new Error('体験を保存できません');
  const expiresAt = String(session.expiresAt || '');
  if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) > Date.now() + tenDays + 60000)
    throw new Error('体験の期限を確認できません');
  const value = { token: session.sessionToken, expiresAt, sessionId: session.sessionId };
  try { storage.setItem(key, JSON.stringify(value)); }
  catch { throw new Error('このブラウザでは体験を保存できません。プライベートモードを終了して、もう一度お試しください'); }
  return value;
}

export async function guestTrialRequest(supabaseUrl, action, { sessionToken, giftToken, questionId, audio, text, discountCode, eventName } = {}) {
  const endpoint = guestTrialEndpoint(supabaseUrl);
  const url = `${endpoint}?action=${encodeURIComponent(action)}`;
  let body;
  let headers;
  if (action === 'start') {
    body = JSON.stringify({ giftToken: giftToken || null });
    headers = { 'Content-Type': 'application/json' };
  } else {
    if (!/^[a-f0-9]{64}$/.test(sessionToken || '')) throw new Error('この体験を確認できません');
    body = new FormData();
    body.set('sessionToken', sessionToken);
    if (questionId) {
      if (!ids.has(questionId)) throw new Error('問いを確認できません');
      body.set('questionId', questionId);
    }
    if (audio) body.set('audio', audio, audio.name || 'recording.m4a');
    if (typeof text === 'string') body.set('text', text);
    if (typeof discountCode === 'string') body.set('discountCode', discountCode);
    if (action === 'event' && typeof eventName === 'string') body.set('eventName', eventName);
  }
  const response = await fetch(url, { method: 'POST', body, headers, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || '接続できませんでした。もう一度お試しください');
    error.status = response.status;
    error.retryable = data.retryable !== false;
    throw error;
  }
  return data;
}
