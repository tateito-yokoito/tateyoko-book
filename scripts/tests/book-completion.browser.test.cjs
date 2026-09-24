const {chromium}=require(process.env.QA_PLAYWRIGHT_PATH||'playwright');
const {build}=require('esbuild'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'completion-ui-'));
 await build({entryPoints:['scripts/tests/book-completion.fixture.jsx'],bundle:true,jsx:'automatic',outfile:path.join(tmp,'fixture.js'),define:{'import.meta.env':'{"VITE_BOOK_COMPLETION_ENABLED":"true"}'},plugins:[{name:'mock',setup(b){
  b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'client',namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const createClient=()=>window.mockClient;'}));
 }}]});
 const css=fs.readdirSync('dist/assets').find(n=>n.startsWith('index-')&&n.endsWith('.css'));
 const server=http.createServer((req,res)=>{
  const js=req.url==='/fixture.js',style=req.url==='/fixture.css';
  res.setHeader('Content-Type',js?'text/javascript':style?'text/css':'text/html');
  res.end(js?fs.readFileSync(path.join(tmp,'fixture.js')):style?fs.readFileSync(path.join('dist/assets',css)):'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.QA_CHROME_PATH,headless:true});
 try{
  const base=`http://127.0.0.1:${server.address().port}`;
  async function open(state='checkout',failure=false,allowed=true){
   const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.errors=errors;
   await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
   await page.addInitScript(({state,failure,allowed})=>{
    window.calls=[];window.open=()=>({closed:false,close(){},document:{open(){},write(){},close(){}}});
    window.confirm=()=>true;
    window.candidate=state?{id:'candidate',state,qr_in_book:true,pin_enabled:false}:null;
    const shipping={recipient_name:'QA',postal_code:'1000000',prefecture:'東京都',city:'QA市',line1:'1'};
    const work={id:'work',revision:1,answer_ids:[],confirmed_at:null};
    window.mockClient={
     rpc:async(name,args)=>{
      window.calls.push({type:name,args});
      if(name==='can_use_book_completion')return {data:allowed};
      if(name==='get_book_completion')return failure?{error:{message:'offline'}}:{data:window.candidate};
      if(name==='get_book_work'||name==='save_book_selection')return {data:work};
      if(name==='get_book_order_quote')return {data:{amount_total:0,configuration_total:0,base_already_purchased:true}};
      if(name==='prepare_book_completion'){window.candidate={id:'new-candidate',state:'prepared',qr_in_book:true};return {data:window.candidate};}
      return {data:null};
     },
     from:table=>{
      const result={data:table==='book_cover_settings'?{title:'QA',shipping_address:shipping,suggestions:Array(10).fill('QA')}:[]};
      const query={select(){return query;},eq(){return query;},order(){return query;},maybeSingle:async()=>result,then:(r,j)=>Promise.resolve(result).then(r,j),upsert:async()=>{window.calls.push({type:'write-cover'});return {};}};
      return query;
     },
     functions:{invoke:async(name)=>{window.calls.push({type:name});if(name==='cancel-book-completion')window.candidate=null;return {data:{success:true}};}},
     storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:''}})})}
    };
   },{state,failure,allowed});
   await page.goto(base);return page;
  }
  const pending=await open();
  await pending.getByRole('button',{name:'注文手続きを続ける'}).click();
  await pending.waitForFunction(()=>window.calls.some(c=>c.type==='purchase'));
  assert.equal(await pending.getByText('一冊が、できました。',{exact:true}).count(),0);
  assert.equal(await pending.evaluate(()=>window.calls.some(c=>c.type==='write-cover'||c.type==='stale-checkout')),false);
  await pending.getByRole('button',{name:'注文手続きを取りやめて編集へ戻る'}).click();
  await pending.getByRole('radio',{name:'設定しない',exact:true}).waitFor();
  assert.equal(await pending.getByRole('radio',{name:'設定しない',exact:true}).isChecked(),true);
  await pending.getByRole('radio',{name:'PINを設定する',exact:true}).check();
  await pending.getByLabel('4桁の閲覧PIN').fill('0001');
  await pending.getByRole('button',{name:'注文を確定',exact:true}).click();
  await pending.waitForFunction(()=>window.calls.filter(c=>c.type==='purchase').length===2);
  assert.equal(await pending.evaluate(()=>window.calls.some(c=>c.type==='stale-checkout')),false);
  assert.equal(await pending.evaluate(()=>window.calls.filter(c=>c.type==='purchase')[1].candidate),'new-candidate');
  const completed=await open('completed');await completed.getByText('一冊が、できました。',{exact:true}).waitFor();
  await completed.getByRole('link',{name:'私の本棚へ'}).waitFor();
  const failed=await open(null,true);await failed.getByText('注文状態を確認できませんでした。再読み込みしてください。',{exact:true}).waitFor();
  assert.equal(await failed.getByRole('button',{name:'注文を確定'}).count(),0);
  assert.equal(await failed.evaluate(()=>window.calls.some(c=>c.type==='write-cover'||c.type==='purchase')),false);
  const paid=await open();await paid.evaluate(()=>window.finishPayment=true);
  await paid.getByRole('button',{name:'注文手続きを続ける'}).click();await paid.getByText('一冊が、できました。',{exact:true}).waitFor();
  const unlisted=await open(null,false,false);
  assert.equal(await unlisted.getByText('声と言葉を、Webブックにも。',{exact:true}).count(),0);
  await unlisted.getByRole('button',{name:'決済画面を開き直す'}).click();
  await unlisted.waitForFunction(()=>window.calls.some(c=>c.type==='stale-checkout'));
  assert.equal(await unlisted.evaluate(()=>window.calls.some(c=>c.type==='prepare_book_completion')),false);
  assert.equal(await unlisted.evaluate(()=>window.calls.some(c=>c.type==='purchase')),false);
  const revoked=await open('prepared',false,false);
  await revoked.getByRole('button',{name:'注文手続きを続ける'}).click();
  await revoked.getByText('この注文は現在ご利用いただけません。注文手続きを取りやめてください。').waitFor();
  assert.equal(await revoked.evaluate(()=>window.calls.some(c=>c.type==='purchase')),false);
  await revoked.getByRole('button',{name:'注文手続きを取りやめて編集へ戻る'}).waitFor();
  for(const p of [pending,completed,failed,paid,unlisted,revoked])assert.deepEqual(p.errors,[]);
  await completed.screenshot({path:path.join(tmp,'completed-390.png')});
  console.log('PASS 390px actual BookBuilder: pending retry, no premature completion, no stale checkout, cancellation/new candidate, PIN default/leading zero, completed reload, failure closed, server-confirmed completion, unlisted legacy UI, revoked candidate blocked');
  console.log('Screenshot: '+path.join(tmp,'completed-390.png'));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
