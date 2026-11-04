import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveCommercePurchaseIntent,
  readCommercePurchaseIntent,
  clearCommercePurchaseIntent,
} from '../../src/lib/commercePurchaseIntent.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test('gift A and gift B selections survive authentication and keep their recipient', () => {
  for (const giftMode of ['recipient_led', 'family_managed']) {
    const storage = memoryStorage();
    const now = Date.UTC(2026, 10, 5);
    saveCommercePurchaseIntent(storage, {
      edition: 'premium', productionMethod: 'self_or_family',
      standardExtraCount: 1, premiumExtraCount: 0,
      discountCode: 'TESTLEGACY10', purchaseFor: 'gift', giftMode,
      recipientName: 'テスト受取人', quotedAmountTotal: 65000,
    }, now);
    assert.deepEqual(
      (({ purchaseFor, giftMode, recipientName, discountCode }) =>
        ({ purchaseFor, giftMode, recipientName, discountCode }))(readCommercePurchaseIntent(storage, now + 1000)),
      { purchaseFor: 'gift', giftMode, recipientName: 'テスト受取人', discountCode: 'TESTLEGACY10' },
    );
    clearCommercePurchaseIntent(storage);
    assert.equal(readCommercePurchaseIntent(storage, now + 1000), null);
  }
});

test('an old self-purchase intent cannot become a gift claim', () => {
  const storage = memoryStorage();
  const now = Date.UTC(2026, 10, 5);
  saveCommercePurchaseIntent(storage, {
    edition: 'standard', productionMethod: 'self_or_family',
    purchaseFor: 'self', giftMode: 'family_managed', recipientName: '別の人',
  }, now);
  const restored = readCommercePurchaseIntent(storage, now);
  assert.equal(restored.purchaseFor, 'self');
  assert.equal(restored.giftMode, 'recipient_led');
  assert.equal(restored.recipientName, '');
});
