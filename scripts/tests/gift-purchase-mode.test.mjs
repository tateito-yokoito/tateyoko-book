import assert from 'node:assert/strict';
import test from 'node:test';
import { giftPurchaseMode } from '../../src/lib/giftPurchaseMode.js';

test('a persisted gift mode survives loss of the browser purchase intent', () => {
  assert.equal(giftPurchaseMode({ metadata: { gift_mode: 'family_managed' } }), 'family_managed');
  assert.equal(giftPurchaseMode({ metadata: { gift_mode: 'recipient_led' } }, {
    purchaseFor: 'gift', giftMode: 'family_managed', recipientName: '伸子'
  }, '伸子'), 'recipient_led');
});

test('legacy gift orders use only a matching same-browser intent', () => {
  const intent = { purchaseFor: 'gift', giftMode: 'family_managed', recipientName: '伸子' };
  assert.equal(giftPurchaseMode({ metadata: {} }, intent, '伸子'), 'family_managed');
  assert.equal(giftPurchaseMode({ metadata: {} }, intent, '別の人'), 'recipient_led');
  assert.equal(giftPurchaseMode({ metadata: {} }), 'recipient_led');
});
