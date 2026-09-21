// Negative acceptance against TEST only; never changes rollout or sends SMS.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const ref='zpswxefgfabzvxdbtyvq',url=`https://${ref}.supabase.co`,origin='https://tateyoko-book-test.vercel.app';
const dir=process.env.QA_OUTPUT_DIR,path=process.env.QA_SESSION_FILE;assert.ok(dir&&path);
const state=JSON.parse(fs.readFileSync(`${dir}/A-private.json`));assert.equal(state.ref,ref);
const sessions=JSON.parse(fs.readFileSync(path));assert.equal(sessions.ref,ref);
const raw=execFileSync(process.env.QA_SUPABASE_CLI,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const key=JSON.parse(raw.slice(raw.indexOf('['))).find(k=>k.name==='anon').api_key;
const client=()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const anonymous=client();assert.ok((await anonymous.rpc('family_journey',{p:state.projectId})).error);
for(const name of ['family','foreign']){
 const actor=sessions.actors[name];assert.ok(actor.email.endsWith('@example.invalid'));
 const c=client(),auth=await c.auth.setSession(actor.session);assert.ifError(auth.error);actor.session=auth.data.session;
 fs.writeFileSync(path,JSON.stringify(sessions,null,2),{mode:0o600});
 if(name==='family'){
  assert.ok((await c.rpc('family_journey',{p:state.projectId})).data.can_produce);
  assert.ok((await c.rpc('family_issue_invite',{p:state.projectId,phone:'+819000000003'})).error,'C OFF refuses direct invite RPC');
  assert.ok((await c.rpc('family_claim_invite',{token:'a'.repeat(64),consent:true})).error);
 }else{
  assert.equal((await c.rpc('family_release_actor_allowed',{p:state.projectId})).data,false);
  assert.ok((await c.rpc('family_journey',{p:state.projectId})).error);
  assert.ok((await c.rpc('family_confirm_production_support',{p:state.projectId,supporter:actor.id,confirmed:true})).error);
  const checkout=await c.functions.invoke('create-checkout-session',{body:{orderType:'self',projectId:state.projectId,returnContext:'family',expectedPolicyVersion:'2.0',expectedAmount:49800}});
  assert.ok(checkout.error||checkout.data?.success===false,'Outside allowlist cannot create checkout');
  const answers=await c.from('answers').select('id').eq('book_project_id',state.projectId);assert.ifError(answers.error);assert.equal(answers.data.length,0);
 }
 await c.auth.stopAutoRefresh();
}
const {chromium}=await import(process.env.QA_PLAYWRIGHT_PATH);
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const ctx=await browser.newContext({serviceWorkers:'block'});let authCalls=0;
 await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.pathname.includes('/auth/v1/otp')){authCalls++;return r.abort();}return u.origin===origin||u.origin===url?r.continue():r.abort();});
 const p=await ctx.newPage();await p.goto(origin+'/?app=1&family_connect=1#connect='+'a'.repeat(64));
 await p.getByText('ご本人のスマホ接続は、現在ご案内していません。',{exact:true}).waitFor();
 assert.equal(await p.locator('input[type=tel]').count(),0);assert.equal(authCalls,0);
 await p.screenshot({path:`${dir}/C-disabled.png`});
}finally{await browser.close();}
console.log('PASS remote TEST: anonymous/outside allowlist/other Person denied; production owner retained; C UI and issue/claim RPC closed; no SMS');
