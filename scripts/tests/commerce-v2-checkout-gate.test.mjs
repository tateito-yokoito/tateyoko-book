import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { requireCommerceV2CheckoutEnabled } from '../../supabase/functions/_shared/commerce-v2-checkout-gate.ts';

const functions = [
  'create-commerce-v2-checkout',
  'create-commerce-v2-additional-checkout',
];

test('Phase 2 checkout remains closed unless explicitly enabled', () => {
  for (const value of [undefined, '', 'false', 'TRUE', '1']) {
    assert.throws(() => requireCommerceV2CheckoutEnabled(() => value), /paused/);
  }
  assert.doesNotThrow(() => requireCommerceV2CheckoutEnabled(() => 'true'));
});

test('both Phase 2 checkout entrypoints enforce the independent gate before user or order work', () => {
  for (const name of functions) {
    const source = readFileSync(new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8');
    assert.match(source, /import \{ requireCommerceV2CheckoutEnabled \} from "\.\.\/_shared\/commerce-v2-checkout-gate\.ts"/);
    assert.ok(source.indexOf('requireCommerceV2CheckoutEnabled();') < source.indexOf('admin.auth.getUser('));
  }
});

test('legacy checkout, return sync and webhook do not depend on the Phase 2 gate', () => {
  for (const name of ['create-checkout-session', 'sync-checkout-session', 'stripe-webhook']) {
    const source = readFileSync(new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /COMMERCE_V2_CHECKOUT_ENABLED|requireCommerceV2CheckoutEnabled/);
  }
});
