import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const origin='https://www.tateito-yokoito.jp';
const manifest=JSON.parse(fs.readFileSync('output/production-cutover-20260916/build-manifest.json','utf8'));
const checked=[];
for(const file of manifest.files.filter(f=>f.file==='index.html'||/^assets\/(?:index|AdminReview).*\.js$/.test(f.file))) {
 const r=await fetch(`${origin}/${file.file==='index.html'?'':file.file}`);
 assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256,file.file);
 if(file.file==='index.html') {
  assert.ok(r.headers.get('content-security-policy').includes('wquxjeqkumossjxehdop'));
  assert.ok(!r.headers.get('content-security-policy').includes('zpswxefgfabzvxdbtyvq'));
 }
 checked.push({file:file.file,sha256Matches:true});
}
for(const pathname of ['/.env','/src/App.jsx','/scripts/previews/trial-conversion.html'])assert.equal((await fetch(origin+pathname)).status,404);
const report={origin,at:new Date().toISOString(),checked,privatePaths404:true,productionCsp:true};
fs.writeFileSync('output/production-cutover-20260916/site-remote.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
