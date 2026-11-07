import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalPurchaseUrl } from '../../src/lib/canonicalPurchaseUrl.js';

test('old purchase entry moves to the supported production host', () => {
  assert.equal(canonicalPurchaseUrl(new URL('https://tateyoko-book.vercel.app/?app=1&entry=purchase')),
    'https://www.tateito-yokoito.jp/?app=1&entry=purchase');
});

test('an existing purchase handoff token is kept across the redirect', () => {
  const oldUrl = new URL('https://tateyoko-book.vercel.app/?app=1&entry=purchase&purchase_review=1&purchase_handoff=abc123');
  const canonical = new URL(canonicalPurchaseUrl(oldUrl));
  assert.equal(canonical.searchParams.get('purchase_handoff'), 'abc123');
  assert.equal(canonical.searchParams.get('purchase_review'), '1');
});

test('old landing page and standalone consultation use the supported host', () => {
  assert.equal(canonicalPurchaseUrl(new URL('https://tateyoko-book.vercel.app/')),
    'https://www.tateito-yokoito.jp/');
  assert.equal(canonicalPurchaseUrl(new URL('https://tateyoko-book.vercel.app/support-consultation/?source=hp')),
    'https://www.tateito-yokoito.jp/support-consultation/?source=hp');
});

test('official site, free trial, and checkout return are left in their current flows', () => {
  for (const url of [
    'https://www.tateito-yokoito.jp/?app=1&entry=purchase',
    'https://tateyoko-book.vercel.app/?guest_trial=1&entry=purchase',
    'https://tateyoko-book.vercel.app/?app=1&entry=purchase&checkout=success',
  ]) assert.equal(canonicalPurchaseUrl(new URL(url)), null);
});
