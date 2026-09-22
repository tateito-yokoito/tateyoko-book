// Public, non-mutating smoke. Never logs in, records, sends OTP or purchases.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
const mode=process.argv[2];assert.ok(['before','candidate','after'].includes(mode));
const dir='output/closed-production-release';fs.mkdirSync(dir,{recursive:true});
let server;const root=path.resolve('output/closed-production-stage');
if(mode==='candidate'){
 server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+'/')&&p!==root){res.writeHead(403).end();return;}
 const f=p===root?path.join(root,'index.html'):p;if(!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'})[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(res);});await new Promise(r=>server.listen(5198,'127.0.0.1',r));
}
const origin=mode==='candidate'?'http://127.0.0.1:5198':'https://www.tateito-yokoito.jp';
const {chromium}=await import(process.env.QA_PLAYWRIGHT_PATH);
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const ctx=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});const errors=[],blockedWrites=[],testRequests=[];
 await ctx.route('**/*',r=>{const req=r.request(),u=new URL(req.url());if(u.hostname.includes('zpswxefgfabzvxdbtyvq'))testRequests.push(u.pathname);if(!['GET','HEAD','OPTIONS'].includes(req.method())){blockedWrites.push(u.pathname);return r.abort();}return r.continue();});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin,{waitUntil:'networkidle'});const home=await page.locator('body').innerText();
 const cta=await page.locator('a,button').evaluateAll(es=>es.map(e=>({text:e.textContent.trim(),href:e.getAttribute('href')})));
 await page.screenshot({path:`${dir}/${mode}-home.png`,fullPage:true});
 await page.goto(origin+'/?app=1',{waitUntil:'networkidle'});await page.locator('button').first().waitFor({timeout:20000});
 const login=await page.locator('body').innerText();await page.screenshot({path:`${dir}/${mode}-login.png`,fullPage:true});
 await page.goto(origin+'/?app=1&entry=purchase',{waitUntil:'networkidle'});const purchase=await page.locator('body').innerText();
 await page.screenshot({path:`${dir}/${mode}-purchase-entry.png`,fullPage:true});
 assert.ok(!home.includes('TEST専用'));assert.equal(testRequests.length,0);assert.deepEqual(errors,[]);assert.deepEqual(blockedWrites,[]);
 const report={at:new Date().toISOString(),mode,origin,home,cta,login,purchase,errors,testRequests,blockedWrites,authenticated:false,payment:false};
 if(mode!=='before'){
  const before=JSON.parse(fs.readFileSync(`${dir}/before-browser.json`));assert.deepEqual(cta,before.cta,'HP CTA must not change');assert.equal(home,before.home,'HP content must not change');
  assert.equal(login,before.login,'Existing login must not change');assert.equal(purchase,before.purchase,'Non-family purchase entry must not change');
 }
 if(mode==='after'){
  await page.getByRole('button',{name:'前回の続きを開く',exact:true}).click();await page.locator('input[type=email]').waitFor();
  report.emailLoginFormVisible=true;await page.screenshot({path:`${dir}/after-email-login.png`,fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(blockedWrites,[]);
 }
 fs.writeFileSync(`${dir}/${mode}-browser.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({mode,pass:true,HPUnchanged:mode!=='before',loginAndPurchaseEntryUnchanged:mode!=='before',authenticated:false,testRequests:0,writes:0}));
}finally{await browser.close();if(server)await new Promise(r=>server.close(r));}
