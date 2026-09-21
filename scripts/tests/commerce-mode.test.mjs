import assert from 'node:assert/strict';
import {build} from 'esbuild';
const env={};
globalThis.Deno={env:{get:key=>env[key]}};
const compiled=await build({entryPoints:['supabase/functions/_shared/experience-commerce.ts'],bundle:true,write:false,format:'esm'});
const m=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
assert.throws(()=>m.commerceMode(),/disabled/);
Object.assign(env,{EXPERIENCE_COMMERCE_MODE:'test',SUPABASE_URL:'https://zpswxefgfabzvxdbtyvq.supabase.co',
 EXPERIENCE_COMMERCE_SUPABASE_URL:'https://zpswxefgfabzvxdbtyvq.supabase.co',STRIPE_SECRET_KEY:'sk_test_fixture'});
assert.equal(m.requireStripeEnvironment(env.STRIPE_SECRET_KEY),'test');
assert.throws(()=>m.requireStripeEnvironment('sk_live_fixture'),/mismatch/);
assert.throws(()=>m.requireCheckoutEnabled(),/paused/);
env.EXPERIENCE_CHECKOUT_ENABLED='true';m.requireCheckoutEnabled();
m.requireEventMode(false);assert.throws(()=>m.requireEventMode(true),/mismatch/);
env.EXPERIENCE_COMMERCE_MODE='live';assert.throws(()=>m.commerceMode(),/project/);
env.SUPABASE_URL=env.EXPERIENCE_COMMERCE_SUPABASE_URL='https://wquxjeqkumossjxehdop.supabase.co';
assert.throws(()=>m.requireStripeEnvironment('sk_test_fixture'),/mismatch/);
env.STRIPE_SECRET_KEY='sk_live_fixture';assert.equal(m.requireStripeEnvironment(env.STRIPE_SECRET_KEY),'live');
m.requireEventMode(true);assert.throws(()=>m.requireEventMode(false),/mismatch/);
env.EXPERIENCE_CONTRACTS_V2_TEST_ONLY='true';assert.throws(()=>m.commerceMode(),/conflicting/);delete env.EXPERIENCE_CONTRACTS_V2_TEST_ONLY;
env.EXPERIENCE_CHECKOUT_ENABLED='false';assert.throws(()=>m.requireCheckoutEnabled(),/paused/);
m.requireEventMode(true); // stopping new sales does not stop settlement/refund processing
env.EXPERIENCE_COMMERCE_MODE='test';assert.throws(()=>m.commerceMode(),/project/);
console.log('PASS mode/project/key/event isolation, disabled defaults, explicit live configuration (offline fake key only), independent checkout pause');
