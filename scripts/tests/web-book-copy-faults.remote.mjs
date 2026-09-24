// Fault-inject the actual Edge handler locally against isolated REMOTE TEST DB/Storage.
// No fault switch is deployed. No PROD URLs/keys, no real Stripe charges.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createClient} from '@supabase/supabase-js';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const originalConsoleError=console.error;
console.error=(...args)=>originalConsoleError(...args.map(value=>value instanceof Error?value.message:value));
const ref='zpswxefgfabzvxdbtyvq',url=`https://${ref}.supabase.co`,cli=process.env.QA_SUPABASE_CLI;
const account=JSON.parse(fs.readFileSync(process.env.QA_TEST_ACCOUNT_FILE,'utf8'));
assert.equal(account.ref,ref);assert.equal(account.id,'f6a3009c-d0ee-4872-8823-a931545b2a5a');
const raw=execFileSync(cli,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const keys=JSON.parse(raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1));
const anon=keys.find(k=>k.name==='anon'&&k.type==='legacy').api_key;
const service=keys.find(k=>k.name==='service_role'&&k.type==='legacy').api_key;
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const user=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const ok=async p=>{const r=await p;if(r.error)throw Error(r.error.message);return r.data;};
const lit=value=>`'${String(value).replaceAll("'","''")}'`;
const db=sql=>{
 const raw=execFileSync(cli,['db','query','--linked','--project-ref',ref,sql],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000});
 const r=JSON.parse(raw.slice(raw.indexOf('{')));if(r.error)throw Error(r.error.message);return r.rows;
};
const hash=b=>createHash('sha256').update(b).digest('hex');
const audio=fs.readFileSync('public/site/hp-renewal/sample-voice.wav');
const photo=fs.readFileSync('public/site/hero-book.jpg');
const context=new AsyncLocalStorage();let removals=0,sequence=Math.floor(Date.now()/1000)+300000;
const results=[];
function barrier(count){let arrive=0,release;const ready=new Promise(r=>release=r);return async()=>{if(++arrive===count)release();await ready;};}

function wrappedClient(base,ctx){
 return new Proxy(base,{get(target,key){
  if(key==='storage')return {from(bucket){
   const storage=base.storage.from(bucket);
   return new Proxy(storage,{get(t,k){
    if(k==='remove')return async()=>{removals++;throw Error('Unexpected cleanup removal');};
    if(k==='list')return async(...args)=>{const r=await t.list(...args);
     if(ctx.copyBarrier&&!ctx.listWaited){ctx.listWaited=true;await ctx.copyBarrier();}return r;};
    if(k==='copy')return async(source,dest)=>{
     ctx.copyAttempts++;
     if(ctx.mode==='third_copy'&&ctx.copyAttempts===3)return {data:null,error:{message:'Injected third copy outage'}};
     if(ctx.mode==='unexpected_content'&&ctx.copyAttempts===1){
      const bytes=Buffer.from(audio);bytes[bytes.length-1]^=1;
      await ok(storage.upload(dest,bytes,{contentType:'audio/wav',upsert:false}));
      ctx.corrupt={bucket,path:dest,sha256:hash(bytes)};
      return {data:null,error:{message:'Injected conflicting destination'}};
     }
     return t.copy(source,dest);
    };
    return typeof t[k]==='function'?t[k].bind(t):t[k];
   }});
  }};
  if(key==='rpc')return async(name,args)=>{
   const r=await target.rpc(name,args);
   if(name==='write_book_completion_publication'&&!r.error&&ctx.mode.startsWith('after_commit')){
    ctx.committed=true;
    if(ctx.mode==='after_commit_throw')throw Error('Injected transport exception after DB commit');
    return {data:null,error:{message:'Injected lost DB response after commit'}};
   }
   return r;
  };
  if(key==='from')return table=>{
   const q=target.from(table);
   const wrap=query=>new Proxy(query,{get(t,k){
    if(k==='maybeSingle')return async()=>{const r=await t.maybeSingle();
     if(table==='voice_publications'&&r.data===null&&ctx.publicationBarrier&&!ctx.publicationWaited){ctx.publicationWaited=true;await ctx.publicationBarrier();}return r;};
    if(typeof t[k]!=='function')return t[k];
    if(k==='then')return t[k].bind(t);
    return (...args)=>{const next=t[k](...args);return next&&typeof next==='object'&&'then' in next?wrap(next):next;};
   }});
   return wrap(q);
  };
  return typeof target[key]==='function'?target[key].bind(target):target[key];
 }});
}
globalThis.Deno={env:{get:key=>({SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:service,BOOK_COMPLETION_ENABLED:'true',FAMILY_TEST_ENABLED:'true',APP_URL:'https://qa.invalid'})[key]}};
globalThis.makePublicationClient=(clientUrl,key,options)=>{
 assert.equal(clientUrl,url);const base=createClient(clientUrl,key,{...options,auth:{persistSession:false,autoRefreshToken:false}});
 return options?base:wrappedClient(base,context.getStore());
};
const compiled=await build({entryPoints:['supabase/functions/publish-voice-edition/index.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'test-adapter',setup(b){
 b.onResolve({filter:/^https:\/\//},args=>({path:args.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path.includes('supabase-js')?'export const createClient=(...args)=>globalThis.makePublicationClient(...args);':'export const serve=handler=>{globalThis.publicationHandler=handler};'}));
}}]});
await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const auth=await ok(user.auth.signInWithPassword({email:account.email,password:account.password}));
const token=auth.session.access_token;
const family=(await ok(admin.from('book_projects').select('family_id').eq('id','38915ab4-98a1-4055-9a23-7a812a8ff963').single())).family_id;
const questionId=(await ok(admin.from('user_questions').select('question_id').eq('id','81b53b75-b341-44fc-a7a6-f27bcd0d96fd').single())).question_id;
const originalGate=await ok(admin.from('book_completion_rollout').select('enabled').eq('singleton',true).single());
async function seed(label){
 const p=randomUUID(),person=randomUUID(),answer=randomUUID(),question=randomUUID();sequence++;
 db(`begin;
 insert into public.persons(id,family_id,display_name) values(${lit(person)},${lit(family)},${lit(`Copy failure ${label} QA`)});
 insert into public.book_projects(id,family_id,owner_user_id,subject_person_id,title,status) values(${lit(p)},${lit(family)},${lit(account.id)},${lit(person)},${lit(`Copy failure ${label} QA`)},'active');
 insert into public.user_questions(id,user_id,book_project_id,question_id,sequence_order,chapter,status,is_active) values(${lit(question)},${lit(account.id)},${lit(p)},${lit(questionId)},${sequence},'QA','answered',true);
 insert into public.answers(id,user_id,book_project_id,subject_person_id,speaker_person_id,user_question_id,question_id,sequence_order,transcript_edited) values(${lit(answer)},${lit(account.id)},${lit(p)},${lit(person)},${lit(person)},${lit(question)},${lit(questionId)},${sequence},'Isolated copy integrity QA');commit;`);
 const assets=[];
 for(let n=1;n<=4;n++){
  const isPhoto=n===4,bucket=isPhoto?'photos':'audio',path=`${account.id}/${p}/${answer}/${isPhoto?'photo-01.jpg':`part-0${n}.wav`}`,bytes=isPhoto?photo:audio;
  await ok(admin.storage.from(bucket).upload(path,bytes,{contentType:isPhoto?'image/jpeg':'audio/wav',upsert:false}));
  db(`insert into public.media_assets(answer_id,user_id,family_id,book_project_id,person_id,asset_type,storage_path,meta_json) values(${lit(answer)},${lit(account.id)},${lit(family)},${lit(p)},${lit(person)},${lit(isPhoto?'photo':'audio')},${lit(path)},${lit(JSON.stringify({part:n,qa_fixture:true}))}::jsonb);`);
  assets.push({bucket,path,sha256:hash(bytes)});
 }
 const work=await ok(user.rpc('save_book_selection',{input_project_id:p,input_answer_ids:[answer],input_expected_revision:0}));
 const candidate=await ok(user.rpc('prepare_book_completion',{input_project_id:p,input_expected_revision:work.revision,input_qr_in_book:false,input_pin:'',input_subject_confirmed:true}));
 return {label,project:p,candidate:candidate.id,assets};
}
async function invoke(f,mode='normal',extra={}){
 const ctx={mode,copyAttempts:0,...extra};
 const r=await context.run(ctx,()=>globalThis.publicationHandler(new Request('https://qa.invalid',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'prepare_completion',bookProjectId:f.project,candidateId:f.candidate})})));
 return {status:r.status,body:await r.json(),ctx};
}
async function state(f){
 const c=await ok(admin.from('book_completion_candidates').select('*').eq('id',f.candidate).single());
 const pubs=await ok(admin.from('voice_publications').select('id,public_id,status,snapshot_metadata').eq('book_project_id',f.project));
 assert.equal(pubs.length,1);
 return {c,p:pubs[0]};
}
async function verifyFiles(f){
 const {p}=await state(f);assert.equal(p.snapshot_metadata.copyIntegrity.length,4);
 for(const asset of p.snapshot_metadata.copyIntegrity){
  const data=await ok(admin.storage.from(asset.bucket).download(asset.path));
  assert.equal(hash(Buffer.from(await data.arrayBuffer())),asset.sha256);
 }
 return p.snapshot_metadata.copyIntegrity.map(x=>x.path).sort();
}
async function completeFixture(f,parallel=false){
 // Fixture-only payment status, NOT a Stripe test. Real Stripe is a separate regression.
 const order=await ok(admin.from('commerce_orders').insert({book_project_id:f.project,purchaser_user_id:account.id,order_type:'self',product_code:'self_book_v1',status:'checkout_pending',amount_subtotal:0,amount_total:0,includes_base_book:false,metadata:{qa_fixture:'copy_failure',stripe_mode:'test'}}).select('id').single());
 await ok(admin.rpc('bind_book_completion_order',{input_candidate_id:f.candidate,input_order_id:order.id}));
 await ok(admin.from('commerce_orders').update({status:'zero_paid'}).eq('id',order.id));
 const done=()=>ok(admin.rpc('complete_book_order',{input_order_id:order.id}));
 if(parallel)await Promise.all([done(),done()]);else await done();
 const {c,p}=await state(f);assert.equal(c.state,'completed');assert.equal(p.status,'published');
 const shelf=await ok(user.rpc('list_completed_web_book_library'));
 assert.equal(shelf.filter(x=>x.book_project_id===f.project).length,1);
 const paths=await verifyFiles(f);
 const retry=await invoke(f);assert.equal(retry.status,200);assert.equal(retry.body.publicId,p.public_id);assert.equal(retry.ctx.copyAttempts,0);
 assert.deepEqual(await verifyFiles(f),paths);
 return {oneCompleted:true,oneUrl:true,oneShelf:true,immutableAssets:paths.length,completedRetry:true};
}
try{
 await ok(admin.from('book_completion_rollout').update({enabled:true}).eq('singleton',true));
 for(const mode of ['third_copy','after_commit_error','after_commit_throw']){
  const f=await seed(mode);const failed=await invoke(f,mode);assert.equal(failed.status,500);
  const before=await state(f);assert.equal(before.c.state,'prepared');assert.equal(before.p.status,'draft');
  if(mode==='third_copy')assert.equal(before.c.media_ready_at,null);else {assert.ok(before.c.media_ready_at);await verifyFiles(f);}
  const retry=await invoke(f);assert.equal(retry.status,200,JSON.stringify(retry.body));
  assert.equal(retry.ctx.copyAttempts,mode==='third_copy'?2:0);
  results.push({case:mode,failedClosed:true,retryCopies:retry.ctx.copyAttempts,...await completeFixture(f)});
  console.log(JSON.stringify(results.at(-1)));
 }
 {
  const f=await seed('concurrent');const publicationBarrier=barrier(2),copyBarrier=barrier(2);
  const runs=await Promise.all([invoke(f,'normal',{publicationBarrier,copyBarrier}),invoke(f,'normal',{publicationBarrier,copyBarrier})]);
  for(const r of runs)assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(runs[0].body.publicId,runs[1].body.publicId);
  const paths=await verifyFiles(f);assert.equal(new Set(paths).size,4);
  const {p}=await state(f);
  for(const bucket of ['audio','photos']){
   const objects=await ok(admin.storage.from(bucket).list(`published/${p.id}/revisions/${f.candidate}/001`));
   assert.equal(objects.filter(x=>x.id).length,bucket==='audio'?3:1);
  }
  results.push({case:'concurrent',bothRequestsSucceeded:true,copyRaceVerified:true,...await completeFixture(f,true)});
  console.log(JSON.stringify(results.at(-1)));
 }
 {
  const f=await seed('mismatch');const failed=await invoke(f,'unexpected_content');assert.equal(failed.status,500);assert.match(failed.body.error,/mismatch/);
  const {c,p}=await state(f);assert.equal(c.media_ready_at,null);assert.equal(c.state,'prepared');assert.equal(p.status,'draft');
  const retry=await invoke(f);assert.equal(retry.status,500);assert.equal(retry.ctx.copyAttempts,0);
  const asset=failed.ctx.corrupt,data=await ok(admin.storage.from(asset.bucket).download(asset.path));
  assert.equal(hash(Buffer.from(await data.arrayBuffer())),asset.sha256);
  const shelf=await ok(user.rpc('list_completed_web_book_library'));assert.equal(shelf.filter(x=>x.book_project_id===f.project).length,0);
  results.push({case:'same_size_wrong_content',rejected:true,notOverwritten:true,notCompleted:true,retryFailClosed:true});console.log(JSON.stringify(results.at(-1)));
 }
 assert.equal(removals,0);
 fs.writeFileSync('output/web-book-e2e/copy-fault-results.json',JSON.stringify({at:new Date().toISOString(),testOnly:true,actualHandler:true,remoteDbStorage:true,removals,results,productionChanged:false},null,2),{mode:0o600});
}finally{
 await ok(admin.from('book_completion_rollout').update({enabled:originalGate.enabled}).eq('singleton',true));
 await user.auth.stopAutoRefresh();delete globalThis.Deno;delete globalThis.makePublicationClient;delete globalThis.publicationHandler;
}
