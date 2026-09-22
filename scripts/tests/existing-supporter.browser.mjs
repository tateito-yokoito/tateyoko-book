// Actual remote TEST UI; synthetic actors only; no OTP/SMS or production requests.
import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const ref='zpswxefgfabzvxdbtyvq',origin='https://tateyoko-book-test.vercel.app',dir='output/existing-supporter';
const file=dir+'/state-private.json',s=JSON.parse(fs.readFileSync(file));assert.equal(s.ref,ref);assert.ok(s.adopted);
const phase=process.argv[2];assert.ok(['consent','stop'].includes(phase));
const raw=execFileSync(process.env.QA_SUPABASE_CLI,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const anon=JSON.parse(raw.slice(raw.indexOf('['))).find(k=>k.name==='anon').api_key;
const clients={};
for(const name of ['mother','daughter','viewer']){
 const a=s.actors[name];assert.ok(a.email.endsWith('@example.invalid'));
 const c=createClient(`https://${ref}.supabase.co`,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const login=await c.auth.setSession(a.session);assert.ifError(login.error);a.session=login.data.session;clients[name]=c;
}fs.writeFileSync(file,JSON.stringify(s,null,2),{mode:0o600});
const {chromium}=await import(process.env.QA_PLAYWRIGHT_PATH);
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:phase==='stop'?[
 '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${process.env.QA_AUDIO_FILE}`
]:[]});
const failures=[];
const pageFor=async name=>{
 const ctx=await browser.newContext({viewport:{width:430,height:932},serviceWorkers:'block',permissions:phase==='stop'?['microphone']:[]});
 await ctx.addInitScript(({session,key})=>{
  localStorage.setItem(key,JSON.stringify(session));
  localStorage.setItem(`ty-home-install-v1:${session.user.id}`,'done');
 },{session:s.actors[name].session,key:`sb-${ref}-auth-token`});
 await ctx.route('**/*',r=>{const u=new URL(r.request().url());return (u.origin===origin||u.hostname===`${ref}.supabase.co`)&&!u.pathname.endsWith('/auth/v1/otp')?r.continue():r.abort();});
 const page=await ctx.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>failures.push(e.message));
 page.on('response',r=>{if(r.url().includes(`${ref}.supabase.co`)&&!r.ok())failures.push({path:new URL(r.url()).pathname,status:r.status()});});return page;
};
try{
 if(phase==='consent'){
  const p=await pageFor('daughter');await p.goto(`${origin}/?app=1&family=1&family_project=${s.target.project}`);
  const pending=p.getByRole('button',{name:'制作をおまかせしてもらう　〉',exact:true});
  await pending.or(p.getByRole('button',{name:'語りを確認・編集する　〉',exact:true})).waitFor();
  if(await pending.count()){
   await pending.click();await p.getByRole('checkbox').check();
   const consentResponse=p.waitForResponse(r=>r.url().endsWith('/rpc/family_confirm_production_support'));
   await p.getByRole('button',{name:'確認して進める',exact:true}).click();assert.equal((await consentResponse).status(),200);
  }
  await p.getByRole('button',{name:'語りを確認・編集する　〉',exact:true}).waitFor();
  await p.screenshot({path:dir+'/daughter-consent.png',fullPage:true});
  const m=await pageFor('mother');await m.goto(origin+'/?app=1');
  await m.getByRole('button',{name:/これまでの語り/}).waitFor({timeout:45000});
  await m.getByRole('button',{name:/これまでの語り/}).click();
  await m.getByText('QA既存の語り。子供のころ家族と庭で遊んだ思い出です。',{exact:true}).first().waitFor();
  await m.screenshot({path:dir+'/mother-normal-entry.png',fullPage:true});
  const w=await clients.mother.rpc('family_journey',{p:s.target.project});assert.ifError(w.error);assert.equal(w.data.role,'subject');assert.ok(w.data.answers.length>=6);
  // A real Viewer keeps explicit shared viewing, not production/private access.
  assert.equal((await clients.viewer.rpc('family_creator',{p:s.target.project})).data,false);
  assert.ok((await clients.viewer.rpc('family_confirm_production_support',{p:s.target.project,supporter:s.actors.viewer.id,confirmed:true})).error);
  s.consentPass=true;console.log('PASS daughter explicit consent + mother normal email entry + old stories + Viewer rejection');
 }else{
  const m=await pageFor('mother');await m.goto(origin+'/?app=1');
  await m.getByRole('button',{name:'設定',exact:true}).click();
  const stop=m.getByRole('button',{name:'制作サポートを停止',exact:true});
  await stop.or(m.getByText('制作を任せているサポーターはいません。',{exact:true})).waitFor();
  if(await stop.count()){
   m.once('dialog',d=>d.accept());
   const response=m.waitForResponse(r=>r.url().endsWith('/rpc/family_revoke_production_support'));
   await stop.click();assert.ok((await response).ok());
  }
  await m.getByText('制作を任せているサポーターはいません。',{exact:true}).waitFor();
  await m.screenshot({path:dir+'/mother-stopped.png',fullPage:true});
  const d=clients.daughter,t=s.target;
  assert.equal((await d.rpc('family_creator',{p:t.project})).data,false);
  assert.equal((await d.rpc('family_supporter',{p:t.project})).data,false);
  for(const [rpc,args] of [
   ['family_journey',{p:t.project}],['family_confirm_production_support',{p:t.project,supporter:t.daughter,confirmed:true}],
   ['family_reserve_upload',{p:t.project,kind:'audio',extension:'mp4'}],['get_book_work',{input_project_id:t.project}]
  ])assert.ok((await d.rpc(rpc,args)).error,`Revoked supporter denied ${rpc}`);
  assert.ok((await d.rpc('family_issue_invite',{p:t.project,phone:'+819000000003'})).error,'C stays closed');
  const p=await pageFor('daughter');await p.goto(`${origin}/?app=1&family=1&family_project=${t.project}`);
  await p.getByText('接続済みの物語がありません。ご家族から届いた接続リンクを開いてください。',{exact:true}).waitFor();
  assert.equal(await p.getByRole('button',{name:'語りを確認・編集する　〉',exact:true}).count(),0);
  await p.screenshot({path:dir+'/daughter-denied.png',fullPage:true});
  await m.goto(origin+'/?app=1');await m.getByRole('button',{name:'次の問いへ',exact:true}).waitFor();
  const w=await clients.mother.rpc('family_journey',{p:t.project});assert.ifError(w.error);assert.equal(w.data.role,'subject');assert.equal(w.data.can_produce,true);
  await m.getByRole('button',{name:'次の問いへ',exact:true}).click();
  const record=m.getByRole('button',{name:'録音を始める',exact:true});
  const advance=m.getByRole('button',{name:/このまま.*進む/});
  await record.or(advance).waitFor();if(await advance.count())await advance.click();await record.waitFor();
  assert.ok(process.env.QA_AUDIO_FILE,'Synthetic audio required');
  await record.click();await m.getByRole('button',{name:'録音を終了',exact:true}).waitFor();
  await m.waitForTimeout(9500);
  await m.getByRole('button',{name:'録音を終了',exact:true}).click();
  await m.getByRole('button',{name:'この内容で進む',exact:true}).waitFor({timeout:90000});
  const saved=m.waitForResponse(r=>r.url().endsWith('/rpc/family_commit_voice'));
  await m.getByRole('button',{name:'この内容で進む',exact:true}).click();assert.equal((await saved).status(),200);
  const after=await clients.mother.rpc('family_journey',{p:t.project});assert.ifError(after.error);assert.equal(after.data.answers.length,w.data.answers.length+1);
  await m.screenshot({path:dir+'/mother-after-stop.png',fullPage:true});
  s.stopPass=true;console.log('PASS mother stops via UI; daughter workspace/upload/book/reconfirm denied; mother records and saves again; C OFF');
 }
 assert.deepEqual(failures,[]);fs.writeFileSync(file,JSON.stringify(s,null,2),{mode:0o600});
}catch(e){console.error({error:e.message,screens:await Promise.all(browser.contexts().flatMap(c=>c.pages()).map(p=>p.locator('body').innerText().catch(()=>'')))});process.exitCode=1;}
finally{await browser.close();for(const c of Object.values(clients))await c.auth.stopAutoRefresh();}
