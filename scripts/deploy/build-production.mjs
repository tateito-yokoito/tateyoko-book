// Explicit production artifact: no ambient .env, credentials or review fixtures.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {build} from 'vite';
const ref='wquxjeqkumossjxehdop';
assert.equal(process.env.RELEASE_PRODUCTION_REF,ref);
const enableBookProduction=process.env.RELEASE_ENABLE_BOOK_V2==='true';
const cli=process.env.QA_SUPABASE_CLI;assert.ok(cli);
const raw=execFileSync(cli,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const anon=JSON.parse(raw.slice(raw.indexOf('['))).find(k=>k.name==='anon').api_key;
for(const key of Object.keys(process.env))if(key.startsWith('VITE_'))delete process.env[key];
Object.assign(process.env,{
 VITE_PUBLIC_TEST_MODE:'false',VITE_SUPABASE_URL:`https://${ref}.supabase.co`,VITE_SUPABASE_ANON_KEY:anon,
 VITE_EXPERIENCE_V2_TEST_ONLY:'false',VITE_EXPERIENCE_V2_ENABLED:'true',VITE_TRIAL_CONVERSION_ENABLED:'true',
 VITE_EXPERIENCE_NOTIFICATIONS_ENABLED:'true',
 VITE_LINE_AUTH_ENABLED:'true',VITE_FREE_TRIAL_RETENTION_ENABLED:'true',
 VITE_BOOK_PRODUCTION_V2_ENABLED:String(enableBookProduction),
 VITE_BOOK_PDF_ENABLED:String(enableBookProduction)
});
const root=process.cwd(),outDir=path.join(root,'output/production-stage');
const filesUnder=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?filesUnder(path.join(dir,e.name)):[path.join(dir,e.name)]);
const sources=filesUnder(path.join(root,'src')).filter(p=>/\.(jsx?|css)$/.test(p));
const text=sources.map(p=>fs.readFileSync(p,'utf8')).join('\n')+fs.readFileSync('index.html','utf8');
await build({envDir:false,build:{outDir,emptyOutDir:true,sourcemap:false},publicDir:false});
const assets=new Set([...text.matchAll(/["'`]\/(?:site\/)?[A-Za-z0-9_.\/-]+\.(?:png|jpe?g|svg|webp|wav|mp3|mp4)["'`]/g)].map(m=>m[0].slice(2,-1)));
for(const relative of assets){
 const source=path.join(root,'public',relative);assert.ok(fs.existsSync(source),`Missing asset ${relative}`);
 const dest=path.join(outDir,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(source,dest);
}
// Vite's publicDir is disabled to keep private and unused candidate assets out
// of the release. The landing shell still loads these small, explicitly public
// scripts/styles, and its book sample loads media from public/assets.
for (const relative of [...fs.readFileSync('index.html','utf8').matchAll(/(?:src|href)="\/([^"?#]+\.(?:css|js))"/g)].map(match=>match[1])) {
 const source=path.join(root,'public',relative);
 assert.ok(fs.existsSync(source),`Missing entry asset ${relative}`);
 const dest=path.join(outDir,relative);
 fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(source,dest);
}
fs.cpSync(path.join(root,'public/assets'),path.join(outDir,'assets'),{recursive:true,force:false});
fs.cpSync(path.join(root,'public/pwa'),path.join(outDir,'pwa'),{recursive:true});
fs.copyFileSync(path.join(root,'public/pwa-sw.js'),path.join(outDir,'pwa-sw.js'));
// JSON imports and prebuilt public scripts can introduce image paths that the
// source-only collection above cannot see. Resolve every literal media path in
// the compiled release and fail before deploy when its source is absent.
for(const compiled of filesUnder(outDir).filter(p=>/\.(?:html|js|css)$/.test(p))){
 const content=fs.readFileSync(compiled,'utf8');
 for(const [url] of content.matchAll(/\/(?:site|assets|pwa)\/[A-Za-z0-9_.\/-]+\.(?:png|jpe?g|svg|webp|wav|mp3|mp4|webmanifest)/g)){
  const relative=url.slice(1),dest=path.join(outDir,relative);
  if(fs.existsSync(dest))continue;
  const source=path.join(root,'public',relative);
  assert.ok(fs.existsSync(source),`Missing compiled asset ${relative}`);
  fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(source,dest);
 }
}
const config=JSON.parse(fs.readFileSync('scripts/deploy/public-test.vercel.json','utf8').replaceAll('zpswxefgfabzvxdbtyvq',ref));
for(const route of config.headers||[])for(const header of route.headers||[]){
 if(header.key==='X-Tateyoko-Environment')header.value='production';
}
// Prevent premature indexing until the remaining physical-device/print checks.
// This does not restrict normal production use or admin authentication.
fs.writeFileSync(path.join(outDir,'vercel.json'),JSON.stringify(config,null,2));
const files=filesUnder(outDir);
assert.ok(files.every(p=>!/(?:private|\.env|\.map$)/i.test(path.relative(outDir,p))));
const code=files.filter(p=>/\.(js|html|json)$/.test(p)).map(p=>fs.readFileSync(p,'utf8')).join('\n');
assert.ok(!code.includes('zpswxefgfabzvxdbtyvq'),'TEST ref included');
assert.ok(!/(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|sb_secret_[A-Za-z0-9]/.test(code));
for(const jwt of code.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]){
 const claims=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url').toString());assert.equal(claims.role,'anon');assert.equal(claims.ref,ref);
}
assert.ok(files.some(p=>/AdminReview.*\.js$/.test(p)),'Admin missing');
fs.mkdirSync(path.join(outDir,'.vercel'),{recursive:true});
fs.writeFileSync(path.join(outDir,'.vercel/project.json'),JSON.stringify({projectId:'prj_WZM2OzVMdtm4x6VbwWLeISqMzjM4',orgId:'team_027fdPcnI7A33ybpJtw7Db4D',projectName:'tateyoko-book'}));
const report={ref,at:new Date().toISOString(),adminBundle:true,sourceMaps:false,testRef:false,bookProductionEnabled:enableBookProduction,deployed:false,
 files:files.map(p=>({file:path.relative(outDir,p),sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}))};
fs.writeFileSync('output/production-cutover-20260916/build-manifest.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({ref,files:files.length,adminBundle:true,testRef:false}));
