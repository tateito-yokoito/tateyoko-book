import {build} from 'esbuild';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
const tmp=await mkdtemp(join(tmpdir(),'book-milestones-preview-'));
await build({entryPoints:['scripts/tests/book-milestones.fixture.jsx'],bundle:true,jsx:'automatic',outfile:join(tmp,'fixture.js'),define:{'import.meta.env':'{"VITE_BOOK_MILESTONES_ENABLED":"true"}'},plugins:[{name:'no-network',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'mock',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const createClient=()=>({});'}));}}]});
const css=(await readdir('dist/assets')).find(n=>n.startsWith('index-')&&n.endsWith('.css'));
const server=http.createServer(async(req,res)=>{
 if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(join(tmp,'fixture.js')));}
 else if(req.url==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end(await readFile(join('dist/assets',css)));}
 else{res.setHeader('Content-Type','text/html');res.end('<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>縦糸横糸｜操作感プレビュー</title><link rel="stylesheet" href="/fixture.css"><style>.preview-bar{position:fixed;bottom:0;left:0;right:0;z-index:10050;display:flex;align-items:center;justify-content:center;gap:24px;padding:14px 10px;background:#182638;border-top:1px solid #ffffff25;font-size:13px;color:#d6dbe3}.preview-bar a{text-decoration:underline}.preview-card{display:block;border:1px solid #ffffff25;background:#ffffff08;border-radius:16px;padding:20px;text-decoration:none}.preview-card:hover{background:#ffffff12}.preview-card strong{display:block;font-size:18px;margin-bottom:8px}.preview-card span{font-size:14px;color:#bac1ce}.app-container{padding-bottom:90px!important;height:auto!important;min-height:100dvh}.fixed.inset-0{bottom:58px!important}pre{white-space:pre-wrap}</style><div id="root"></div><script src="/fixture.js"></script></html>');}
});
server.listen(0,'127.0.0.1',()=>console.log(`Milestone fixture: http://127.0.0.1:${server.address().port}`));
