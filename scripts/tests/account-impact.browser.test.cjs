// QA_PLAYWRIGHT_PATH and QA_CHROME_PATH can point to the desktop bundled runtime.
const {chromium} = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const {build} = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
(async()=>{
 const temp = fs.mkdtempSync(path.join(os.tmpdir(),'account-impact-qa-'));
 await build({entryPoints:[path.join(__dirname,'account-impact.fixture.jsx')],bundle:true,jsx:'automatic',outfile:path.join(temp,'fixture.js'),plugins:[{name:'stub-book-preview',setup(b){b.onResolve({filter:/^\.\.\/App\.jsx$/},()=>({path:'app',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const Scene_BookBuilder = () => null; export const Scene_SupportedStoryPages = () => null;'}));}}]});
 const cssPath = fs.readdirSync('dist/assets').find(n=>n.endsWith('.css'));
 const server = http.createServer((req,res)=>{
  if(req.url==='/fixture.js'){res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync(path.join(temp,'fixture.js')));}
  else if(req.url==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end(fs.readFileSync(path.join('dist/assets',cssPath)));}
  else{res.setHeader('Content-Type','text/html');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>');}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.QA_CHROME_PATH,headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button',{name:'アカウント',exact:true}).click();
  const row=page.getByRole('row').filter({has:page.getByRole('button',{name:/確認用アカウント/})});
  await row.waitFor();
  const cells=row.getByRole('cell');
  assert.equal(await cells.nth(1).innerText(),'3件');
  assert.equal(await cells.nth(2).innerText(),'12件');
  assert.equal(await cells.nth(3).innerText(),'6本');
  assert.equal(await cells.nth(4).innerText(),'3本');
  assert.match(await row.innerText(),/ほか1件/);
  assert.equal(await cells.nth(8).innerText(),'1件');
  for (const width of [1440, 1100, 768, 390]) {
    await page.setViewportSize({width,height:900});
    assert.ok((await row.boundingBox()).height <= 64, `Compact row at ${width}px`);
    const scroller=page.getByRole('region',{name:'アカウント一覧（横スクロール）'});
    assert.ok(await scroller.evaluate(e=>e.scrollWidth>e.clientWidth), 'Horizontal overflow is contained');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const nameCell=row.getByRole('rowheader');
    const before=(await nameCell.boundingBox()).x;
    await scroller.evaluate(e=>e.scrollLeft=e.scrollWidth);
    assert.ok(Math.abs((await nameCell.boundingBox()).x-before)<2, 'Account identity remains pinned');
    await page.screenshot({path:path.join(temp,`list-${width}-scrolled.png`),fullPage:true});
    await scroller.evaluate(e=>e.scrollLeft=0);
    await page.screenshot({path:path.join(temp,`list-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1050});
  await page.screenshot({path:path.join(temp,'list-desktop.png'),fullPage:true});
  await row.getByRole('button').focus();
  await page.keyboard.press('Enter');
  await page.getByRole('heading',{name:'停止した場合の影響'}).waitFor();
  assert.equal(await page.locator('aside').getByRole('button',{name:/所有する物語A/}).count(),1);
  await page.getByRole('button',{name:'停止前の確認へ'}).click();
  const dialog=page.getByRole('dialog'); await dialog.waitFor();
  assert.match(await dialog.innerText(),/自動では非公開になりません/);
  assert.equal(await page.evaluate(()=>window.retireCalls),0);
  // A changed snapshot must require another confirmation, not retire.
  await page.evaluate(()=>window.impacts['account-1'].projects[0].answer_count=5);
  await dialog.getByRole('button',{name:'停止してメールを解放する'}).click();
  await dialog.getByRole('alert').filter({hasText:'変更されました'}).waitFor();
  assert.equal(await page.evaluate(()=>window.retireCalls),0);
  assert.match(await dialog.innerText(),/語り 13件/);
  // Failed re-check is fail-closed.
  await page.evaluate(()=>window.failImpact=true);
  await dialog.getByRole('button',{name:'停止してメールを解放する'}).click();
  await dialog.getByRole('alert').filter({hasText:'取得できませんでした'}).waitFor();
  assert.equal(await page.evaluate(()=>window.retireCalls),0);
  await page.evaluate(()=>window.failImpact=false);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(temp,'confirm-mobile.png'),fullPage:true});
  await dialog.getByRole('button',{name:'キャンセル'}).click();
  await page.reload();
  await page.getByRole('button',{name:'アカウント',exact:true}).click();
  await page.getByRole('button',{name:/管理者 example0/}).click();
  const protectedButton=page.getByRole('button',{name:'管理者アカウントは停止できません'});
  await protectedButton.waitFor(); assert.equal(await protectedButton.isDisabled(),true);
  assert.equal(await page.evaluate(()=>window.retireCalls),0);
  assert.deepEqual(errors,[]);
  console.log(`PASS browser: compact rows at 1440/1100/768/390px, contained horizontal scrolling, sticky account names, keyboard opening, list totals, detail, refreshed confirmation, fail-closed error, cancellation, admin disabled. Screenshots: ${temp}`);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
