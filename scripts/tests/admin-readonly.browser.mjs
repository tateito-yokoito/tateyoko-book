// Local Chrome + remote TEST Auth acceptance. No production write/deploy.
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const account = JSON.parse(readFileSync(process.env.QA_ADMIN_ACCOUNT_FILE,'utf8'));
const ref='zpswxefgfabzvxdbtyvq'; assert.equal(account.ref,ref);
const cli=process.env.QA_SUPABASE_CLI; assert.ok(cli);
const raw=execFileSync(cli,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const keys=JSON.parse(raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1));
const anon=keys.find(k=>k.name==='anon'&&k.type==='legacy')?.api_key;assert.ok(anon);
const auth=createClient(`https://${ref}.supabase.co`,anon,{auth:{persistSession:false}});
const login=await auth.auth.signInWithPassword({email:account.email,password:account.password});
assert.ok(!login.error && login.data.session);
const vite=spawn('npm',['run','dev','--','--host','127.0.0.1','--port','61628'],{
  cwd:process.cwd(),env:{...process.env,VITE_SUPABASE_URL:`https://${ref}.supabase.co`,VITE_SUPABASE_ANON_KEY:anon},stdio:'ignore',
});
const profile=mkdtempSync(join(tmpdir(),'tateyoko-admin-browser-'));
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless','--disable-gpu','--disable-background-networking','--no-first-run',
  '--remote-debugging-port=0','--remote-allow-origins=*',`--user-data-dir=${profile}`,
  '--window-size=390,844','about:blank',
],{stdio:'ignore'});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,limit=30000){const end=Date.now()+limit;while(Date.now()<end){try{const value=await fn();if(value)return value;}catch{}await wait(250);}throw Error('Browser timeout');}
try {
  await until(async()=>{const r=await fetch('http://127.0.0.1:61628/');return r.ok;});
  const port=await until(()=>{const text=readFileSync(join(profile,'DevToolsActivePort'),'utf8');return Number(text.split('\n')[0]);});
  const tabs=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page=tabs.find(tab=>tab.type==='page');assert.ok(page);
  const socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let seq=0;const pending=new Map();
  socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.id&&pending.has(msg.id)){const item=pending.get(msg.id);pending.delete(msg.id);msg.error?item.reject(Error(msg.error.message)):item.resolve(msg.result);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>(await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result?.value;
  await call('Page.enable');await call('Runtime.enable');
  await call('Page.navigate',{url:'http://127.0.0.1:61628/?admin=1'});
  await until(async()=>await evaluate('location.origin')==='http://127.0.0.1:61628');
  const storageKey=`sb-${ref}-auth-token`;
  const session=login.data.session;
  await evaluate(`localStorage.setItem(${JSON.stringify(storageKey)},${JSON.stringify(JSON.stringify(session))})`);
  await call('Page.reload',{ignoreCache:true});
  await until(async()=>String(await evaluate('document.body.innerText')).includes('アカウント'),45000);
  const accountTab=await evaluate(`Array.from(document.querySelectorAll('button')).map(b=>b.textContent.trim()).filter(x=>x.includes('アカウント')).slice(0,8)`);
  console.log(JSON.stringify({accountTabLabels:accountTab}));
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='アカウント')?.click()`);
  await until(async()=>await evaluate("Boolean(document.querySelector('.admin-account-table'))"),30000);
  const supporterOnlyVisible=await evaluate(`Boolean(Array.from(document.querySelectorAll('.admin-account-table tbody tr')).find(row =>
    row.cells[2]?.textContent.trim()==='0件' && Number.parseInt(row.cells[7]?.textContent,10)>0))`);
  assert.ok(supporterOnlyVisible,'TEST supporter-only account must appear in admin list');
  await evaluate(`Array.from(document.querySelectorAll('.admin-account-table tbody tr')).find(row =>
    row.cells[2]?.textContent.trim()==='0件' && Number.parseInt(row.cells[7]?.textContent,10)>0)
    ?.querySelector('.account-name-button')?.click()`);
  await until(async()=>String(await evaluate('document.body.innerText')).includes('顧客体験を見る（閲覧専用）'),30000);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('顧客体験を見る（閲覧専用）'))?.click()`);
  await until(async()=>String(await evaluate('document.body.innerText')).includes('顧客体験を見る · 閲覧専用'),30000);
  await until(async()=>String(await evaluate('document.body.innerText')).includes('縦糸横糸ブック'),30000);
  const home=String(await evaluate('document.body.innerText'));
  assert.ok(home.includes('本棚') && home.includes('縦糸横糸ブック') && home.includes('お手伝いしている物語'));
  assert.ok(!home.includes('自分の物語'));
  assert.ok(!home.includes('自分の物語を始める'));
  const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const path='/private/tmp/admin-readonly-customer-home-test.png';
  writeFileSync(path,Buffer.from(screenshot.data,'base64'));
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim().endsWith('の物語'))?.click()`);
  await until(async()=>String(await evaluate('document.body.innerText')).includes('物語づくりをお手伝い中'),30000);
  const supportHome=String(await evaluate('document.body.innerText'));
  assert.ok(supportHome.includes('語りを見る') && !supportHome.includes('本に仕上げる'));
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='語りを見る')?.click()`);
  try { await until(async()=>String(await evaluate('document.body.innerText')).includes('管理者プレビュー・閲覧専用'),30000); }
  catch(error){ throw Error(`${error.message}: ${String(await evaluate('document.body.innerText')).slice(-800)}`); }
  socket.close();
  console.log(JSON.stringify({browser:'Chrome 390px',supporterOnlyHome:true,supportDestination:true,stories:true,readOnly:true,screenshot:path,productionChanged:false}));
} finally {chrome.kill();vite.kill();}
