// Builds only. Deployment remains a separate, explicitly approved operation.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {build} from 'vite';
assert.equal(process.argv[2],'--closed');
const root=process.cwd(),ref='wquxjeqkumossjxehdop',cli=process.env.QA_SUPABASE_CLI;assert.ok(cli);
const raw=execFileSync(cli,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const anon=JSON.parse(raw.slice(raw.indexOf('['))).find(k=>k.name==='anon').api_key;
const claims=JSON.parse(Buffer.from(anon.split('.')[1],'base64url'));assert.equal(claims.ref,ref);assert.equal(claims.role,'anon');
const settings={VITE_SUPABASE_URL:`https://${ref}.supabase.co`,VITE_SUPABASE_ANON_KEY:anon,
 VITE_FAMILY_PRODUCTION_ENABLED:'false',VITE_FAMILY_CONNECTION_TEST:'false',VITE_FAMILY_SUBJECT_CONNECTION_ENABLED:'false',VITE_PUBLIC_TEST_MODE:'false'};
// Do not turn on global self/conversion/notification flags that are unset in current production.
for(const key of Object.keys(process.env))if(key.startsWith('VITE_'))delete process.env[key];Object.assign(process.env,settings);
const outDir=path.join(root,'output/closed-production-stage');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const source=walk(path.join(root,'src')).filter(f=>/\.(jsx?|css)$/.test(f)).map(f=>fs.readFileSync(f,'utf8')).join('\n')+fs.readFileSync('index.html','utf8');
await build({envDir:false,publicDir:false,build:{outDir,emptyOutDir:true,sourcemap:false}});
for(const rel of new Set([...source.matchAll(/["'`]\/(?:site\/)?[A-Za-z0-9_.\/-]+\.(?:png|jpe?g|svg|webp|wav|mp3|mp4)["'`]/g)].map(m=>m[0].slice(2,-1)))){
 const from=path.join(root,'public',rel),to=path.join(outDir,rel);assert.ok(fs.existsSync(from),rel);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);
}
fs.writeFileSync(path.join(outDir,'vercel.json'),JSON.stringify({framework:null,buildCommand:'',installCommand:'',outputDirectory:'.'}));
fs.mkdirSync(path.join(outDir,'.vercel'),{recursive:true});
fs.writeFileSync(path.join(outDir,'.vercel/project.json'),JSON.stringify({projectId:'prj_WZM2OzVMdtm4x6VbwWLeISqMzjM4',orgId:'team_027fdPcnI7A33ybpJtw7Db4D',projectName:'tateyoko-book'}));
const files=walk(outDir);assert.ok(files.every(f=>!/(?:private|\.env|\.map$)/i.test(path.relative(outDir,f))));
const code=files.filter(f=>/\.(js|html|json)$/.test(f)).map(f=>fs.readFileSync(f,'utf8')).join('\n');
assert.ok(!/(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|sb_secret_[A-Za-z0-9]/.test(code));
for(const jwt of code.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]){const c=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url'));assert.equal(c.ref,ref);assert.equal(c.role,'anon');}
assert.ok(!fs.readFileSync(path.join(outDir,'index.html'),'utf8').includes('application-environment'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={at:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),ref,closed:true,settings:Object.fromEntries(Object.entries(settings).filter(([k])=>k!=='VITE_SUPABASE_ANON_KEY')),files:files.map(f=>({path:path.relative(outDir,f),sha256:sha(fs.readFileSync(f)),bytes:fs.statSync(f).size})),deployed:false};
fs.mkdirSync('output/closed-production-release',{recursive:true,mode:0o700});fs.writeFileSync('output/closed-production-release/build.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({built:true,closed:true,ref,files:files.length,sourceCommit:report.sourceCommit}));
