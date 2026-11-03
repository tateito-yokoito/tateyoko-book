import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  guestTrialEndpoint, guestTrialStorageKey,
  ensureGuestTrialStorage, readGuestTrialSession, storeGuestTrialSession, guestTrialRequest,
} from '../../src/lib/guestTrialApi.js';

globalThis.crypto ||= webcrypto;
assert.equal(guestTrialEndpoint('https://example.supabase.co/'),
  'https://example.supabase.co/functions/v1/guest-trial');
assert.throws(() => guestTrialEndpoint('http://example.supabase.co'), /接続先/);

const selfKey = await guestTrialStorageKey();
const giftKey = await guestTrialStorageKey('gift-recipient-only');
assert.notEqual(selfKey, giftKey);
assert.ok(!giftKey.includes('gift-recipient-only'), 'Gift link must not appear in the storage key');

const map = new Map();
const storage = {
  getItem: key => map.get(key) || null,
  setItem: (key, value) => map.set(key, value),
  removeItem: key => map.delete(key),
};
ensureGuestTrialStorage(storage);
assert.throws(() => ensureGuestTrialStorage({ setItem() { throw new Error('blocked'); } }), /プライベートモード/);
const token = 'a'.repeat(64);
const session = storeGuestTrialSession(storage, selfKey, {
  sessionToken: token, sessionId: 'test-session',
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
});
assert.equal(readGuestTrialSession(storage, selfKey)?.token, token);
assert.equal(session.sessionId, 'test-session');
assert.throws(() => storeGuestTrialSession(storage, selfKey, {
  sessionToken: token, expiresAt: new Date(Date.now() + 11 * 86400000).toISOString(),
}), /期限/);
map.set(selfKey, JSON.stringify({ token, expiresAt: new Date(Date.now() - 1000).toISOString() }));
assert.equal(readGuestTrialSession(storage, selfKey)?.token, token,
  'A paid trial may remain recoverable after the original local expiry; the server decides');
assert.equal(map.has(selfKey), true);
map.set(selfKey, JSON.stringify({ token: 'invalid', expiresAt: new Date().toISOString() }));
assert.equal(readGuestTrialSession(storage, selfKey), null);
assert.equal(map.has(selfKey), false);

await assert.rejects(() => guestTrialRequest('https://example.supabase.co', 'status', {
  sessionToken: 'invalid',
}), /確認できません/);
await assert.rejects(() => guestTrialRequest('https://example.supabase.co', 'save', {
  sessionToken: token, questionId: 'TY_Q01',
}), /問いを確認できません/);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: false, status: 503,
  json: async () => ({ error: '声は保存されました。話した内容を入力して進めます。', retryable: false }),
});
try {
  await assert.rejects(() => guestTrialRequest('https://example.supabase.co', 'transcribe', {
    sessionToken: token, questionId: 'TY_TRIAL_CHILDHOOD01',
  }), error => error.status === 503 && error.retryable === false);
} finally { globalThis.fetch = originalFetch; }
console.log('PASS guest trial capability is scoped and server-authoritative after local expiry');
