// Generates a static-only artifact. Never deploys, sends notifications or pays.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {build} from 'vite';
import {assertPublicTestEnvironment,TEST_SUPABASE_URL} from '../../src/lib/publicTestSafety.js';
const ref='zpswxefgfabzvxdbtyvq';
assert.equal(process.env.QA_RELEASE_TEST_REF,ref);
const cli=process.env.QA_SUPABASE_CLI;assert.ok(cli);
const raw=execFileSync(cli,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const anon=JSON.parse(raw.slice(raw.indexOf('['))).find(k=>k.name==='anon').api_key;
const settings={
 VITE_PUBLIC_TEST_MODE:'true',VITE_SUPABASE_URL:TEST_SUPABASE_URL,VITE_SUPABASE_ANON_KEY:anon,
 VITE_EXPERIENCE_V2_TEST_ONLY:'true',VITE_EXPERIENCE_V2_ENABLED:'true',
 VITE_TRIAL_CONVERSION_ENABLED:'true',VITE_EXPERIENCE_NOTIFICATIONS_ENABLED:'false',
 VITE_FAMILY_CONNECTION_TEST:'true',VITE_FAMILY_SUBJECT_CONNECTION_ENABLED:'false'
};
assertPublicTestEnvironment(settings);
// Do not import a developer's .env.local or leak ambient VITE values.
for(const key of Object.keys(process.env))if(key.startsWith('VITE_'))delete process.env[key];
Object.assign(process.env,settings);
const root=process.cwd(),outDir=path.join(root,'output/family-test-stage');
const filesUnder=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?filesUnder(path.join(dir,e.name)):[path.join(dir,e.name)]);
const sourceText=filesUnder(path.join(root,'src')).filter(p=>/\.(jsx?|css)$/.test(p)).map(p=>fs.readFileSync(p,'utf8')).join('\n')+fs.readFileSync('index.html','utf8');
await build({envDir:false,build:{outDir,emptyOutDir:true,sourcemap:false},publicDir:false,plugins:[{
 name:'public-test-noindex',transformIndexHtml(html){return html
  .replace('<head>','<head>\n<meta name="robots" content="noindex,nofollow,noarchive" />\n<meta name="application-environment" content="test" />')
  .replace('</head>','<link rel="manifest" href="/pwa/manifest.webmanifest"/><link rel="apple-touch-icon" href="/pwa/icon-180.png"/><meta name="apple-mobile-web-app-capable" content="yes"/><meta name="apple-mobile-web-app-title" content="縦糸横糸"/><meta name="theme-color" content="#101c2c"/></head>')
  .replace('<title>','<title>TEST｜')
  .replace(/<link rel="canonical"[^>]+>/,'')
  .replace(/<meta property="og:url"[^>]+>/,'');}
}]});
// Copy only public assets referenced by application source, not unused candidate
// images, development previews, reports, source files or private QA sessions.
const assets=new Set([...sourceText.matchAll(/["'`]\/(?:site\/)?[A-Za-z0-9_.\/-]+\.(?:png|jpe?g|svg|webp|wav|mp3|mp4)["'`]/g)].map(m=>m[0].slice(2,-1)));
for(const relative of assets){
 const source=path.join(root,'public',relative);assert.ok(fs.existsSync(source),`Missing public asset: ${relative}`);
 const dest=path.join(outDir,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(source,dest);
}
fs.copyFileSync('scripts/deploy/public-test.vercel.json',path.join(outDir,'vercel.json'));
// Link only the independently deployed TEST project, never tateyoko-book.
fs.mkdirSync(path.join(outDir,'.vercel'),{recursive:true});
fs.writeFileSync(path.join(outDir,'.vercel/project.json'),JSON.stringify({projectId:'prj_sPwDR1BfQBpYUQAgu1ElFlU4QeCX',orgId:'team_027fdPcnI7A33ybpJtw7Db4D',projectName:'tateyoko-book-test'}));
fs.cpSync('public/pwa',path.join(outDir,'pwa'),{recursive:true});
fs.copyFileSync('public/pwa-sw.js',path.join(outDir,'pwa-sw.js'));
const files=filesUnder(outDir);
assert.ok(files.every(p=>!/(?:private|\.env|sourcemap|AdminReview|\.map$)/i.test(path.relative(outDir,p))));
const code=files.filter(p=>/\.(js|html|json)$/.test(p)).map(p=>fs.readFileSync(p,'utf8')).join('\n');
// The release guard names both permitted environments. That comparison literal
// is not runtime configuration; credentials and CSP must still be TEST-only.
assert.equal(settings.VITE_SUPABASE_URL,TEST_SUPABASE_URL);
assert.ok(!fs.readFileSync(path.join(outDir,'vercel.json'),'utf8').includes('wquxjeqkumossjxehdop'));
assert.ok(!/(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|sb_secret_[A-Za-z0-9]/.test(code),'Server key included');
for(const jwt of code.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]){
 const claims=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url').toString());assert.equal(claims.role,'anon');assert.equal(claims.ref,ref);
}
assert.ok(fs.readFileSync(path.join(outDir,'index.html'),'utf8').includes('noindex'));
const report={ref,files:files.length,bytes:files.reduce((n,p)=>n+fs.statSync(p).size,0),adminBundle:false,sourceMaps:false,productionConfiguration:false,productionGuardLiteral:code.includes('wquxjeqkumossjxehdop'),noindex:true,deployed:false};
fs.writeFileSync('output/family-test-build-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
