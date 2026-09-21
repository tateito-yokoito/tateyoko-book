// Local real application + TEST Supabase/Stripe. Synthetic QA user only.
// No OTP/SMS request is allowed; no production host is allowed.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createClient} from '@supabase/supabase-js';
const ref='zpswxefgfabzvxdbtyvq',origin='http://127.0.0.1:5195';
const [caseName,step]=process.argv.slice(2);assert.ok(['A','B'].includes(caseName));
assert.ok(['create','inspect','record','purchase','starting','main','book','edit','append','replace'].includes(step));
const dir=process.env.QA_OUTPUT_DIR||'output/production-supporter';fs.mkdirSync(dir,{recursive:true,mode:0o700});
const statePath=`${dir}/${caseName}-private.json`;
const state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath)):{ref,caseName,steps:[]};assert.equal(state.ref,ref);
const save=()=>fs.writeFileSync(statePath,JSON.stringify(state,null,2),{mode:0o600});
const authPath=process.env.QA_SESSION_FILE;assert.ok(authPath,'QA_SESSION_FILE must name an existing synthetic TEST session');
const original=JSON.parse(fs.readFileSync(authPath));
assert.equal(original.ref,ref);const actor=original.actors.family;assert.ok(actor.email.endsWith('@example.invalid'));
const raw=execFileSync(process.env.QA_SUPABASE_CLI,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const anon=JSON.parse(raw.slice(raw.indexOf('['))).find(k=>k.name==='anon').api_key;
const client=createClient(`https://${ref}.supabase.co`,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const auth=await client.auth.setSession(actor.session);assert.ifError(auth.error);actor.session=auth.data.session;
fs.writeFileSync(authPath,JSON.stringify(original,null,2),{mode:0o600});
const {chromium}=await import(process.env.QA_PLAYWRIGHT_PATH);
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:[
 '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${resolve(process.env.QA_AUDIO_FILE||`${dir}/voice.wav`)}`,
]});
const context=await browser.newContext({viewport:{width:430,height:932},serviceWorkers:'block',permissions:['microphone']});
await context.addInitScript(({key,session,origin})=>{if(location.origin===origin)localStorage.setItem(key,JSON.stringify(session));},{key:`sb-${ref}-auth-token`,session:auth.data.session,origin});
await context.route('**/*',route=>{
 const u=new URL(route.request().url());
 if(route.request().isNavigationRequest() && u.origin==='https://tateyoko-book-test.vercel.app' && u.searchParams.get('checkout')==='success')return route.fulfill({status:302,headers:{Location:origin+u.pathname+u.search}});
 if(!(u.origin===origin || u.hostname===`${ref}.supabase.co` || u.hostname==='checkout.stripe.com' || u.hostname.endsWith('.stripe.com') || u.hostname.endsWith('.stripe.network')) || u.pathname.endsWith('/auth/v1/otp'))return route.abort();
 return route.continue();
});
const page=await context.newPage();page.setDefaultTimeout(20000);
const failures=[];
page.on('dialog',d=>d.accept());
page.on('pageerror',e=>failures.push({pageError:e.message.slice(0,180)}));
page.on('response',async r=>{if(r.url().includes(`${ref}.supabase.co`)&&!r.ok()){
 const body=await r.json().catch(()=>({}));failures.push({path:new URL(r.url()).pathname,status:r.status(),code:body.code||null,message:String(body.message||body.error||'').slice(0,180)});
}});
const home=async()=>{await page.goto(`${origin}/?app=1&family=1&family_project=${state.projectId}`);await page.getByRole('button',{name:'一緒に語る',exact:true}).waitFor();};
try{
 if(step==='create'){
  assert.ok(!state.projectId,'Resume existing case');
  state.subjectName=`制作Supporter E2E-${caseName} 架空の母`;save();
  await page.goto(`${origin}/?app=1&family=1&create=1`);
  await page.getByText('ご家族の物語を始める',{exact:true}).click();
  await page.getByLabel('語る方のお名前',{exact:true}).fill(state.subjectName);
  await page.getByRole('checkbox').check();
  const response=page.waitForResponse(r=>r.url().endsWith('/rpc/family_create'));
  await page.getByRole('button',{name:'一緒に始める',exact:true}).click();
  const r=await response;assert.ok(r.ok());state.projectId=await r.json();save();
  await page.getByRole('button',{name:'語りを確認・編集する　〉',exact:true}).waitFor();
 }else{
  assert.ok(state.projectId);await home();
  if(step==='purchase'){
   const before=await client.rpc('family_journey',{p:state.projectId});assert.ifError(before.error);
   const count=before.data.questions.filter(q=>q.group==='trial_experience'&&q.answered).length;
   assert.equal(count,caseName==='A'?3:0,'Trial is optional, each case follows its own entry');
   if(!before.data.access.paid){
    await page.getByRole('button',{name:'物語の続きを贈る　〉',exact:true}).click();
    await page.getByRole('button',{name:'TESTの購入画面へ',exact:true}).click();
    await page.waitForURL('https://checkout.stripe.com/**');
    assert.ok(page.url().startsWith('https://checkout.stripe.com/c/pay/cs_test_'));
    state.checkoutUrl=page.url();save();
    await page.locator('#cardNumber').fill('4242424242424242');
    await page.locator('#cardExpiry').fill('1230');await page.locator('#cardCvc').fill('123');
    await page.locator('#billingName').fill('TEST PRODUCTION SUPPORTER');
    await page.getByRole('button',{name:/支払う|Pay/}).click();
    await page.getByText('購入状態を確認しました。',{exact:true}).waitFor({timeout:60000});
   }
  }else if(step==='record'){
   for(let i=0;i<Number(process.env.QA_RECORD_COUNT||1);i++){
   if(i)await home();
   await page.getByRole('button',{name:'一緒に語る',exact:true}).click();
   await page.getByRole('button',{name:'録音を始める',exact:true}).click();
   await page.getByRole('button',{name:'録音を終了',exact:true}).waitFor();
   await page.waitForTimeout(9500); // Synthetic speech fixture capture, not a readiness wait.
   await page.getByRole('button',{name:'録音を終了',exact:true}).click();
   const next=page.getByRole('button',{name:'この内容で進む',exact:true});await next.waitFor({timeout:90000});
   await next.click();
   await page.getByRole('button',{name:'ホームへ',exact:true}).waitFor({timeout:45000});
   }
  }else if(step==='starting'){
   await page.getByRole('button',{name:'一緒に語る',exact:true}).click();
   await page.getByRole('button',{name:'サービスの進め方を見る',exact:true}).click();
   await page.getByRole('button',{name:'はじめの会話へ',exact:true}).waitFor();
  }else if(step==='main'){
   const finish=page.getByRole('button',{name:'はじまりの章を終える',exact:true});
   if(await finish.count())await finish.click();
   else await page.getByRole('button',{name:'一緒に語る',exact:true}).click();
   await page.getByRole('button',{name:'本編をはじめる',exact:true}).click();
   await page.getByRole('button',{name:/このまま.*進む/}).click();
   await page.getByRole('button',{name:'録音を始める',exact:true}).waitFor();
   console.log((await page.locator('body').innerText()).slice(-1800));
  }else if(step==='book'){
   await page.getByRole('button',{name:'本をつくる・仕上げる　〉',exact:true}).click();
   await page.getByText('表紙',{exact:true}).first().waitFor();
   await page.getByRole('button',{name:'次へ',exact:true}).click();
   const toggle=page.locator('button[aria-pressed="false"]').last();
   if(await toggle.count())await toggle.click();
   await page.locator('button[aria-pressed="true"]').last().waitFor();
   await page.getByRole('button',{name:'次へ',exact:true}).click();
   await page.getByRole('button',{name:'次へ',exact:true}).click();
   await page.getByRole('button',{name:'次へ',exact:true}).click();
   await page.getByPlaceholder('お名前',{exact:true}).fill('架空 テスト');
   await page.getByPlaceholder('郵便番号',{exact:true}).fill('1000001');
   await page.getByPlaceholder('都道府県',{exact:true}).fill('東京都');
   await page.getByPlaceholder('市区町村',{exact:true}).fill('架空市 TEST');
   await page.getByPlaceholder('番地',{exact:true}).fill('1-1 TEST発送禁止');
   await page.getByRole('button',{name:'注文を確定',exact:true}).click();
   await page.getByText('注文を受け付けました',{exact:true}).waitFor({timeout:60000});
   console.log((await page.locator('body').innerText()).slice(-2500));
  }else if(step==='append'||step==='replace'){
   await page.getByRole('button',{name:'語りを確認・編集する　〉',exact:true}).click();
   await page.getByRole('button',{name:'文章を整える',exact:true}).last().click();
   await page.getByRole('button',{name:step==='append'?'語り足す':'語り直す',exact:true}).click();
   await page.getByRole('button',{name:'録音を終了',exact:true}).waitFor();
   await page.waitForTimeout(9500);
   await page.getByRole('button',{name:'録音を終了',exact:true}).click();
   await page.getByRole('button',{name:'この内容で進む',exact:true}).waitFor({timeout:90000});
   await page.getByRole('button',{name:'この内容で進む',exact:true}).click();
   await page.getByRole('button',{name:'文章を整える',exact:true}).last().waitFor({timeout:45000});
  }else if(step==='edit'){
   await page.getByRole('button',{name:'語りを確認・編集する　〉',exact:true}).click();
   await page.getByRole('button',{name:'文章を整える',exact:true}).last().click();
   await page.locator('textarea').fill('架空の母の語りを、了承を得た制作サポーターが整えました。幼い頃の庭で遊んだ思い出です。');
   await page.getByRole('button',{name:'保存する',exact:true}).click();
   await page.getByText('架空の母の語りを、了承を得た制作サポーターが整えました。幼い頃の庭で遊んだ思い出です。',{exact:true}).waitFor();
   await page.getByRole('button',{name:'＋ 写真を添える',exact:true}).last().click();
   await page.locator('input[type=file]').first().setInputFiles('public/pwa/icon-192.png');
   await page.getByRole('button',{name:'切り抜きを完了',exact:true}).click();
   await page.getByRole('button',{name:'この写真を使う',exact:true}).click();
   await page.getByAltText('写真 1',{exact:true}).waitFor();
   console.log((await page.locator('body').innerText()).slice(-2000));
  }
 }
 const {data:w,error}=await client.rpc('family_journey',{p:state.projectId});assert.ifError(error);
 assert.equal(w.connected,false);assert.equal(w.role,'supporter');assert.equal(w.can_produce,true);
 assert.deepEqual(failures,[], 'No failed application API requests or page errors');
 if(step==='book'||(step==='inspect'&&w.access.main_started_at)){
  const {data:work,error:workError}=await client.rpc('get_book_work',{input_project_id:state.projectId});assert.ifError(workError);
  assert.ok(work.confirmed_at);assert.ok(work.answer_ids.length);assert.ok(work.publication?.id);
  state.bookWorkId=work.id;state.publicationId=work.publication.id;
 }
 if(state.personId)assert.equal(w.person_id,state.personId);state.personId=w.person_id;
 state.steps.push({step,at:new Date().toISOString(),answers:w.answers.length,paid:w.access.paid,mainStarted:!!w.access.main_started_at});save();
 await page.screenshot({path:`${dir}/${caseName}-${step}.png`,fullPage:true});
 console.log(JSON.stringify({caseName,step,projectId:state.projectId,personId:state.personId,answers:w.answers.length,paid:w.access.paid,mainStarted:!!w.access.main_started_at,failures,smsSent:false,productionChanged:false}));
}catch(e){
 await page.screenshot({path:`${dir}/${caseName}-failure.png`,fullPage:true}).catch(()=>{});
 console.error(JSON.stringify({caseName,step,error:e.message.slice(0,700),failures,screen:(await page.locator('body').innerText().catch(()=>'' )).slice(-2400)}));process.exitCode=1;
}finally{await browser.close();await client.auth.stopAutoRefresh();}
