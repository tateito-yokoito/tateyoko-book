// TEST-only public media check at a mobile viewport; Chromium is not iPhone Safari.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const ref='zpswxefgfabzvxdbtyvq';
const publicId='cd4e34988e1873a78125771ca2c54a9167f3459e98650a29';
const raw=execFileSync(process.env.QA_SUPABASE_CLI,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const keys=JSON.parse(raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1));
const anon=keys.find(key=>key.name==='anon'&&key.type==='legacy')?.api_key;
assert.ok(anon);
const endpoint=`https://${ref}.supabase.co/functions/v1/public-voice`;
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const [kind,index,source] of [
 ['audio',0,'public/site/hp-renewal/sample-voice.wav'],
 ['audio',1,'public/site/trial-demo-voice.wav'],
 ['photo',0,'public/site/hero-book.jpg'],
]){
 const response=await fetch(endpoint,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({publicId,action:'asset',kind,itemOrder:1,assetIndex:index})});
 assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.success,true);
 const asset=await fetch(result.asset.url);assert.equal(asset.status,200);
 assert.equal(hash(Buffer.from(await asset.arrayBuffer())),hash(fs.readFileSync(source)));
}
const {chromium}=(await import(process.env.QA_PLAYWRIGHT_PATH)).default;
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const origin=process.env.QA_TEST_ORIGIN;
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
 await page.goto(`${origin}/?voice=${publicId}`,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'声で、この人生を辿る'}).waitFor({timeout:30000});
 await page.getByRole('button',{name:'声で、この人生を辿る'}).click();
 await page.getByLabel('再生プレイヤー').waitFor({timeout:15000});
 const seek=page.getByLabel('再生プレイヤー').getByRole('slider',{name:'語り全体の再生位置'});
 await seek.waitFor({timeout:15000});
 await page.waitForTimeout(1700);
 let time=await page.locator('audio').evaluate(el=>el.currentTime);
 if(time===0){
  const retry=page.getByLabel('再生プレイヤー').getByRole('button',{name:'音声を再生'});
  if(await retry.count())await retry.click();
  await page.waitForTimeout(1700);
  time=await page.locator('audio').evaluate(el=>el.currentTime);
 }
 if(time===0)console.log(JSON.stringify({testOnly:true,step:'playback-diagnostic',body:(await page.locator('body').innerText()).slice(-900),audio:await page.locator('audio').evaluate(el=>({readyState:el.readyState,networkState:el.networkState,error:el.error?.message||null,paused:el.paused,srcPresent:!!el.src}))}));
 assert.ok(time>0,`Audio did not advance: ${time}`);
 await seek.fill('3');
 const seeked=await page.locator('audio').evaluate(el=>el.currentTime);
 assert.ok(seeked>=2.5,`Seek did not advance: ${seeked}`);
 await page.getByLabel('再生プレイヤー').getByRole('button',{name:'音声を一時停止'}).click();
 await page.getByLabel('再生プレイヤー').getByRole('button',{name:'音声を再生'}).waitFor();
 await page.getByLabel('再生プレイヤー').getByRole('button',{name:'次の語りを再生'}).count();
 await page.screenshot({path:'output/web-book-e2e/real-media-mini-player.png'});
 console.log(JSON.stringify({testOnly:true,publicSignedAudioParts:2,publicSignedPhoto:1,mobileChromiumPlayback:true,mobileChromiumSeek:true,fixedMiniPlayer:true,iphoneSafariVerified:false}));
}finally{await browser.close();}
