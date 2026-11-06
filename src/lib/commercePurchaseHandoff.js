import { readGuestTrialSession } from './guestTrialApi.js';
import { normalizeCommercePurchaseSelection } from './commercePurchaseIntent.js';

export const PURCHASE_HANDOFF_PARAM = 'purchase_handoff';
const guestStorageKey = 'tateyoko:guest-trial:self:v1';
const pendingHandoffKey = 'tateyoko:commerce-v2:guest-handoff:v1';
const tokenPattern = /^[a-f0-9]{64}$/;

export function purchaseHandoffToken(search = window.location.search) {
  const value = new URLSearchParams(search).get(PURCHASE_HANDOFF_PARAM);
  return tokenPattern.test(value || '') ? value : null;
}

export function pendingGuestHandoff(storage = window.localStorage) {
  const value = storage.getItem(pendingHandoffKey);
  return tokenPattern.test(value || '') ? value : null;
}

export function savePendingGuestHandoff(storage, token) {
  if (!tokenPattern.test(token || '')) throw new Error('購入手続きを確認できません');
  storage.setItem(pendingHandoffKey, token);
}

export function clearPendingGuestHandoff(storage = window.localStorage) {
  storage.removeItem(pendingHandoffKey);
}

async function invoke(client, body) {
  const { data, error } = await client.functions.invoke('commerce-purchase-handoff', { body });
  if (error || !data || data.error) {
    let details = null;
    if (error?.context && typeof error.context.json === 'function')
      details = await error.context.json().catch(() => null);
    throw new Error(data?.error || details?.error || '購入手続きを引き継げませんでした');
  }
  return data;
}

export async function createPurchaseHandoff(client, selection, useGuestTrial, storage = window.localStorage) {
  const normalized = normalizeCommercePurchaseSelection(selection);
  if (!normalized) throw new Error('商品選択を確認できません');
  const guestSessionToken = useGuestTrial
    ? readGuestTrialSession(storage, guestStorageKey)?.token : null;
  if (useGuestTrial && !guestSessionToken)
    throw new Error('無料3問の記録が見つかりません。再開URLから開き直してください');
  const data = await invoke(client, { action: 'create', selection, guestSessionToken });
  if (!tokenPattern.test(data.handoffToken || '')) throw new Error('購入手続きを確認できません');
  return data.handoffToken;
}

export async function bindPurchaseHandoffEmail(client, token, email) {
  if (!tokenPattern.test(token || '')) return;
  await invoke(client, { action: 'bind_email', handoffToken: token, email });
}

export async function restorePurchaseHandoff(client, token, accessToken) {
  if (!tokenPattern.test(token || '') || !accessToken) throw new Error('先にログインしてください');
  const { data, error } = await client.functions.invoke('commerce-purchase-handoff', {
    body: { action: 'restore', handoffToken: token },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (error || !data || data.error) {
    const details = error?.context && typeof error.context.json === 'function'
      ? await error.context.json().catch(() => null) : null;
    throw new Error(data?.error || details?.error || '購入手続きを引き継げませんでした');
  }
  const selection = normalizeCommercePurchaseSelection(data.selection);
  if (!selection) throw new Error('商品選択を確認できません');
  return { ...data, selection: data.selection };
}
