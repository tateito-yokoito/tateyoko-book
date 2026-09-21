// Synthetic existing self account. Read-only UI smoke, no payment or SMS.
import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const ref='zpswxefgfabzvxdbtyvq',origin='http://127.0.0.1:5195';
const file=process.env.QA_SESSION_FILE;assert.ok(file);
const original=JSON.parse(fs.readFileSync(file));assert.equal(original.ref,ref);
const actor=original.actors.self;assert.ok(actor.email.endsWith('@example.invalid'));
const raw=execFileSync(process.env.QA_SUPABASE_CLI,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const anon=JSON.parse(raw.slice(raw.indexOf('['))).find(k=>k.name==='anon').api_key;
const client=createClient(`https://${ref}.supabase.co`,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const {data,error}=await client.auth.setSession(actor.session);assert.ifError(error);actor.session=data.session;
fs.writeFileSync(file,JSON.stringify(original,null,2),{mode:0o600});
const {chromium}=await import(process.env.QA_PLAYWRIGHT_PATH);
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const context=await browser.newContext({viewport:{width:430,height:932},serviceWorkers:'block'});
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${ref}-auth-token`,session:data.session});
 await context.route('**/*',r=>{const u=new URL(r.request().url());return (u.origin===origin||u.hostname===`${ref}.supabase.co`)&&!u.pathname.endsWith('/auth/v1/otp')?r.continue():r.abort();});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/?app=1');
 // A new browser has not dismissed the existing self onboarding yet.
 await page.getByRole('button',{name:'サービスの進め方を見る',exact:true}).waitFor({timeout:45000});
 await page.getByRole('button',{name:'サービスの進め方を見る',exact:true}).click();
 await page.getByRole('button',{name:/はじめの会話へ|次へ/}).first().waitFor();
 const text=await page.locator('body').innerText();assert.ok(!text.includes('この物語を開けませんでした'));assert.deepEqual(errors,[]);
 fs.mkdirSync('output/production-supporter',{recursive:true});await page.screenshot({path:'output/production-supporter/self-smoke.png',fullPage:true});
 console.log(JSON.stringify({selfSmoke:true,pageText:text.slice(0,1800),pageErrors:errors,smsSent:false,productionChanged:false}));
}catch(e){console.error({error:e.message,screen:await browser.contexts()[0]?.pages()[0]?.locator('body').innerText()});process.exitCode=1;}
finally{await browser.close();await client.auth.stopAutoRefresh();}
