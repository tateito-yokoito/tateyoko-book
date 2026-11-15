// Read-only purchase V2 quote check against the isolated TEST project.
// Usage: node --env-file=.env.local scripts/tests/commerce-v2-test-quote-preflight.mjs
// This script never creates an order or a Checkout Session.
const testUrl = 'https://zpswxefgfabzvxdbtyvq.supabase.co';
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (url !== testUrl || !key || process.env.STRIPE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Refusing to run without the isolated TEST publishable configuration');
}

const cases = [
  { name: 'standard', edition: 'standard', method: 'self_or_family', standard: 0, premium: 0, total: 35000 },
  { name: 'premium', edition: 'premium', method: 'self_or_family', standard: 0, premium: 0, total: 65000 },
  { name: 'mixed_extra', edition: 'standard', method: 'self_or_family', standard: 1, premium: 1, total: 75000 },
  { name: 'interview_support', edition: 'premium', method: 'interview_staff', standard: 0, premium: 0, total: 85000 },
];
let failed = false;
for (const check of cases) {
  const response = await fetch(`${testUrl}/functions/v1/create-commerce-v2-checkout`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'public_quote', orderType: 'self',
      edition: check.edition, productionMethod: check.method,
      standardExtraCount: check.standard, premiumExtraCount: check.premium }),
  });
  const body = await response.json().catch(() => null);
  const ok = response.ok && body?.success === true
    && body?.quote?.amount_total === check.total
    && body?.quote?.currency === 'jpy' && body?.quote?.tax_included === true;
  console.log(JSON.stringify({ case: check.name, httpStatus: response.status,
    expectedTotal: check.total, actualTotal: body?.quote?.amount_total ?? null, pass: ok }));
  if (!ok) failed = true;
}
if (failed) process.exitCode = 1;
