// TEST-only: replay sync against a checkout whose Stripe webhook receipt already exists.
// Reads credentials from a private temp file; never prints keys or passwords.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';

const ref='zpswxefgfabzvxdbtyvq';
const media=process.argv.includes('--media');
const projectId=media?'38915ab4-98a1-4055-9a23-7a812a8ff963':'c3f1b8ec-3a16-49ca-b816-9660b835c493';
const sessionId=media?'cs_test_a1fGi1v2mvTWhECBRpQu2InISdYDmcmhxM8O7VFZ4fNVHtIV9vQl1uSkGf':'cs_test_a1bGaBGanO8zStMVmPaJaj3SLxrGq9tPnIuSDkK6w0K4wUvVjYO43SMOqD';
const account=JSON.parse(fs.readFileSync(process.env.QA_TEST_ACCOUNT_FILE,'utf8'));
assert.equal(account.ref,ref);
assert.equal(account.id,media?'f6a3009c-d0ee-4872-8823-a931545b2a5a':'6809d5cd-22da-4e40-a82a-75016849a7fa');
const raw=execFileSync(process.env.QA_SUPABASE_CLI,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const keys=JSON.parse(raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1));
const anon=keys.find(key=>key.name==='anon'&&key.type==='legacy')?.api_key;
const service=keys.find(key=>key.name==='service_role'&&key.type==='legacy')?.api_key;
assert.ok(anon&&service);
const url=`https://${ref}.supabase.co`;
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const user=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
try{
 const {data:auth,error:authError}=await user.auth.signInWithPassword({email:account.email,password:account.password});
 assert.ifError(authError);assert.equal(auth.user.id,account.id);
 const snapshot=async()=>{
  const [{data:orders,error:oe},{data:candidates,error:ce},{data:publications,error:pe},{data:works,error:we}]=await Promise.all([
   admin.from('commerce_orders').select('id,status,stripe_checkout_session_id').eq('book_project_id',projectId),
   admin.from('book_completion_candidates').select('id,state,publication_id,order_id').eq('book_project_id',projectId),
   admin.from('voice_publications').select('id,public_id,status,video_assets').eq('book_project_id',projectId),
   admin.from('book_work_manifests').select('id,confirmed_at').eq('book_project_id',projectId),
  ]);
  for(const error of [oe,ce,pe,we])assert.ifError(error);
  const publication=publications.find(row=>row.status==='published');
  assert.ok(publication);
  const {count:itemCount,error:ie}=await admin.from('voice_publication_items').select('id',{head:true,count:'exact'}).eq('publication_id',publication.id);
  assert.ifError(ie);
  const videoCount=publication.video_assets?.length||0;
  return {orders,candidates,publications,works,itemCount,videoCount};
 };
 const before=await snapshot();
 assert.equal(before.orders.filter(row=>row.stripe_checkout_session_id===sessionId&&row.status==='paid').length,1);
 const paidOrder=before.orders.find(row=>row.stripe_checkout_session_id===sessionId);
 const receipt=await admin.from('stripe_event_receipts').select('stripe_event_id,event_type,livemode').eq('object_id',sessionId).eq('event_type','checkout.session.completed');
 assert.ifError(receipt.error);assert.equal(receipt.data.length,1);assert.equal(receipt.data[0].livemode,false);
 // Completion is normally closed in TEST. Open only while replaying this
 // already-paid isolated checkout, then close even if an assertion fails.
 execFileSync(process.env.QA_SUPABASE_CLI,['secrets','set','BOOK_COMPLETION_ENABLED=true','--project-ref',ref],{stdio:['ignore','pipe','pipe']});
 try{
  for(let n=0;n<2;n++){
   const {data,error}=await user.functions.invoke('sync-checkout-session',{body:{sessionId}});
   assert.ifError(error);assert.equal(data?.success,true);assert.equal(data?.paid,true);
  }
 }finally{
  execFileSync(process.env.QA_SUPABASE_CLI,['secrets','set','BOOK_COMPLETION_ENABLED=false','--project-ref',ref],{stdio:['ignore','pipe','pipe']});
 }
 const {data:completed,error:completeError}=await admin.rpc('complete_book_order',{input_order_id:paidOrder.id});
 assert.ifError(completeError);assert.equal(completed?.completed,true);
 const after=await snapshot();
 assert.deepEqual(after,before);
 console.log(JSON.stringify({testOnly:true,webhookReceipt:true,syncReplays:2,dbCompletionReplay:true,
  onePaidOrder:true,oneCompletedCandidate:after.candidates.filter(row=>row.state==='completed').length===1,
  onePublication:after.publications.length===1,stablePublicId:after.publications[0].public_id,
  itemCount:after.itemCount,videoCount:after.videoCount,productionChanged:false}));
}finally{await user.auth.stopAutoRefresh();}
