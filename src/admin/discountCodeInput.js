// Avoid visually ambiguous characters. These are coupon identifiers, not secrets.
export function randomDiscountCode(cryptoProvider = globalThis.crypto) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  // Rejection sampling keeps the distribution uniform even if the alphabet changes.
  const limit = 256 - (256 % alphabet.length);
  let result = "";
  while (result.length < 12) {
    const bytes = cryptoProvider.getRandomValues(new Uint8Array(24));
    for (const byte of bytes) {
      if (byte < limit) result += alphabet[byte % alphabet.length];
      if (result.length === 12) break;
    }
  }
  return result;
}

export function discountCodeInputError({ unlimited, maxUses, expiresAt, requireExpiry, campaignEndsAt, now = Date.now() }) {
  if (!unlimited && (!/^\d+$/.test(String(maxUses)) || Number(maxUses) < 1 || Number(maxUses) > 2147483647)) return "利用上限は1以上の整数で指定してください。";
  if ((unlimited || requireExpiry) && !expiresAt) return "有効期限を設定してください。";
  if (expiresAt) {
    const end = new Date(expiresAt).getTime();
    if (!Number.isFinite(end) || end <= now) return "有効期限は未来の日時を指定してください。";
    if (requireExpiry && campaignEndsAt && end > new Date(campaignEndsAt).getTime()) return "コードの有効期限はキャンペーンの終了日時以内にしてください。";
  }
  return "";
}
