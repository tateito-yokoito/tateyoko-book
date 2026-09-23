// Remote TEST-only browser harness for the isolated Web-book completion account.
// Credentials are read from a private temp file and never logged.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const ref = 'zpswxefgfabzvxdbtyvq';
const origin = 'http://127.0.0.1:5173';
const step = process.argv[2] || 'inspect';
assert.ok(['bootstrap','inspect','open-book','selection','options','order','checkout-open','cancel','pay','library','decline'].includes(step));
const account = JSON.parse(fs.readFileSync(process.env.QA_TEST_ACCOUNT_FILE, 'utf8'));
assert.equal(account.ref, ref);
assert.ok(account.email.startsWith('webbook-e2e-') && account.email.endsWith('@example.com'));
const raw = execFileSync(process.env.QA_SUPABASE_CLI, ['projects', 'api-keys', '--project-ref', ref, '--output', 'json'], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
});
const keys = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
const anon = keys.find(key => key.name === 'anon' && key.type === 'legacy')?.api_key;
assert.ok(anon);
const client = createClient(`https://${ref}.supabase.co`, anon, {auth:{persistSession:false,autoRefreshToken:false}});
const {data:auth,error:authError} = await client.auth.signInWithPassword({email:account.email,password:account.password});
assert.ifError(authError);
assert.equal(auth.user.id, account.id);
const {chromium} = (await import(process.env.QA_PLAYWRIGHT_PATH)).default;
const browser = await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
await context.addInitScript(({key,session,origin}) => {
  if (location.origin === origin) localStorage.setItem(key, JSON.stringify(session));
}, {key:`sb-${ref}-auth-token`,session:auth.session,origin});
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (route.request().isNavigationRequest() && url.origin === 'https://tateyoko-book-test.vercel.app' && url.searchParams.get('checkout') === 'success') {
    return route.fulfill({status:302,headers:{Location:origin+url.pathname+url.search}});
  }
  if (url.origin !== origin && url.hostname !== `${ref}.supabase.co` && !url.hostname.endsWith('.stripe.com') && !url.hostname.endsWith('.stripe.network')) return route.abort();
  if (url.pathname.endsWith('/auth/v1/otp')) return route.abort();
  return route.continue();
});
const page = await context.newPage();
const errors = [];
page.on('dialog', dialog => dialog.accept());
page.on('pageerror', error => errors.push(error.message.slice(0,180)));
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text().slice(0,220)}`); });
page.on('response', async response => {
  if (response.url().includes(`${ref}.supabase.co`) && !response.ok()) {
    const body = await response.json().catch(() => ({}));
    errors.push(`${new URL(response.url()).pathname}: ${response.status()} ${String(body.message || body.error || '').slice(0,120)}`);
  }
});
try {
  await page.goto(step==='library' ? `${origin}/?library=1` : `${origin}/?app=1&entry=login`, {waitUntil:'domcontentloaded'});
  if(step==='bootstrap') await page.waitForTimeout(7000);
  else if(step==='library') await page.getByText('Webブックを開く',{exact:true}).waitFor({timeout:60000});
  else await page.getByText('縦糸横糸ブック', {exact:true}).waitFor({timeout:60000});
  if (!['bootstrap','inspect','library'].includes(step)) {
    await page.getByText('本に仕上げる', {exact:true}).click();
    if (step === 'cancel') {
      const cancel = page.getByRole('button',{name:'注文手続きを取りやめて編集へ戻る',exact:true});
      await cancel.waitFor({timeout:60000});
      await cancel.click();
      await page.getByText('表紙写真（任意）',{exact:true}).waitFor({timeout:60000});
    } else {
    await page.getByText('表紙写真（任意）', {exact:true}).waitFor();
    if (step !== 'open-book') await page.getByRole('button',{name:'次へ',exact:true}).click();
    if (['options','order','checkout-open','pay','decline'].includes(step)) {
      const select = page.getByRole('button',{name:'収録する',exact:true});
      if (await select.count()) await select.click();
      if (['order','checkout-open','pay','decline'].includes(step)) await page.getByRole('button',{name:'次へ',exact:true}).click();
      await page.getByRole('button',{name:'次へ',exact:true}).click();
      if (['checkout-open','pay','decline'].includes(step)) {
        await page.getByRole('combobox',{name:'スタンダード冊子の増刷冊数'}).selectOption('1');
        await page.getByText('5,000円', {exact:true}).first().waitFor();
      }
      await page.getByRole('button',{name:'次へ',exact:true}).click();
      if (['checkout-open','pay','decline'].includes(step)) {
        await page.getByPlaceholder('お名前',{exact:true}).fill('架空 テスト');
        await page.getByPlaceholder('郵便番号',{exact:true}).fill('1000001');
        await page.getByPlaceholder('都道府県',{exact:true}).fill('東京都');
        await page.getByPlaceholder('市区町村',{exact:true}).fill('架空市 TEST');
        await page.getByPlaceholder('番地',{exact:true}).fill('1-1 TEST発送禁止');
        assert.match(await page.locator('body').innerText(), /5,000円/);
        const popupPromise = context.waitForEvent('page',{timeout:30000}).catch(error => error);
        await page.getByRole('button',{name:/購入手続きへ|注文を確定/}).click();
        const popup = await popupPromise;
        if (popup instanceof Error) throw popup;
        await popup.waitForURL(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/, {timeout:90000});
        fs.writeFileSync('output/web-book-e2e/checkout-test-url.json',JSON.stringify({url:popup.url(),testOnly:true}),{mode:0o600});
        console.log(JSON.stringify({testOnly:true,step:'checkout-created',stripeTestSession:true,accountId:account.id,mainBody:(await page.locator('body').innerText()).slice(-1800),errors}));
        if (step === 'pay') {
          await popup.locator('#cardNumber').fill('4242424242424242');
          await popup.locator('#cardExpiry').fill('1230');
          await popup.locator('#cardCvc').fill('123');
          await popup.locator('#billingName').fill('WEB BOOK TEST');
          await popup.getByRole('button',{name:/支払う|Pay/}).click();
          await popup.waitForURL(url => url.origin === origin && url.searchParams.get('checkout') === 'success',{timeout:90000});
          await popup.waitForTimeout(10000);
          await popup.screenshot({path:'output/web-book-e2e/paid-return.png',fullPage:true});
          console.log(JSON.stringify({testOnly:true,step:'paid-return',url:popup.url(),body:(await popup.locator('body').innerText()).slice(-2600),errors}));
        }
        if (step === 'decline') {
          await popup.locator('#cardNumber').fill('4000000000000002');
          await popup.locator('#cardExpiry').fill('1230');
          await popup.locator('#cardCvc').fill('123');
          await popup.locator('#billingName').fill('WEB BOOK TEST DECLINED');
          await popup.getByRole('button',{name:/支払う|Pay/}).click();
          await popup.waitForTimeout(6000);
          const checkoutBody=await popup.locator('body').innerText();
          assert.ok(/declined|拒否|承認されません|お支払い.*失敗|カード.*使えません/i.test(checkoutBody),checkoutBody.slice(-1200));
          assert.ok(popup.url().startsWith('https://checkout.stripe.com/c/pay/cs_test_'));
          await popup.screenshot({path:'output/web-book-e2e/declined.png',fullPage:true});
          console.log(JSON.stringify({testOnly:true,step:'declined',stillOnTestCheckout:true,body:checkoutBody.slice(-1200)}));
        }
      }
    }
    }
    await page.waitForTimeout(1000);
  }
  const storage = await page.evaluate(key => ({present:!!localStorage.getItem(key),length:localStorage.getItem(key)?.length||0}), `sb-${ref}-auth-token`);
  fs.mkdirSync('output/web-book-e2e', {recursive:true,mode:0o700});
  await page.screenshot({path:`output/web-book-e2e/${step}.png`,fullPage:true});
  console.log(JSON.stringify({testOnly:true,step,accountId:account.id,url:page.url(),storage,body:(await page.locator('body').innerText()).slice(0,5000),errors}));
  if(step==='library') {
    const href = await page.locator('a.voice-book-cover').first().getAttribute('href');
    assert.ok(href?.startsWith('/?voice='));
    const anonymous = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
    await anonymous.route('**/*',route => {
      const url = new URL(route.request().url());
      if(url.origin!==origin && url.hostname!==`${ref}.supabase.co`) return route.abort();
      return route.continue();
    });
    const viewer = await anonymous.newPage();
    await viewer.goto(origin+href,{waitUntil:'domcontentloaded'});
    await viewer.waitForTimeout(7000);
    await viewer.screenshot({path:'output/web-book-e2e/public-web-book.png',fullPage:true});
    const publicBody=await viewer.locator('body').innerText();
    assert.ok(!/公開前|見つかりません|エラー|閲覧できません/.test(publicBody),publicBody.slice(0,400));
    console.log(JSON.stringify({testOnly:true,step:'anonymous-web-book',opened:true,body:publicBody.slice(0,2500)}));
    await anonymous.close();
  }
} catch(error) {
  fs.mkdirSync('output/web-book-e2e', {recursive:true,mode:0o700});
  await page.screenshot({path:'output/web-book-e2e/failure.png',fullPage:true}).catch(()=>{});
  console.error(JSON.stringify({testOnly:true,step,error:String(error.message).slice(0,500),body:(await page.locator('body').innerText().catch(()=>'' )).slice(-3000),errors}));
  process.exitCode=1;
} finally {
  await browser.close();
  await client.auth.stopAutoRefresh();
}
