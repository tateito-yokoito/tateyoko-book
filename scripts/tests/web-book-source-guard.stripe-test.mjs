// TEST-only paid-completion regression. Use --prepare, --verify, --close.
// Stripe must remain cs_test_ / livemode=false. No production calls.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const mode=process.argv[2];
assert.ok(['--prepare','--verify','--close'].includes(mode));
const ref='zpswxefgfabzvxdbtyvq',cli=process.env.QA_SUPABASE_CLI;
assert.ok(cli);
const fixture=JSON.parse(fs.readFileSync('output/web-book-e2e/source-guard-fixtures.json','utf8'));
assert.equal(fixture.ref,ref);
const project=fixture.results.find(row=>row.kind==='checkout_valid')?.project;
assert.ok(project);
const account=JSON.parse(fs.readFileSync(process.env.QA_TEST_ACCOUNT_FILE,'utf8'));
assert.equal(account.ref,ref);
const raw=execFileSync(cli,['projects','api-keys','--project-ref',ref,'--output','json'],
 {encoding:'utf8',stdio:['ignore','pipe','pipe']});
const keys=JSON.parse(raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1));
const anon=keys.find(key=>key.name==='anon'&&key.type==='legacy')?.api_key;
const service=keys.find(key=>key.name==='service_role'&&key.type==='legacy')?.api_key;
assert.ok(anon&&service);
const url=`https://${ref}.supabase.co`;
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const user=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const ok=async promise=>{const {data,error}=await promise;assert.ifError(error);return data;};
const db=sql=>{
 const output=execFileSync(cli,['db','query','--linked','--project-ref',ref,sql],
  {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000});
 const result=JSON.parse(output.slice(output.indexOf('{')));
 assert.ok(!result.error,result.error?.message);return result.rows;
};
try{
 if(mode==='--close'){
  db('update public.book_completion_rollout set enabled=false where singleton=true;');
  execFileSync(cli,['secrets','set','BOOK_COMPLETION_ENABLED=false','--project-ref',ref],{stdio:['ignore','pipe','pipe']});
  console.log(JSON.stringify({testOnly:true,rollout:false,edgeFlag:false,productionChanged:false}));
  process.exit(0);
 }
 const auth=await ok(user.auth.signInWithPassword({email:account.email,password:account.password}));
 assert.equal(auth.user.id,account.id);
 if(mode==='--prepare'){
  db('update public.book_completion_rollout set enabled=true where singleton=true;');
  execFileSync(cli,['secrets','set','BOOK_COMPLETION_ENABLED=true','--project-ref',ref],{stdio:['ignore','pipe','pipe']});
  let candidate=await ok(user.rpc('prepare_book_completion',{input_project_id:project,input_expected_revision:1,
   input_qr_in_book:false,input_pin:'',input_subject_confirmed:true}));
  assert.ok(['prepared','checkout'].includes(candidate.state));
  const existing=await ok(admin.from('book_completion_candidates').select('media_ready_at').eq('id',candidate.id).single());
  if(!existing.media_ready_at){
   const prepared=await ok(user.functions.invoke('publish-voice-edition',{
    body:{action:'prepare_completion',bookProjectId:project,candidateId:candidate.id}}));
   assert.equal(prepared.success,true);
  }
  const checkoutAttempt=await user.functions.invoke('create-checkout-session',{body:{projectId:project,orderType:'self',
   standardExtraCopyCount:0,premiumCopyCount:0,includeGiftPackage:false,
   shippingAddress:{recipient_name:'架空 テスト',postal_code:'1000001',prefecture:'東京都',city:'架空市',line1:'1-1 TEST発送禁止'},
   returnContext:'book_builder',completionCandidateId:candidate.id}});
  if(checkoutAttempt.error)throw new Error(JSON.stringify({status:checkoutAttempt.error.context?.status,
    body:await checkoutAttempt.error.context?.text?.().catch(()=>null)}));
  const checkout=checkoutAttempt.data;
  assert.equal(checkout.success,true);
  assert.match(checkout.checkoutUrl||'',/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/);
  fs.writeFileSync('output/web-book-e2e/source-guard-stripe-checkout.json',JSON.stringify({ref,project,candidateId:candidate.id,
   orderId:checkout.orderId,url:checkout.checkoutUrl},null,2),{mode:0o600});
  console.log(JSON.stringify({testOnly:true,prepared:true,publicationDraft:true,stripeTestCheckout:true,
   checkoutFile:'output/web-book-e2e/source-guard-stripe-checkout.json',productionChanged:false}));
 }else{
  const checkout=JSON.parse(fs.readFileSync('output/web-book-e2e/source-guard-stripe-checkout.json','utf8'));
  assert.equal(checkout.project,project);
  const candidates=await ok(admin.from('book_completion_candidates').select('id,state,publication_id,order_id').eq('book_project_id',project));
  const publications=await ok(admin.from('voice_publications').select('id,status,public_id').eq('book_project_id',project));
  const completed=candidates.filter(row=>row.state==='completed');
  assert.equal(completed.length,1);
  assert.equal(publications.length,1);assert.equal(publications[0].status,'published');
  assert.equal(publications[0].id,completed[0].publication_id);
  fs.writeFileSync('output/web-book-e2e/source-guard-stripe-checkout.json',JSON.stringify({...checkout,publicId:publications[0].public_id},null,2),{mode:0o600});
  const library=await ok(user.rpc('list_completed_web_book_library'));
  assert.ok(library.some(row=>row.book_project_id===project));
  const items=await ok(admin.from('voice_publication_items').select('audio_assets,photo_assets').eq('publication_id',publications[0].id));
  assert.equal(items.length,1);assert.equal(items[0].audio_assets.length,1);assert.equal(items[0].photo_assets.length,1);
  console.log(JSON.stringify({testOnly:true,stripeCompletion:true,oneCandidate:true,onePublication:true,
   shelfEntry:true,realAudio:true,realPhoto:true,productionChanged:false}));
 }
}finally{await user.auth.stopAutoRefresh();}
