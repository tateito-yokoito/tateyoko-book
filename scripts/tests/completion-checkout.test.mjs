import {build} from 'esbuild';
import assert from 'node:assert/strict';
const {outputFiles}=await build({entryPoints:['supabase/functions/_shared/completion-checkout.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {recoverCompletionCheckout}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const env={SUPABASE_URL:'https://zpswxefgfabzvxdbtyvq.supabase.co',EXPERIENCE_COMMERCE_SUPABASE_URL:'https://zpswxefgfabzvxdbtyvq.supabase.co',EXPERIENCE_COMMERCE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fixture'};
globalThis.Deno={env:{get:key=>env[key]}};
const originalFetch=globalThis.fetch,requests=[];
const order={id:'order-1',purchaser_user_id:'account-1',metadata:{book_completion_checkout_request:[['metadata[order_id]','order-1'],['metadata[user_id]','account-1'],['expires_at','1234']]}};
let response={id:'cs_test_fixture',livemode:false,status:'open',metadata:{order_id:'order-1',user_id:'account-1'}};
try{
 globalThis.fetch=async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>response};};
 assert.equal(await recoverCompletionCheckout('sk_test_fixture',{...order,metadata:{}}),null);
 assert.equal(requests.length,0);
 await recoverCompletionCheckout('sk_test_fixture',order);
 await recoverCompletionCheckout('sk_test_fixture',order);
 assert.equal(requests[0].options.headers['Idempotency-Key'],'book-completion-order-1');
 assert.equal(requests[0].options.body.toString(),requests[1].options.body.toString());
 assert.equal(requests[0].options.headers['Idempotency-Key'],requests[1].options.headers['Idempotency-Key']);
 await recoverCompletionCheckout('sk_test_fixture',{...order,stripe_checkout_session_id:'cs_test_fixture'});
 assert.equal(requests[2].options.method,'GET');
 assert.equal(requests[2].options.body,undefined);
 response={...response,metadata:{...response.metadata,user_id:'other-account'}};
 await assert.rejects(recoverCompletionCheckout('sk_test_fixture',order),/identity mismatch/);
 response={...response,livemode:true};
 await assert.rejects(recoverCompletionCheckout('sk_test_fixture',order),/mode mismatch/);
 console.log('PASS checkout recovery: no unprepared request, exact parameters/key reused, existing session read-only, identity and environment mismatch denied');
}finally{globalThis.fetch=originalFetch;delete globalThis.Deno;}
