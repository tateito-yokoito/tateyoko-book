import {build} from 'esbuild';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import http from 'node:http';
const tmp=await mkdtemp(join(tmpdir(),'web-book-preview-'));
const sql=await readFile('supabase/migrations/202608280001_redesign_starting_conversation_and_story_themes.sql','utf8');
const questions={};
for(const m of sql.matchAll(/\('TY_Q\d+',\s*\d+,\s*'(ty_theme_[^']+)',\s*'[^']+',\s*\d+,\s*'[^']+',\s*'([^']+)'/g))(questions[m[1]]||=[]).push(m[2]);
if(Object.keys(questions).length!==9)throw Error('Formal question extraction failed');
await build({entryPoints:[process.argv.includes('--compact-video')?'scripts/tests/web-book-video-compact.fixture.jsx':process.argv.includes('--compact')?'scripts/tests/web-book-compact.fixture.jsx':'scripts/tests/web-book.fixture.jsx'],bundle:true,jsx:'automatic',outfile:join(tmp,'fixture.js'),define:{FORMAL_QUESTIONS:JSON.stringify(questions),'import.meta.env':'{}'}});
const root=resolve('public');
const server=http.createServer(async(req,res)=>{
 try {
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Webブック｜390px確認</title><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;background:#eeeee8}#root{max-width:390px;margin:auto}a{min-height:32px;display:inline-flex;align-items:center}</style><div id="root"></div><script src="/fixture.js"></script></html>');return;}
 const file=pathname.startsWith('/fixture.')?join(tmp,pathname.slice(1)):resolve(root,'.'+decodeURIComponent(pathname));
 if(!file.startsWith(root+'/')&&!file.startsWith(tmp+'/')){res.writeHead(403);res.end();return;}
 const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.wav':'audio/wav','.mp4':'video/mp4'};
 res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');
 res.end(await readFile(file));
 }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(0,'127.0.0.1',()=>console.log(`Web Book preview: http://127.0.0.1:${server.address().port}`));
