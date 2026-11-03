import { readGuestTrialSession } from './guestTrialApi.js';

export const GUEST_TRIAL_CLAIM_PARAM = 'guest_trial_claim';
const storageKey = 'tateyoko:guest-trial:self:v1';
const pendingKey = 'tateyoko:guest-trial:purchase-pending:v1';

export function guestTrialClaimRequested(search = window.location.search) {
  return new URLSearchParams(search).get(GUEST_TRIAL_CLAIM_PARAM) === '1';
}

export function guestTrialPurchaseUrl(location = window.location) {
  const url = new URL('/', location.origin);
  url.searchParams.set('app', '1');
  url.searchParams.set('entry', 'purchase');
  url.searchParams.set(GUEST_TRIAL_CLAIM_PARAM, '1');
  return url.toString();
}

export function clearGuestTrialClaimRequest() {
  const url = new URL(window.location.href);
  url.searchParams.delete(GUEST_TRIAL_CLAIM_PARAM);
  window.history.replaceState(null, '', url);
}

export function pendingGuestTrialProject(storage = window.localStorage) {
  return storage.getItem(pendingKey);
}

export function clearGuestTrialPending(storage = window.localStorage) {
  storage.removeItem(pendingKey);
}

async function functionErrorMessage(error) {
  if (!error?.context || typeof error.context.json !== 'function') return null;
  const details = await error.context.json().catch(() => null);
  return typeof details?.error === 'string' ? details.error : null;
}

export async function bindGuestTrialToPurchase(client, projectId, storage = window.localStorage) {
  const saved = readGuestTrialSession(storage, storageKey);
  if (!saved?.token) throw new Error('この端末に無料3問の記録が見つかりません。再開URLから開いてください。');
  const { data, error } = await client.functions.invoke('claim-guest-trial', {
    body: { action: 'bind', sessionToken: saved.token, projectId },
  });
  if (error || data?.status !== 'bound' || data?.projectId !== projectId)
    throw new Error(data?.error || await functionErrorMessage(error)
      || '無料3問を購入に接続できませんでした。もう一度お試しください。');
  storage.setItem(pendingKey, projectId);
  return data;
}

export async function claimGuestTrialForProject(client, projectId, storage = window.localStorage) {
  const saved = readGuestTrialSession(storage, storageKey);
  if (!saved?.token) throw new Error('この端末に無料3問の記録が見つかりません。元の画面からやり直してください。');
  const { data, error } = await client.functions.invoke('claim-guest-trial', {
    body: { sessionToken: saved.token, projectId },
  });
  if (error || data?.status !== 'claimed' || data?.projectId !== projectId || data?.count !== 3) {
    throw new Error(data?.error || await functionErrorMessage(error)
      || '無料3問を物語へ引き継げませんでした。もう一度お試しください。');
  }
  clearGuestTrialPending(storage);
  return data;
}
