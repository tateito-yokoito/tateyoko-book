import assert from 'node:assert/strict';
import test from 'node:test';
import { claimedManagedGiftProject, giftPurchaseMode } from '../../src/lib/giftPurchaseMode.js';

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

test('a claimed managed gift resumes only its purchased supported project', () => {
  const gift = { claimed_at: '2026-11-15T00:00:00Z', recipient_project_id: 'gift-b-project' };
  const projects = [
    { book_project_id: 'other-project' },
    { book_project_id: 'gift-b-project', support_role: 'facilitator' }
  ];
  assert.equal(claimedManagedGiftProject(gift, projects), projects[1]);
  assert.equal(claimedManagedGiftProject({ ...gift, claimed_at: null }, projects), null);
  assert.throws(() => claimedManagedGiftProject(gift, projects.slice(0, 1)), /購入済みの作品を開けませんでした/);
  assert.throws(() => claimedManagedGiftProject({ ...gift, recipient_project_id: null }, projects), /購入済みの作品を開けませんでした/);
});
