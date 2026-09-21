// Serve the actual TEST application build, never the diagnostic SMS fixture UI.
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('output/family-test-stage'),files=new Map();
async function collect(dir,prefix=''){for(const e of await readdir(dir,{withFileTypes:true})){if(e.name.startsWith('.'))continue;const p=dir+'/'+e.name;if(e.isDirectory())await collect(p,prefix+'/'+e.name);else files.set(prefix+'/'+e.name,p);}}
await collect(root);
const html=await readFile(files.get('/index.html'),'utf8');
assert.ok(html.includes('noindex') && html.includes('application-environment'));
createServer(async(req,res)=>{
 try{
 if(req.headers.host!=='127.0.0.1:5195'||!['GET','HEAD'].includes(req.method)){res.writeHead(403);res.end();return;}
  const pathname=new URL(req.url,'http://127.0.0.1:5195').pathname;
 const file=files.get(pathname==='/'?'/index.html':pathname);
 if(!file){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.webmanifest':'application/manifest+json'})[extname(file)]||'application/octet-stream','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'});
 res.end(req.method==='HEAD'?undefined:await readFile(file));
 }catch{res.writeHead(500);res.end();}
}).listen(5195,'127.0.0.1',()=>console.log('ACTUAL_TEST_APP=http://127.0.0.1:5195/?app=1&family=1 (no automatic SMS)'));
