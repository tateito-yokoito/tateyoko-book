// Explicit Stripe TEST card payment, isolated QA order only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const checkout=JSON.parse(fs.readFileSync('output/web-book-e2e/source-guard-stripe-checkout.json','utf8'));
assert.equal(checkout.ref,'zpswxefgfabzvxdbtyvq');
assert.match(checkout.url,/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/);
const {chromium}=(await import(process.env.QA_PLAYWRIGHT_PATH)).default;
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(checkout.url,{waitUntil:'domcontentloaded',timeout:90000});
 await page.locator('#cardNumber').fill('4242424242424242');
 await page.locator('#cardExpiry').fill('1230');
 await page.locator('#cardCvc').fill('123');
 await page.locator('#billingName').fill('WEB BOOK GUARD TEST');
 await page.getByRole('button',{name:/支払う|Pay/}).click();
 await page.waitForURL(value=>new URL(value).searchParams.get('checkout')==='success',{timeout:90000});
 console.log(JSON.stringify({testOnly:true,stripeTestPaid:true,successRedirect:true,productionChanged:false}));
}finally{await browser.close();}
