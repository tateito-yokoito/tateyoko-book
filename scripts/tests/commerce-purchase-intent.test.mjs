import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearCommercePurchaseIntent,
  normalizeCommercePurchaseSelection,
  provisionalCommerceSubtotal,
  readCommercePurchaseIntent,
  saveCommercePurchaseIntent,
} from '../../src/lib/commercePurchaseIntent.js';

const selection = {
  edition: 'premium', productionMethod: 'self_or_family',
  standardExtraCount: 1, premiumExtraCount: 1, discountCode: ' PHASE2FAKE1000 ',
};

test('pre-auth selection keeps options and coupon without trusting local prices for payment', () => {
  assert.equal(provisionalCommerceSubtotal(selection), 105000);
  assert.equal(normalizeCommercePurchaseSelection(selection).discountCode, 'PHASE2FAKE1000');
  assert.equal(provisionalCommerceSubtotal({ ...selection, productionMethod: 'interview_staff' }), 125000);
});

test('selection survives auth return and expires without extending its lifetime', () => {
  const items = new Map();
  const storage = { getItem: key => items.get(key), setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) };
  const savedAt = Date.UTC(2026, 10, 3);
  saveCommercePurchaseIntent(storage, { ...selection, quotedAmountTotal: 104000, quotedDiscountAmount: 1000 }, savedAt);
  assert.deepEqual(readCommercePurchaseIntent(storage, savedAt + 1000), {
    ...normalizeCommercePurchaseSelection(selection), provisionalSubtotal: 105000,
    quotedAmountTotal: 104000, quotedDiscountAmount: 1000,
  });
  assert.equal(readCommercePurchaseIntent(storage, savedAt + 24 * 60 * 60 * 1000 + 1), null);
  clearCommercePurchaseIntent(storage);
  assert.equal(readCommercePurchaseIntent(storage, savedAt + 1000), null);
});

test('invalid or corrupted purchase choices cannot be restored', () => {
  assert.equal(normalizeCommercePurchaseSelection({ ...selection, standardExtraCount: 31 }), null);
  const storage = { getItem: () => '{invalid' };
  assert.equal(readCommercePurchaseIntent(storage), null);
});
