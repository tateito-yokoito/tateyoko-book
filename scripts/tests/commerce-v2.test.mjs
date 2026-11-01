import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertLegacyCheckoutAllowedForProject,
  assertStripePriceMatchesLine,
  calculateCommerceV2AdditionalCopyQuote,
  calculateCommerceV2Quote,
  checkoutSessionDisposition,
  routeAfterCommerceV2Purchase,
} from '../../supabase/functions/_shared/commerce-v2.ts';
import { paidOnboardingApplies } from '../../src/lib/paidOnboarding.js';
import { shouldKickBookProduction } from '../../supabase/functions/_shared/commerce-v2-routing.ts';

const catalog = [
  ['standard_bundle_v2', 35000],
  ['premium_bundle_v2', 65000],
  ['standard_extra_v2', 5000],
  ['premium_extra_v2', 35000],
  ['interview_support_v1', 20000],
].map(([product_code, amount_jpy]) => ({
  product_code, amount_jpy, currency: 'jpy', tax_included: true, is_active: true,
}));
const input = (more = {}) => ({
  edition: 'standard', productionMethod: 'self_or_family',
  standardExtraCount: 0, premiumExtraCount: 0, ...more,
});

test('cached Stripe price must match amount, tax, product and environment', () => {
  const line = calculateCommerceV2Quote(input(), catalog).lines[0];
  const price = { id: 'price_test', object: 'price', active: true, livemode: false,
    currency: 'jpy', unit_amount: 35000, tax_behavior: 'inclusive', type: 'one_time', product: 'prod_standard' };
  assert.equal(assertStripePriceMatchesLine(line, price, 'test', 'prod_standard'), 'price_test');
  assert.throws(() => assertStripePriceMatchesLine(line, { ...price, unit_amount: 49800 }, 'test', 'prod_standard'));
  assert.throws(() => assertStripePriceMatchesLine(line, { ...price, livemode: true }, 'test', 'prod_standard'));
  assert.throws(() => assertStripePriceMatchesLine(line, { ...price, product: 'prod_old' }, 'test', 'prod_standard'));
});

test('standard and premium each include one base bundle without another WebBook line', () => {
  assert.equal(calculateCommerceV2Quote(input(), catalog).totalJpy, 35000);
  assert.equal(calculateCommerceV2Quote(input({ edition: 'premium' }), catalog).totalJpy, 65000);
});

test('mixed additional copies have flat per-copy prices and no quantity discount', () => {
  const quote = calculateCommerceV2Quote(input({ standardExtraCount: 3, premiumExtraCount: 2 }), catalog);
  assert.deepEqual(quote.lines.map(line => [line.productCode, line.quantity, line.lineAmountJpy]), [
    ['standard_bundle_v2', 1, 35000],
    ['standard_extra_v2', 3, 15000],
    ['premium_extra_v2', 2, 70000],
  ]);
  assert.equal(quote.totalJpy, 120000);
});

test('completion-time additional copies charge only selected copies at fixed prices', () => {
  const standard = calculateCommerceV2AdditionalCopyQuote(1, 0, catalog);
  const premium = calculateCommerceV2AdditionalCopyQuote(0, 1, catalog);
  const mixed = calculateCommerceV2AdditionalCopyQuote(3, 2, catalog);
  assert.equal(standard.totalJpy, 5000);
  assert.equal(premium.totalJpy, 35000);
  assert.equal(mixed.totalJpy, 85000);
  assert.deepEqual(mixed.lines.map(line => [line.productCode, line.quantity, line.lineAmountJpy]), [
    ['standard_extra_v2', 3, 15000],
    ['premium_extra_v2', 2, 70000],
  ]);
  assert.equal(mixed.discountJpy, 0);
  assert.throws(() => calculateCommerceV2AdditionalCopyQuote(0, 0, catalog));
  assert.throws(() => calculateCommerceV2AdditionalCopyQuote(31, 0, catalog));
  assert.throws(() => calculateCommerceV2AdditionalCopyQuote(1, 0,
    catalog.filter(row => row.product_code !== 'standard_extra_v2')));
});

test('a V2 project cannot enter the legacy discounted reprint checkout', () => {
  assert.doesNotThrow(() => assertLegacyCheckoutAllowedForProject({ purchased_edition_v2: null }));
  assert.throws(() => assertLegacyCheckoutAllowedForProject({ purchased_edition_v2: 'standard' }));
  assert.throws(() => assertLegacyCheckoutAllowedForProject({ purchased_edition_v2: 'premium' }));
});

test('only an expired Stripe session can release a pending order for a fresh retry', () => {
  assert.equal(checkoutSessionDisposition('open', true), 'resume');
  assert.equal(checkoutSessionDisposition('open', false), 'wait_for_settlement');
  assert.equal(checkoutSessionDisposition('complete', false), 'wait_for_settlement');
  assert.equal(checkoutSessionDisposition('expired', false), 'retire_and_retry');
});

test('interview support requires agreed consultation and is charged once', () => {
  assert.throws(() => calculateCommerceV2Quote(input({ productionMethod: 'interview_staff' }), catalog));
  const quote = calculateCommerceV2Quote(input({
    edition: 'premium', productionMethod: 'interview_staff', consultationAgreed: true,
  }), catalog);
  assert.equal(quote.totalJpy, 85000);
  assert.equal(quote.lines.at(-1).productCode, 'interview_support_v1');
});

test('all four base-edition and production-method totals use the approved prices', () => {
  for (const [edition, base] of [['standard', 35000], ['premium', 65000]]) {
    for (const [productionMethod, support] of [['self_or_family', 0], ['interview_staff', 20000]]) {
      const quote = calculateCommerceV2Quote(input({ edition, productionMethod,
        consultationAgreed: support > 0 }), catalog);
      assert.equal(quote.subtotalJpy, base + support);
      assert.equal(quote.totalJpy, base + support);
      assert.equal(quote.lines.reduce((total, line) => total + line.lineAmountJpy, 0), quote.totalJpy);
    }
  }
});

test('mixed extra copies and a book-only legacy discount leave interview support payable', () => {
  const quote = calculateCommerceV2Quote(input({
    edition: 'standard', productionMethod: 'interview_staff', consultationAgreed: true,
    standardExtraCount: 1, premiumExtraCount: 1,
    discountScope: 'entire_order', discountAmount: 75000,
  }), catalog);
  assert.equal(quote.subtotalJpy, 95000);
  assert.equal(quote.totalJpy, 20000);
});

test('trusted discount amount is bounded by base bundle', () => {
  assert.equal(calculateCommerceV2Quote(input({ discountAmount: 10000 }), catalog).totalJpy, 25000);
  assert.throws(() => calculateCommerceV2Quote(input({ discountAmount: 35001 }), catalog));
  assert.throws(() => calculateCommerceV2Quote(input({ discountAmount: 1.5 }), catalog));
});

test('existing full-order test coupon can produce a zero-yen V2 order without Stripe payment', () => {
  const quote = calculateCommerceV2Quote(input({
    edition: 'premium', standardExtraCount: 1,
    discountScope: 'entire_order', discountAmount: 70000,
  }), catalog);
  assert.equal(quote.subtotalJpy, 70000);
  assert.equal(quote.discountJpy, 70000);
  assert.equal(quote.totalJpy, 0);
  assert.throws(() => calculateCommerceV2Quote(input({
    discountScope: 'entire_order', discountAmount: 35001,
  }), catalog));
});

test('invalid counts and inactive catalog rows fail closed', () => {
  assert.throws(() => calculateCommerceV2Quote(input({ standardExtraCount: 31 }), catalog));
  assert.throws(() => calculateCommerceV2Quote(input(), catalog.filter(row => row.product_code !== 'standard_bundle_v2')));
});

test('post-purchase route is based on persisted order, not browser choice', () => {
  assert.equal(routeAfterCommerceV2Purchase({ status: 'checkout_pending', pricing_version: 'v2', production_method_v2: 'interview_staff' }), 'payment_pending');
  assert.equal(routeAfterCommerceV2Purchase({ status: 'paid', pricing_version: 'v2', production_method_v2: 'interview_staff' }), 'staff_contact_waiting');
  assert.equal(routeAfterCommerceV2Purchase({ status: 'paid', pricing_version: 'v2', production_method_v2: 'self_or_family' }), 'normal_onboarding');
  assert.equal(routeAfterCommerceV2Purchase({ status: 'paid', pricing_version: null }), 'legacy');
  assert.equal(routeAfterCommerceV2Purchase({ status: 'zero_paid', pricing_version: 'v2', production_method_v2: 'interview_staff' }), 'staff_contact_waiting');
  assert.equal(routeAfterCommerceV2Purchase({ status: 'failed', pricing_version: 'v2', production_method_v2: 'self_or_family' }), 'payment_pending');
});

test('support order never enters ordinary paid recording on reload', () => {
  const questions = [{ onboarding_group: 'starting_conversation' }];
  assert.equal(paidOnboardingApplies({ access_status: 'paid', production_method_v2: 'interview_staff' }, questions), false);
  assert.equal(paidOnboardingApplies({ access_status: 'paid', production_method_v2: 'self_or_family' }, questions), true);
  assert.equal(paidOnboardingApplies({ access_status: 'paid' }, questions), true);
});

test('paid interview support does not trigger automatic book production; legacy and self-made books retain it', async () => {
  const lookup = order => ({
    from: table => {
      assert.equal(table, 'commerce_orders');
      return { select: columns => {
        assert.equal(columns, 'pricing_version,production_method_v2');
        return { eq: (column, id) => {
          assert.equal(column, 'id');
          assert.equal(id, 'order-under-test');
          return { single: async () => ({ data: order, error: null }) };
        } };
      } };
    },
  });
  assert.equal(await shouldKickBookProduction(lookup({ pricing_version: 'v2', production_method_v2: 'interview_staff' }), 'order-under-test'), false);
  assert.equal(await shouldKickBookProduction(lookup({ pricing_version: 'v2', production_method_v2: 'self_or_family' }), 'order-under-test'), true);
  assert.equal(await shouldKickBookProduction(lookup({ pricing_version: null, production_method_v2: null }), 'order-under-test'), true);
});
