const key = 'tateyoko:commerce-v2:purchase-intent:v1';
const lifetime = 24 * 60 * 60 * 1000;

export const PURCHASE_REVIEW_PARAM = 'purchase_review';

export function normalizeCommercePurchaseSelection(value) {
  const edition = value?.edition;
  const productionMethod = value?.productionMethod;
  const standardExtraCount = Number(value?.standardExtraCount ?? 0);
  const premiumExtraCount = Number(value?.premiumExtraCount ?? 0);
  const discountCode = String(value?.discountCode || '').trim();
  if (!['standard', 'premium'].includes(edition)
    || !['self_or_family', 'interview_staff'].includes(productionMethod)
    || !Number.isInteger(standardExtraCount) || standardExtraCount < 0 || standardExtraCount > 30
    || !Number.isInteger(premiumExtraCount) || premiumExtraCount < 0 || premiumExtraCount > 30
    || discountCode.length > 64) return null;
  return { edition, productionMethod, standardExtraCount, premiumExtraCount, discountCode };
}

// A display-only subtotal. The authenticated quote is the sole source of a payable amount.
export function provisionalCommerceSubtotal(selection) {
  const value = normalizeCommercePurchaseSelection(selection);
  if (!value) return null;
  return (value.edition === 'standard' ? 35000 : 65000)
    + value.standardExtraCount * 5000 + value.premiumExtraCount * 35000
    + (value.productionMethod === 'interview_staff' ? 20000 : 0);
}

export function saveCommercePurchaseIntent(storage, selection, now = Date.now()) {
  const value = normalizeCommercePurchaseSelection(selection);
  if (!value) throw new Error('商品選択を確認できません');
  storage.setItem(key, JSON.stringify({ ...value, savedAt: now }));
  return value;
}

export function readCommercePurchaseIntent(storage, now = Date.now()) {
  let raw;
  try { raw = JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
  const value = normalizeCommercePurchaseSelection(raw);
  if (!value || !Number.isFinite(raw.savedAt) || raw.savedAt > now
    || now - raw.savedAt > lifetime) return null;
  return { ...value, provisionalSubtotal: provisionalCommerceSubtotal(value) };
}

export function clearCommercePurchaseIntent(storage) {
  storage.removeItem(key);
}

export function commercePurchaseReviewRequested(search = window.location.search) {
  return new URLSearchParams(search).get(PURCHASE_REVIEW_PARAM) === '1';
}
