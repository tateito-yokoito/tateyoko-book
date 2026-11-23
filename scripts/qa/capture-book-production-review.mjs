#!/usr/bin/env node
import {createServer} from 'node:http';
import {mkdtemp,readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import react from '@vitejs/plugin-react';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const out=path.join(root,'docs/qa/book-production-review-20261124');
const temp=await mkdtemp(path.join(tmpdir(),'book-review-'));
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/sugawarahidetoshi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let server,browser;
const scenes=[
  ['01-book-home','home'],['02-paid-opening','opening'],['03-pace','pace'],
  ['04-first-question','question'],['05-answer-review','review'],['06-answer-saved','saved'],
  ['07-book-cover','book-0'],['08-book-stories','book-1'],['09-book-pages','book-2'],
  ['10-book-options','book-3'],['11-book-order','book-4'],['12-proxy-home','proxy-home']
];
try {
  process.env.VITE_SUPABASE_URL='https://fixture.invalid';
  process.env.VITE_SUPABASE_ANON_KEY='fixture-only';
  await build({root,configFile:false,mode:'production',plugins:[react()],
    resolve:{alias:{'@supabase/supabase-js':path.join(root,'scripts/qa/family-capture-client.js')}},
    build:{outDir:path.join(temp,'dist'),emptyOutDir:true,rollupOptions:{input:path.join(root,'scripts/qa/book-production-review.html')}},logLevel:'error'});
  const dist=path.join(temp,'dist');
  server=createServer(async(req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(dist,`.${pathname==='/'?'/scripts/qa/book-production-review.html':pathname}`);
    if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
    try{const body=await readFile(file);const ext=path.extname(file);
      res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'})[ext]||'application/octet-stream');res.end(body);}
    catch{res.writeHead(404).end('Not found');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({executablePath:chrome,headless:true});
  await mkdir(out,{recursive:true});
  const results=[];
  let bookContext,bookPage;
  for(const [name,scene] of scenes){
    const isBook=scene.startsWith('book-');
    const context=isBook && bookContext ? bookContext : await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-JP',timezoneId:'Asia/Tokyo'});
    await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort('blockedbyclient'));
    const page=isBook && bookPage ? bookPage : await context.newPage();const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    if(!isBook || !bookPage)await page.goto(`${origin}/?scene=${scene}`);
    else if(scene!=='book-4')await page.getByRole('button',{name:'次へ'}).click();
    else await page.getByRole('button',{name:/5\s*注文/}).click();
    await page.locator('#root').waitFor();
    await page.waitForTimeout(450);
    const text=(await page.locator('#root').innerText()).slice(0,150);
    await page.screenshot({path:path.join(out,`${name}.png`),fullPage:true});
    results.push({scene,image:`${name}.png`,rendered:Boolean(text.trim()),errors,text});
    if(isBook){bookContext=context;bookPage=page;}
    else await context.close();
  }
  await bookContext?.close();
  if(process.env.QA_CAPTURE_PUBLIC_DEMO==='1'){
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ja-JP',timezoneId:'Asia/Tokyo'});
    const page=await context.newPage();
    await page.goto('https://www.tateito-yokoito.jp/?voice=40b0af31bf063bfd0815fc68a9b67eaaa1274ee536f25c85',{waitUntil:'domcontentloaded',timeout:30000});
    await page.getByText('架空 あおい',{exact:true}).first().waitFor();
    await page.screenshot({path:path.join(out,'13-fictional-published-webbook.png'),fullPage:true});
    results.push({scene:'published-fictional-demo',image:'13-fictional-published-webbook.png',rendered:true,errors:[],text:'公開済みの架空デモ④・本番Webブック'});
    await context.close();
  }
  await writeFile(path.join(out,'results.json'),JSON.stringify({sourceSha:sha,viewport:'390x844 @2x',method:'本番Reactコンポーネント＋架空のメモリ内データ。認証・DB・決済への接続なし。',results},null,2)+'\n');
  if(results.some(row=>!row.rendered||row.errors.length))throw Error('One or more review screens did not render cleanly');
  console.log(`Captured ${results.length} screens at ${out}`);
}finally{await browser?.close();await new Promise(resolve=>server?.close(resolve)??resolve());await rm(temp,{recursive:true,force:true});}
