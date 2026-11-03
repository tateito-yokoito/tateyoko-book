const tokenPattern = /^[a-f0-9]{64}$/;

async function request(url, body, accessToken = null) {
  const response = await fetch(url, {
    method: 'POST', cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(value.error || '接続を確認できませんでした');
    error.status = response.status;
    throw error;
  }
  return value;
}

export function guestPurchaseStatus(apiUrl, sessionToken) {
  if (!tokenPattern.test(sessionToken || '')) throw new Error('体験を確認できません');
  return request(`${apiUrl}/functions/v1/guest-purchase`, {
    action: 'status', sessionToken,
  });
}

export function guestCheckout(apiUrl, sessionToken, options) {
  if (!tokenPattern.test(sessionToken || '')) throw new Error('体験を確認できません');
  if (!Number.isSafeInteger(options?.expectedAmount) || options.expectedAmount <= 0)
    throw new Error('お支払い金額を確認してください');
  return request(`${apiUrl}/functions/v1/guest-checkout`, {
    sessionToken, discountCode: options.discountCode || '',
    expectedAmount: options.expectedAmount,
  });
}

export function claimGuestPurchase(apiUrl, sessionToken, projectId, accessToken) {
  if (!tokenPattern.test(sessionToken || '') || !accessToken)
    throw new Error('体験と本人確認を確認してください');
  return request(`${apiUrl}/functions/v1/guest-purchase`, {
    action: 'claim', sessionToken, projectId,
  }, accessToken);
}
