const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.QA_PLAYWRIGHT_PATH);
const root=path.resolve('output/production-stage');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav'};
(async()=>{
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
  for(const h of JSON.parse(fs.readFileSync(path.join(root,'vercel.json'))).headers[0].headers)res.setHeader(h.key,h.value);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  // No authenticated session; never create users, orders, emails or recordings.
  await page.goto(base+'/?admin=1');await page.getByText('登録済みの管理者アカウントでログインします。',{exact:true}).waitFor();
  assert.equal(await page.getByText('この確認用サイトではご利用いただけません。').count(),0);
  await page.goto(base+'/?app=1&entry=trial&dev=1');await page.getByRole('button').first().waitFor();
  assert.ok(!(await page.locator('body').innerText()).includes('開発用ログイン'));
  for(const p of ['/.env','/src/App.jsx','/scripts/previews/trial-conversion.html'])assert.equal((await fetch(base+p)).status,404);
  assert.ok(requests.every(u=>!u.includes('zpswxefgfabzvxdbtyvq')));assert.deepEqual(errors,[]);
  const report={adminSignInVisible:true,adminAuthenticatedSessionTested:false,devLoginDisabled:true,testRequests:0,privatePaths404:true,jsErrors:errors,physicalDevice:false};
  fs.writeFileSync('output/production-cutover-20260916/build-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
