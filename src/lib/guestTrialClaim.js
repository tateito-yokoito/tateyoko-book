import { readGuestTrialSession } from './guestTrialApi.js';

export const GUEST_TRIAL_CLAIM_PARAM = 'guest_trial_claim';
const storageKey = 'tateyoko:guest-trial:self:v1';

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

export async function claimGuestTrialForProject(client, projectId, storage = window.localStorage) {
  const saved = readGuestTrialSession(storage, storageKey);
  if (!saved?.token) throw new Error('この端末に無料3問の記録が見つかりません。元の画面からやり直してください。');
  const { data, error } = await client.functions.invoke('claim-guest-trial', {
    body: { sessionToken: saved.token, projectId },
  });
  if (error || data?.status !== 'claimed' || data?.projectId !== projectId || data?.count !== 3) {
    throw new Error(data?.error || '無料3問を物語へ引き継げませんでした。もう一度お試しください。');
  }
  return data;
}
