import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync('supabase/functions/create-checkout-session/index.ts', 'utf8');
const statement = source.match(/^    if \(authData\.user\.email\?\.trim\(\)\) form\.set\("customer_email", authData\.user\.email\.trim\(\)\);$/m)?.[0];
assert.ok(statement, 'Checkout must omit customer_email for accounts without email');

test('Checkout pre-fills an existing email but lets LINE-only users enter one', () => {
  for (const [email, expected] of [[null, null], ['', null], ['  ', null], [' person@example.com ', 'person@example.com']]) {
    const form = new URLSearchParams();
    vm.runInNewContext(statement, { form, authData: { user: { email } } });
    assert.equal(form.get('customer_email'), expected);
  }
});
