import assert from 'node:assert/strict';
import test from 'node:test';
import { preserveCheckoutReturnForAuth, purchasedSupportProjectUrl } from '../../src/lib/checkoutReturnNavigation.js';

test('authentication handoff retains the existing paid Gift B checkout return', () => {
  const source = '?app=1&entry=purchase&purchase_for=gift&checkout=success&session_id=cs_test_existing&checkout_context=purchase';
  const url = preserveCheckoutReturnForAuth(source, new URL('https://test.example/?app=1&entry=purchase'));
  assert.equal(url.searchParams.get('purchase_for'), 'gift');
  assert.equal(url.searchParams.get('checkout'), 'success');
  assert.equal(url.searchParams.get('session_id'), 'cs_test_existing');
  assert.equal(url.origin, 'https://test.example');
});

test('paid Gift B URL reloads the same supported project without reopening checkout', () => {
  const url = purchasedSupportProjectUrl(
    'https://test.example/?app=1&entry=purchase&checkout=success&session_id=cs_test_existing&purchase_review=1',
    'gift-b-project'
  );
  assert.equal(url.searchParams.get('support_project'), 'gift-b-project');
  assert.equal(url.searchParams.get('entry'), 'purchased');
  for (const key of ['checkout', 'session_id', 'purchase_review', 'purchase_handoff']) {
    assert.equal(url.searchParams.has(key), false);
  }
});
