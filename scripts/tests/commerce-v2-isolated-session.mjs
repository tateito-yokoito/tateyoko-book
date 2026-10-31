// Manual integration harness for the approved, data-free Phase 2 branch only.
// Start with: node --env-file=.env.local scripts/tests/commerce-v2-isolated-session.mjs
// Never supply a service-role key or Stripe secret to this process.
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import readline from 'node:readline';

const isolatedUrl = 'https://gmyqqcnbuiaghbrxnkaz.supabase.co';
if (process.env.VITE_SUPABASE_URL !== isolatedUrl || !process.env.VITE_SUPABASE_ANON_KEY) {
  throw new Error('Refusing to run outside the approved isolated branch');
}
if (process.env.STRIPE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('This harness accepts publishable credentials only');
}

function client() {
  return createClient(isolatedUrl, process.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
async function syntheticUser(label) {
  const api = client();
  const { data, error } = await api.auth.signUp({
    email: `phase2-${label}-${randomUUID()}@example.invalid`,
    password: randomBytes(32).toString('base64url'),
  });
  if (error || !data.session || !data.user) throw new Error(`${label} signup failed: ${error?.message || 'no session'}`);
  return { api, id: data.user.id };
}
function summary(stage, fields) {
  process.stdout.write(`${JSON.stringify({ stage, ...fields })}\n`);
}
async function invoke(api, functionName, body) {
  const { data, error } = await api.functions.invoke(functionName, { body });
  return { data, status: error?.context?.status ?? 200,
    error: data?.error ?? error?.message ?? null };
}

const buyer = await syntheticUser('buyer');
const staff = await syntheticUser('staff');
summary('ready', { buyerUserId: buyer.id, staffUserId: staff.id });
let consultationId = null;
let quote = null;
let discountQuote = null;
const gift = { recipient_name: '架空の受取人', recipient_email: '', gift_message: '' };

const lines = readline.createInterface({ input: process.stdin });
for await (const command of lines) {
  try {
    if (command === 'quit') break;
    if (command === 'consult') {
      const result = await invoke(buyer.api, 'submit-commerce-v2-consultation', {
        requestKey: randomUUID(), orderType: 'gift', productPreference: 'standard',
        standardExtraCount: 1, premiumExtraCount: 1,
        contactName: '架空の相談者', contactEmail: 'phase2-consult@example.invalid',
        consultationText: '隔離環境の聞き取り制作テスト', consentToContact: true,
        giftRecipientName: gift.recipient_name,
      });
      consultationId = result.data?.consultationId ?? null;
      summary('consult', { status: result.status, accepted: !!result.data?.success,
        consultationId, error: result.error });
    } else if (command === 'list') {
      const result = await invoke(staff.api, 'admin-commerce-v2-consultations', { action: 'list' });
      summary('list', { status: result.status, success: !!result.data?.success,
        found: !!result.data?.consultations?.some(row => row.id === consultationId), error: result.error });
    } else if (command === 'agree') {
      if (!consultationId) throw new Error('Submit a consultation first');
      const result = await invoke(staff.api, 'admin-commerce-v2-consultations', {
        action: 'agree', consultationId, agreedEdition: 'standard', purchaserUserId: buyer.id,
      });
      summary('agree', { status: result.status, success: !!result.data?.success,
        consultationStatus: result.data?.consultation?.status ?? null, error: result.error });
    } else if (command === 'quote') {
      if (!consultationId) throw new Error('Submit a consultation first');
      const result = await invoke(buyer.api, 'create-commerce-v2-checkout', {
        action: 'quote', orderType: 'gift', edition: 'standard',
        productionMethod: 'interview_staff', consultationId,
        standardExtraCount: 1, premiumExtraCount: 1,
      });
      quote = result.data?.quote ?? null;
      summary('quote', { status: result.status, success: !!result.data?.success,
        total: quote?.amount_total ?? null, error: result.error });
    } else if (command === 'checkout') {
      if (!quote) throw new Error('Request a quote first');
      const result = await invoke(buyer.api, 'create-commerce-v2-checkout', {
        action: 'checkout', requestKey: randomUUID(), expectedQuote: quote,
        orderType: 'gift', edition: 'standard', productionMethod: 'interview_staff',
        consultationId, standardExtraCount: 1, premiumExtraCount: 1, gift,
      });
      summary('checkout', { status: result.status, success: !!result.data?.success,
        total: result.data?.quote?.amount_total ?? null,
        hasStripeUrl: !!result.data?.url,
        stripeHost: result.data?.url ? new URL(result.data.url).host : null,
        error: result.error });
    } else if (command === 'discount') {
      for (const edition of ['standard', 'premium']) {
        const result = await invoke(buyer.api, 'create-commerce-v2-checkout', {
          action: 'quote', orderType: 'gift', edition,
          productionMethod: 'self_or_family', standardExtraCount: 0, premiumExtraCount: 0,
          discountCode: 'PHASE2FAKE1000',
        });
        if (edition === 'standard') discountQuote = result.data?.quote ?? null;
        summary('discount-quote', { edition, status: result.status,
          total: result.data?.quote?.amount_total ?? null, error: result.error });
      }
    } else if (command === 'discount-checkout') {
      if (!discountQuote) throw new Error('Request a discount quote first');
      const result = await invoke(buyer.api, 'create-commerce-v2-checkout', {
        action: 'checkout', requestKey: randomUUID(), expectedQuote: discountQuote,
        orderType: 'gift', edition: 'standard', productionMethod: 'self_or_family',
        standardExtraCount: 0, premiumExtraCount: 0,
        discountCode: 'PHASE2FAKE1000', gift,
      });
      summary('discount-checkout', { status: result.status, success: !!result.data?.success,
        total: result.data?.quote?.amount_total ?? null, hasStripeUrl: !!result.data?.url,
        stripeHost: result.data?.url ? new URL(result.data.url).host : null,
        error: result.error });
    } else {
      summary('unknown', { command });
    }
  } catch (error) {
    summary('error', { command, message: error.message });
  }
}
lines.close();
process.exit(0);
