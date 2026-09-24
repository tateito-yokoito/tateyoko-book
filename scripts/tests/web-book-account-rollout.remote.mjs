// Isolated TEST only. Never use a production ref, Stripe live key or customer Account.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const ref='zpswxefgfabzvxdbtyvq',cli=process.env.QA_SUPABASE_CLI,mode=process.argv[2];
assert.ok(cli&&['--setup','--negative','--close'].includes(mode));
const dir='output/web-book-e2e',file=`${dir}/account-rollout-private.json`;
const account=JSON.parse(fs.readFileSync(process.env.QA_TEST_ACCOUNT_FILE,'utf8'));
const supporters=JSON.parse(fs.readFileSync('output/existing-supporter/state-private.json','utf8'));
assert.equal(account.ref,ref);assert.equal(supporters.ref,ref);
assert.equal(account.id,'f6a3009c-d0ee-4872-8823-a931545b2a5a');
const raw=execFileSync(cli,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const keys=JSON.parse(raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1));
const anon=keys.find(x=>x.name==='anon'&&x.type==='legacy')?.api_key;
const service=keys.find(x=>x.name==='service_role'&&x.type==='legacy')?.api_key;
assert.ok(anon&&service);
const url=`https://${ref}.supabase.co`;
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const user=()=>createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const ok=async result=>{const {data,error}=await result;assert.ifError(error);return data;};
const qa=user();await ok(qa.auth.signInWithPassword({email:account.email,password:account.password}));
const clients={};
for(const name of ['mother','daughter','viewer']){
 const c=user();await ok(c.auth.setSession(supporters.actors[name].session));clients[name]=c;
}
const gate=()=>admin.from('book_completion_rollout').select('enabled,allowed_account_ids').eq('singleton',true).single();
const update=async (enabled,allowed_account_ids)=>{await ok(admin.from('book_completion_rollout').update({enabled,allowed_account_ids}).eq('singleton',true));};
const allowed=async (client,project)=>{
 const {data,error}=await client.rpc('can_use_book_completion',{input_project_id:project});assert.ifError(error);return data;
};
const denied=async result=>{const {data,error}=await result;assert.ok(error||data?.success===false,'Expected request to be rejected');return error?.context?.status||403;};
const candidateProject=()=>{
 const state=JSON.parse(fs.readFileSync('output/web-book-e2e/source-guard-fixtures.json','utf8'));
 assert.equal(state.ref,ref);return state.results.find(item=>item.kind==='checkout_valid')?.project;
};
try{
 if(mode==='--setup'){
  assert.ok(!fs.existsSync(file),'Close the previous TEST run first');
  const original=await ok(gate());assert.equal(original.enabled,false);
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  fs.writeFileSync(file,JSON.stringify({ref,original},null,2),{mode:0o600});
  await update(true,[account.id]);
  execFileSync(cli,['secrets','set','BOOK_COMPLETION_ENABLED=true','--project-ref',ref],{stdio:['ignore','pipe','pipe']});
  console.log(JSON.stringify({testOnly:true,globalOn:true,allowlistCount:1,productionChanged:false}));
 }else if(mode==='--negative'){
  const state=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(state.ref,ref);
  const project=candidateProject();assert.ok(project);
  assert.equal(await allowed(qa,project),true);
  const candidate=await ok(qa.rpc('prepare_book_completion',{input_project_id:project,input_expected_revision:1,
   input_qr_in_book:false,input_pin:'',input_subject_confirmed:true}));
  assert.equal(candidate.state,'prepared');
  state.candidateId=candidate.id;state.project=project;
  fs.writeFileSync(file,JSON.stringify(state,null,2),{mode:0o600});
  const published=await ok(qa.functions.invoke('publish-voice-edition',{
   body:{action:'prepare_completion',bookProjectId:project,candidateId:candidate.id}}));
  assert.equal(published.success,true);

  const target=supporters.target.project;
  assert.equal(await allowed(clients.mother,target),false,'Unlisted subject stays on legacy flow');
  await denied(clients.mother.rpc('prepare_book_completion',{input_project_id:target,input_expected_revision:1,
   input_qr_in_book:false,input_pin:'',input_subject_confirmed:true}));
  // The mother may restore her own synthetic TEST daughter's production role.
  await ok(clients.mother.rpc('family_confirm_production_support',{
   p:target,supporter:supporters.actors.daughter.id,confirmed:true}));
  try{
   await update(true,[account.id,supporters.actors.daughter.id,supporters.actors.viewer.id]);
   assert.equal(await allowed(clients.daughter,target),true,'Production Supporter may act on her assigned story');
   assert.equal(await allowed(clients.daughter,project),false,'Supporter may not act on an unrelated story');
   assert.equal(await allowed(clients.viewer,target),false,'Viewer does not gain production access from allowlist');
  }finally{
   await ok(clients.mother.rpc('family_revoke_production_support',{
    p:target,supporter:supporters.actors.daughter.id}));
  }

  await update(true,[]);
  assert.equal(await allowed(qa,project),false,'Removing Account closes the new flow');
  await denied(qa.rpc('prepare_book_completion',{input_project_id:project,input_expected_revision:1,
   input_qr_in_book:false,input_pin:'',input_subject_confirmed:true}));
  await denied(qa.functions.invoke('publish-voice-edition',{
   body:{action:'prepare_completion',bookProjectId:project,candidateId:candidate.id}}));
  const checkoutBody={projectId:project,orderType:'self',standardExtraCopyCount:0,premiumCopyCount:0,
   includeGiftPackage:false,shippingAddress:{recipient_name:'TEST',postal_code:'1000001',prefecture:'東京都',city:'TEST',line1:'1-1'},
   returnContext:'book_builder',completionCandidateId:candidate.id};
  await denied(qa.functions.invoke('create-checkout-session',{body:checkoutBody}));
  const orders=await ok(admin.from('commerce_orders').select('id').eq('book_project_id',project));
  assert.equal(orders.length,0,'No Checkout/order is created after removal');

  await update(false,[account.id]);
  assert.equal(await allowed(qa,project),false,'Global OFF overrides allowlist');
  await denied(qa.rpc('prepare_book_completion',{input_project_id:project,input_expected_revision:1,
   input_qr_in_book:false,input_pin:'',input_subject_confirmed:true}));
  await denied(qa.functions.invoke('publish-voice-edition',{
   body:{action:'prepare_completion',bookProjectId:project,candidateId:candidate.id}}));
  await denied(qa.functions.invoke('create-checkout-session',{body:checkoutBody}));
  await update(true,[account.id]);
  assert.equal(await allowed(qa,project),true,'Readding Account restores the new flow');
  assert.equal(await allowed(clients.daughter,target),false,'Revoked Supporter stays denied');
  console.log(JSON.stringify({testOnly:true,allowed:true,unlisted:false,directRpcDenied:true,directEdgesDenied:true,
   supporterOnlyAssignedStory:true,viewerDenied:true,removedDenied:true,globalOffDenied:true,readded:true,
   existingCandidatePreserved:true,productionChanged:false}));
 }else{
  const state=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(state.ref,ref);
  await update(state.original.enabled,state.original.allowed_account_ids);
  execFileSync(cli,['secrets','set','BOOK_COMPLETION_ENABLED=false','--project-ref',ref],{stdio:['ignore','pipe','pipe']});
  const restored=await ok(gate());assert.deepEqual(restored,state.original);
  fs.unlinkSync(file);
  console.log(JSON.stringify({testOnly:true,restored:true,rollout:restored.enabled,allowlistCount:restored.allowed_account_ids.length,
   edgeFlag:false,productionChanged:false}));
 }
}finally{
 for(const client of [qa,...Object.values(clients)])await client.auth.stopAutoRefresh();
}
