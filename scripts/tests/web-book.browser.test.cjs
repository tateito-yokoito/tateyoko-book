const {chromium}=require(process.env.QA_PLAYWRIGHT_PATH);
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.QA_PREVIEW_URL;
 await page.goto(base);await page.getByRole('heading',{name:'今の私'}).waitFor();
 assert.equal(await page.locator('.wb-cover-photo').count(),1);
 assert.equal(await page.locator('.wb-theme').count(),9);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);
 await page.getByRole('button',{name:'名前の声を聴く'}).click();
 await page.waitForFunction(()=>document.querySelector('audio')?.currentTime>0);
 assert.equal(new URL(page.url()).pathname,'/');
 await page.locator('.wb-player-close').click();
 await page.locator('.wb-theme').first().click();
 await page.locator('.wb-questions .wb-play').first().click();
 await page.waitForFunction(()=>document.querySelector('audio')?.currentTime>0);
 await page.locator('.wb-player-close').click();
 await page.locator('.wb-questions .wb-title-button').first().click();
 await page.locator('.wb-story').waitFor();
 assert.equal(await page.getByText('この話には、続きがあります。').count(),0);
 assert.equal(await page.getByRole('button',{name:'追加の声を聴く'}).count(),0);
 assert.equal(await page.locator('.wb-story figure').count(),1);
 await page.getByRole('button',{name:'音声を再生',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('audio')?.currentTime>0);
 assert.equal(await page.locator('audio').count(),1);
 assert.equal(await page.locator('.wb-prose').count(),1);
 // Trigger the same ended event used by actual playback without waiting for a long recording.
 await page.evaluate(()=>{const audio=document.querySelector('audio');window.queueLoads=0;audio.addEventListener('loadstart',()=>window.queueLoads++);audio.currentTime=audio.duration;});
 await page.waitForFunction(()=>window.queueLoads>=1&&document.querySelector('audio')?.currentTime>0);
 assert.equal(await page.locator('audio').count(),1);
 assert.equal(await page.locator('.wb-compact-controls input').count(),1);
 await page.getByRole('button',{name:'音声を一時停止'}).click();
 assert.equal(await page.locator('audio').evaluate(el=>el.paused),true);
 await page.getByRole('button',{name:'音声を再生',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('audio').paused);
 // A full-story seek can cross file boundaries in either direction.
 await page.locator('.wb-compact-controls input').focus();
 await page.locator('.wb-compact-controls input').evaluate(el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'0');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.waitForFunction(()=>window.queueLoads>=2&&!document.querySelector('audio').paused);
 await page.screenshot({path:'/private/tmp/web-book-story-390.png',fullPage:true});
 for(const variant of ['no-photo','no-milestones','minimal']){
  await page.goto(base+'?case='+variant);await page.locator('.wb-cover').waitFor();
  assert.equal(await page.locator('.wb-cover-photo').count(),0);
  if(variant!=='no-photo')assert.equal(await page.locator('.wb-milestone').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);
  assert.equal(/未回答|準備中|写真を登録|まだありません/.test(await page.locator('.wb').innerText()),false);
  await page.screenshot({path:'/private/tmp/web-book-'+variant+'-390.png',fullPage:true});
 }
 await page.goto(base+'?case=video');
 await page.getByRole('button',{name:'はじまりを見る',exact:true}).first().waitFor();
 await page.getByRole('button',{name:'はじまりを見る',exact:true}).first().click();
 await page.waitForFunction(()=>document.querySelector('video')?.currentTime>0);
 await page.locator('.wb-story>.wb-back').first().click();
 await page.getByRole('button',{name:'はじまりを見る',exact:true}).last().click();
 assert.equal(await page.locator('.wb-continuation').count(),0);
 await page.screenshot({path:'/private/tmp/web-book-video-390.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS 390px: no overflow; name inline playback; theme + play = 2 clicks; unified audio queue/pause/resume/cross-part seek; single finished text; photo/optional/media omissions; no JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
