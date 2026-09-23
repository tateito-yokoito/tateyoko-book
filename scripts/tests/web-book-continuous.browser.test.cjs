const {chromium,webkit}=require(process.env.QA_PLAYWRIGHT_PATH);
const assert=require('node:assert/strict');
(async()=>{
 const engine=process.env.QA_WEBKIT?webkit:chromium;
 const browser=await engine.launch(process.env.QA_WEBKIT?{headless:true}:{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.QA_PREVIEW_URL;
  const playReady=()=>page.waitForFunction(()=>{const a=document.querySelector('audio');return a&&!a.paused&&a.currentTime>0&&Number.isFinite(a.duration);});
  const finishPart=async()=>{
   await playReady();
   const loads=await page.evaluate(()=>{const a=document.querySelector('audio');a.currentTime=a.duration;return window.mediaLoads;});
   return loads;
  };
  await page.goto(base);
  await page.getByRole('button',{name:'声で、この人生を辿る',exact:true}).waitFor();
  assert.equal(await page.locator('audio').count(),0,'no autoplay on entry');
  assert.equal(await page.getByText('また、この人生に逢いにくる。',{exact:true}).count(),0,'no ending copy on TOP');
  await page.getByRole('button',{name:'声で、この人生を辿る',exact:true}).click();
  await playReady();
  assert.equal(await page.locator('.wb-player-chapter').innerText(),'はじまりの声');
  await page.evaluate(()=>{window.bookAudio=document.querySelector('audio');window.mediaLoads=0;window.bookAudio.addEventListener('loadstart',()=>window.mediaLoads++);});
  await page.locator('.wb-player-title').click();
  const openingTitle=await page.locator('.wb-story h1').innerText();
  await finishPart();
  await page.waitForFunction(()=>document.querySelector('.wb-player-chapter')?.textContent==='今の私');
  await playReady();
  assert.equal(await page.locator('.wb-story h1').innerText(),openingTitle,'audio changes do not navigate reading page');
  assert.equal(await page.evaluate(()=>window.bookAudio===document.querySelector('audio')),true,'same media element across stories');
  await page.getByRole('button',{name:'音声を一時停止',exact:true}).click();
  const pausedTime=await page.locator('audio').evaluate(a=>a.currentTime);
  await page.locator('.wb-player-title').click();
  assert.match(await page.locator('.wb-story h1').innerText(),/最近/);
  assert.equal(await page.locator('audio').evaluate(a=>a.paused),true);
  assert.ok(Math.abs(await page.locator('audio').evaluate(a=>a.currentTime)-pausedTime)<.1,'reading preserves paused position');
  await page.locator('.wb-story>.wb-back').first().click();
  assert.ok(Math.abs(await page.locator('audio').evaluate(a=>a.currentTime)-pausedTime)<.1);
  await page.getByRole('button',{name:'音声を再生',exact:true}).click();await playReady();
  await page.getByRole('button',{name:'前の語りを再生',exact:true}).click();await playReady();
  assert.equal(await page.locator('.wb-player-chapter').innerText(),'はじまりの声');
  for(let i=0;i<3;i++){await page.getByRole('button',{name:'次の語りを再生',exact:true}).click();await playReady();}
  assert.match(await page.locator('.wb-player-chapter').innerText(),/^01/);
  await page.locator('.wb-player-title').click();
  const firstTitle=await page.locator('.wb-story h1').innerText();
  const before=await finishPart();
  await page.waitForFunction(n=>window.mediaLoads>n,before);await playReady();
  assert.equal(await page.locator('.wb-player').count(),0,'append stays inline without a duplicate fixed player');
  await finishPart();
  await page.waitForFunction(t=>document.querySelector('.wb-player-title')?.textContent!==t,firstTitle);await playReady();
  assert.equal(await page.locator('.wb-story h1').innerText(),firstTitle);
  // Three audio parts remain one story before advancing.
  const secondTitle=await page.locator('.wb-player-title').innerText();
  for(let i=0;i<2;i++){
   const before=await finishPart();await page.waitForFunction(n=>window.mediaLoads>n,before);await playReady();
   assert.equal(await page.locator('.wb-player-title').innerText(),secondTitle);
  }
  await finishPart();await page.waitForFunction(t=>document.querySelector('.wb-player-title')?.textContent!==t,secondTitle);await playReady();
  await page.getByRole('button',{name:'音声を一時停止',exact:true}).click();
  await page.screenshot({path:'/private/tmp/web-book-continuous-390.png',fullPage:false});
  // Read all remaining stories; same-theme and next-chapter cues share sequence.
  assert.equal(await page.locator('.wb-next-story .wb-eyebrow').innerText(),'次の語り');
  await page.locator('.wb-next-story>button').click();
  assert.equal(await page.locator('.wb-story h1').innerText(),secondTitle);
  await page.locator('.wb-next-story>button').click();
  assert.match(await page.locator('.wb-next-story .wb-eyebrow').innerText(),/次の章.*02.*学生時代/);
  assert.ok((await page.locator('.wb-next-story>button>span').first().innerText()).length>0);
  assert.equal(await page.locator('.wb-next-story').getByText('次へ',{exact:true}).count(),0);
  let count=0;
  while(await page.locator('.wb-next-story>button').count()){
   assert.equal(await page.locator('.wb-book-ending').count(),0);
   await page.locator('.wb-next-story>button').click();if(++count>20)throw Error('navigation loop');
  }
  assert.equal(await page.locator('.wb-book-ending').count(),1);
  assert.match(await page.locator('.wb-story h1').innerText(),/ここまで人生/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);
  await page.locator('.wb-player-close').click();
  await page.screenshot({path:'/private/tmp/web-book-ending-390.png',fullPage:true});
  // No ending chapter: the last available theme story is the final page.
  await page.goto(base+'?case=no-milestones');await page.locator('.wb-theme').last().click();
  await page.locator('.wb-questions .wb-title-button').last().click();
  assert.equal(await page.locator('.wb-book-ending').count(),1);
  assert.equal(await page.locator('.wb-next-story').count(),0);
  await page.locator('.wb-story>.wb-back').first().click();
  await page.getByRole('button',{name:'声で、この人生を辿る',exact:true}).click();await playReady();
  assert.equal(await page.locator('.wb-player-chapter').innerText(),'今の私');
  // Advance to final audio; it stops and does not loop, while reading stays at TOP.
  for(let i=0;i<12;i++){await page.getByRole('button',{name:'次の語りを再生',exact:true}).click();await playReady();}
  assert.equal(await page.getByRole('button',{name:'次の語りを再生',exact:true}).isDisabled(),true);
  await finishPart();await page.waitForFunction(()=>document.querySelector('audio').ended&&document.querySelector('audio').paused);
  assert.equal(await page.locator('.wb-story').count(),0);
  assert.equal(await page.locator('.wb-book-ending').count(),0);
  // A browser refusing initial autoplay must recover from the user's next click.
  const restricted=await browser.newPage({viewport:{width:390,height:844}});
  await restricted.addInitScript(()=>{
   const nativePlay=HTMLMediaElement.prototype.play;let blocked=false;
   HTMLMediaElement.prototype.play=function(){if(this.tagName==='AUDIO'&&!blocked){blocked=true;return Promise.reject(new DOMException('User gesture required','NotAllowedError'));}return nativePlay.call(this);};
  });
  await restricted.goto(base);
  await restricted.getByRole('button',{name:'声で、この人生を辿る',exact:true}).click();
  await restricted.getByRole('alert').waitFor();
  await restricted.getByRole('button',{name:'音声を再生',exact:true}).click();
  await restricted.waitForFunction(()=>{const a=document.querySelector('audio');return a&&!a.paused&&a.currentTime>0;});
  assert.equal(await restricted.getByRole('alert').count(),0);
  await restricted.close();
  assert.deepEqual(errors,[]);
  console.log('PASS book reading/listening at 390px: common sequence, single/multiple append, auto-next, same media element, pause/resume, prev/next, read without reset, chapter transition, final-only copy, no ending, final stop, no autoplay/errors/overflow');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
