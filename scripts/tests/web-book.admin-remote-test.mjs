// Read-only TEST-only admin customer experience smoke. Uses a newly created QA
// viewer admin and a separate newly created QA customer, never real customers.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';

const ref='zpswxefgfabzvxdbtyvq';
const supporterOnly=process.argv.includes('--supporter');
const target=supporterOnly?'e11ddc29-e4d1-4b2b-9125-3eba92d23d0b':'6809d5cd-22da-4e40-a82a-75016849a7fa';
const project='c3f1b8ec-3a16-49ca-b816-9660b835c493';
const account=JSON.parse(fs.readFileSync(process.env.QA_TEST_ACCOUNT_FILE,'utf8'));
assert.equal(account.ref,ref);
assert.equal(account.id,'f6a3009c-d0ee-4872-8823-a931545b2a5a');
const raw=execFileSync(process.env.QA_SUPABASE_CLI,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const keys=JSON.parse(raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1));
const anon=keys.find(key=>key.name==='anon'&&key.type==='legacy')?.api_key;
assert.ok(anon);
const client=createClient(`https://${ref}.supabase.co`,anon,{auth:{persistSession:false,autoRefreshToken:false}});
try{
 const {data:auth,error:authError}=await client.auth.signInWithPassword({email:account.email,password:account.password});
 assert.ifError(authError);assert.equal(auth.user.id,account.id);
 const experience=await client.rpc('get_admin_customer_experience',{input_account_id:target});
 assert.ifError(experience.error);
 assert.equal(experience.data?.target_account_id,target);
 if(supporterOnly){
   assert.equal(experience.data?.owned_projects?.length,0);
   assert.ok(experience.data?.supported_projects?.some(item=>item.book_project_id===project));
 }else assert.ok(experience.data?.owned_projects?.some(item=>item.id===project));
 assert.ok(experience.data?.bookshelf?.some(item=>item.paper_book_ordered===true));
 const stories=await client.rpc('get_admin_customer_project_stories',{input_account_id:target,input_project_id:project});
 assert.ifError(stories.error);
 assert.equal(stories.data?.project?.id,project);
 console.log(JSON.stringify({testOnly:true,adminRole:'viewer',actor:account.id,target,ownedProjects:experience.data.owned_projects.length,bookshelf:experience.data.bookshelf.length,storyProject:stories.data.project.id,productionChanged:false}));
 if(process.argv.includes('--browser')){
   const {chromium}=(await import(process.env.QA_PLAYWRIGHT_PATH)).default;
   const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
   try{
     const origin='http://127.0.0.1:5174';
     const context=await browser.newContext({viewport:{width:1280,height:850},serviceWorkers:'block'});
     await context.addInitScript(({key,session,origin})=>{if(location.origin===origin)localStorage.setItem(key,JSON.stringify(session));},
       {key:`sb-${ref}-auth-token`,session:auth.session,origin});
     await context.route('**/*',route=>{
       const url=new URL(route.request().url());
       if(url.origin!==origin&&url.hostname!==`${ref}.supabase.co`)return route.abort();
       return route.continue();
     });
     const page=await context.newPage();
     await page.goto(`${origin}/?admin=1`,{waitUntil:'domcontentloaded'});
     await page.waitForTimeout(6000);
     fs.mkdirSync('output/web-book-e2e',{recursive:true,mode:0o700});
     await page.screenshot({path:'output/web-book-e2e/admin-home.png',fullPage:true});
     console.log(JSON.stringify({testOnly:true,step:'admin-home',body:(await page.locator('body').innerText()).slice(0,4500)}));
     await page.getByRole('button',{name:'アカウント',exact:true}).click();
     await page.getByPlaceholder('氏名・メール・ID').fill(target);
     await page.getByPlaceholder('氏名・メール・ID').press('Enter');
     await page.locator('.account-name-button').first().waitFor({timeout:30000});
     await page.screenshot({path:'output/web-book-e2e/admin-account-list.png',fullPage:true});
     console.log(JSON.stringify({testOnly:true,step:'admin-account-list',body:(await page.locator('body').innerText()).slice(-2300)}));
     await page.locator('.account-name-button').first().click();
     const customerView=page.getByRole('button',{name:/顧客体験を見る/});
     await customerView.waitFor({timeout:30000});
     await page.screenshot({path:'output/web-book-e2e/admin-account-detail.png',fullPage:true});
     console.log(JSON.stringify({testOnly:true,step:'admin-account-detail',body:(await page.locator('body').innerText()).slice(-2200)}));
     await customerView.click();
     await page.getByText('顧客体験を見る · 閲覧専用',{exact:false}).waitFor({timeout:30000});
     if(supporterOnly){
       await page.getByText('お手伝いしている物語',{exact:true}).waitFor({timeout:30000});
       assert.equal(await page.getByText('自分の物語',{exact:true}).count(),0);
       await page.getByText('WebBook TESTの物語',{exact:true}).click();
       await page.getByRole('button',{name:'語りを見る',exact:true}).click();
       await page.getByText('語りを見る',{exact:true}).first().waitFor({timeout:30000});
       assert.equal(await page.getByRole('button',{name:/録音|編集|注文/}).count(),0);
       await page.screenshot({path:'output/web-book-e2e/admin-supporter-stories.png',fullPage:true});
       await page.getByRole('button',{name:'お手伝い中のホームへ戻る'}).click();
       await page.getByRole('button',{name:'自分のホームへ戻る'}).click();
     }else await page.getByText('自分の物語',{exact:true}).waitFor({timeout:30000});
     await page.screenshot({path:'output/web-book-e2e/admin-customer-home.png',fullPage:true});
     console.log(JSON.stringify({testOnly:true,step:'admin-customer-home',body:(await page.locator('body').innerText()).slice(-3400)}));
     await page.getByRole('button',{name:'私の本棚を見る',exact:true}).click();
     await page.getByText('Webブックを開く',{exact:true}).waitFor({timeout:30000});
     await page.screenshot({path:'output/web-book-e2e/admin-customer-library.png',fullPage:true});
     console.log(JSON.stringify({testOnly:true,step:'admin-customer-library',body:(await page.locator('body').innerText()).slice(-1300)}));
     await page.getByText('Webブックを開く',{exact:true}).click();
     await page.getByText('人生をたどる',{exact:true}).waitFor({timeout:30000});
     await page.screenshot({path:'output/web-book-e2e/admin-customer-web-book.png',fullPage:true});
     console.log(JSON.stringify({testOnly:true,step:'admin-customer-web-book',opened:true,body:(await page.locator('body').innerText()).slice(-750)}));
     await context.close();
   }finally{await browser.close();}
 }
}finally{await client.auth.stopAutoRefresh();}
