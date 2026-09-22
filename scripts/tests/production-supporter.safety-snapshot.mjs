// READ ONLY remote snapshot. Never deploy, restore, set secrets or invoke app RPCs.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
assert.equal(process.argv[2],'--read-only');
const dir=process.env.QA_SAFETY_DIR,cli=process.env.QA_SUPABASE_CLI;
assert.ok(dir?.startsWith('/private/tmp/tateyoko-prod-safety.')&&cli);
fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.chmodSync(dir,0o700);
const ref='wquxjeqkumossjxehdop',origin='https://www.tateito-yokoito.jp';
const hash=b=>createHash('sha256').update(b).digest('hex');
const save=(name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2),{mode:0o600});
const call=(args,cwd=dir)=>execFileSync(cli,args,{cwd,encoding:'utf8',maxBuffer:64*1024*1024,stdio:['ignore','pipe','pipe']});
const json=raw=>JSON.parse(raw.slice(raw.search(/[\[{]/)));
const backups=json(call(['backups','list','--project-ref',ref,'--output','json']));save('backups.json',backups);
const secrets=json(call(['secrets','list','--project-ref',ref,'--output','json']));
// Digests are compared ONLY against explicit non-secret config values. Keys are never guessed/read.
const candidates={SUPABASE_URL:[`https://${ref}.supabase.co`],EXPERIENCE_COMMERCE_SUPABASE_URL:[`https://${ref}.supabase.co`],EXPERIENCE_COMMERCE_MODE:['live','test'],EXPERIENCE_CONTRACTS_V2_TEST_ONLY:['true','false'],EXPERIENCE_CHECKOUT_ENABLED:['true','false'],APP_URL:[origin,origin+'/'],FAMILY_PRODUCTION_ENABLED:['true','false'],FAMILY_TEST_ENABLED:['true','false'],EXPERIENCE_NOTIFICATIONS_ENABLED:['true','false']};
const settings=Object.entries(candidates).map(([name,values])=>{const s=secrets.find(s=>s.name===name);return {name,present:!!s,verifiedNonSecretValue:s?values.find(v=>hash(v)===(s.digest??s.value))||'unverified':null};});
save('settings-check.json',{at:new Date().toISOString(),ref,settings,secretNames:secrets.map(s=>s.name),secretValuesRead:false});
const edges=json(call(['functions','list','--project-ref',ref,'--output','json']));
const names=['create-checkout-session','transcribe-audio','polish-transcript','publish-voice-edition','export-experience-data','sync-checkout-session','stripe-webhook','request-experience-refund'];
const filesUnder=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?filesUnder(path.join(d,e.name)):[path.join(d,e.name)]);
const edgeSnapshots=[];
const prior=fs.existsSync(path.join(dir,'edges-manifest.json'))?JSON.parse(fs.readFileSync(path.join(dir,'edges-manifest.json'))):[];
for(const name of names){
 const meta=edges.find(e=>e.slug===name);assert.ok(meta);
 const root=path.join(dir,'edges',name);fs.mkdirSync(root,{recursive:true,mode:0o700});
 const previous=prior.find(e=>e.slug===name);
 if(previous){assert.equal(previous.version,meta.version,'Remote version changed; capture into a fresh directory');}
 else call(['functions','download',name,'--project-ref',ref,'--use-api'],root);
 const files=filesUnder(root).map(f=>({path:path.relative(root,f),sha256:hash(fs.readFileSync(f)),bytes:fs.statSync(f).size}));assert.ok(files.length);
 edgeSnapshots.push({slug:name,version:meta.version,verify_jwt:meta.verify_jwt,ezbr_sha256:meta.ezbr_sha256,files});
 console.log(JSON.stringify({edgeSnapshot:name,version:meta.version,files:files.length}));
}
save('edges-manifest.json',edgeSnapshots);
// Download the actual served entry and its same-origin dependency graph, not a rebuild.
const queue=['/','/pwa-sw.js','/manifest.webmanifest'],seen=new Set(),assets=[];
while(queue.length){
 const item=queue.shift();if(seen.has(item))continue;seen.add(item);assert.ok(seen.size<600);
 const u=new URL(item,origin);if(u.origin!==origin)continue;
 const r=await fetch(u,{redirect:'error'});if(!r.ok){assets.push({path:item,status:r.status});continue;}
 const body=Buffer.from(await r.arrayBuffer());assert.ok(body.length<40*1024*1024);
 const dest=path.join(dir,'frontend',item==='/'?'index.html':decodeURIComponent(u.pathname).replace(/^\//,''));
 assert.ok(dest.startsWith(path.join(dir,'frontend')+path.sep));fs.mkdirSync(path.dirname(dest),{recursive:true,mode:0o700});fs.writeFileSync(dest,body,{mode:0o600});
 assets.push({path:item,status:r.status,bytes:body.length,sha256:hash(body),etag:r.headers.get('etag'),server:r.headers.get('server')});
 if(/(?:javascript|text\/|json)/.test(r.headers.get('content-type')||'')){
  const text=body.toString();
  for(const m of text.matchAll(/["'`](\/[^"'`\s<>]+|\.?\.?\/[^"'`\s<>]+|[\w-]+\.(?:js|css))['"`]/g)){
   let a;try{a=new URL(m[1],u);}catch{continue;}if(a.origin===origin&&/\.(?:js|css|svg|png|jpg|jpeg|webp|woff2?|ico|webmanifest|json)$/.test(a.pathname))queue.push(a.pathname);
  }
 }
}
save('frontend-manifest.json',{at:new Date().toISOString(),origin,assets,scope:'served entry and statically discoverable same-origin dependencies; not a complete deployment export'});
save('summary.json',{at:new Date().toISOString(),ref,productionChanged:false,backups:backups.backups,pitrEnabled:backups.pitr_enabled,settings,edgeCount:edgeSnapshots.length,frontendFiles:assets.filter(a=>a.status===200).length});
console.log(JSON.stringify({productionChanged:false,edgeCount:edgeSnapshots.length,frontendFiles:assets.filter(a=>a.status===200).length,pitrEnabled:backups.pitr_enabled,latestBackup:backups.backups?.[0],settings}));
