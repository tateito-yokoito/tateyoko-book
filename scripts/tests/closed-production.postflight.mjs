// Metadata and anonymous denial only. No new accounts, enrollment or live payment.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(process.argv[2],'--read-only');
const dir='output/closed-production-release',cli=process.env.QA_SUPABASE_CLI,ref='wquxjeqkumossjxehdop';assert.ok(cli);
const call=(args,cwd=process.cwd())=>execFileSync(cli,args,{cwd,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});
const json=raw=>JSON.parse(raw.slice(raw.search(/[\[{]/)));
const db=json(call(['db','query','--linked','--project-ref',ref,`begin read only;
select jsonb_build_object('rollout',(select enabled from family_private.rollout where id),'allowlist_count',(select cardinality(allowed_actor_ids) from family_private.rollout where id),'C',(select subject_connection_enabled from family_private.rollout where id),'bindings',(select count(*) from family_subject_bindings),'consents',(select count(*) from family_production_consents),'managed_existing_projects',(select count(*) from book_projects where family_managed(id)),'migration_count',(select count(*) from supabase_migrations.schema_migrations),'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','family_private') and p.prokind='f')) as result;commit;`]));assert.ok(!db.error);
const result=db.rows[0].result;
assert.equal(result.rollout,false);assert.equal(result.allowlist_count,0);assert.equal(result.C,false);assert.equal(result.bindings,0);assert.equal(result.consents,0);assert.equal(result.managed_existing_projects,0);assert.equal(result.migration_count,114);
const expected=JSON.parse(fs.readFileSync('output/supporter-preflight/rehearsed-functions.json'));
const norm=s=>s.replace(/\s+/g,' ').trim();
for(const f of expected){const actual=result.functions.find(a=>a.signature===f.signature);assert.ok(actual,f.signature);assert.equal(norm(actual.definition),norm(f.definition),f.signature);}
delete result.functions;result.rehearsedFunctionsMatched=expected.length;
const edges=json(call(['functions','list','--project-ref',ref,'--output','json']));
const before=JSON.parse(fs.readFileSync('output/supporter-preflight/deployment-metadata.json')).edges;
const updated=['create-checkout-session','transcribe-audio','polish-transcript','publish-voice-edition','export-experience-data'];
const metadata=[];
for(const b of before){const now=edges.find(e=>e.slug===b.slug);assert.ok(now);assert.equal(now.verify_jwt,b.verify_jwt);assert.equal(now.version,b.version+(updated.includes(b.slug)?1:0));metadata.push({slug:now.slug,version:now.version,verify_jwt:now.verify_jwt});}
const secrets=json(call(['secrets','list','--project-ref',ref,'--output','json']));assert.ok(!secrets.some(s=>s.name==='FAMILY_PRODUCTION_ENABLED'),'Unexpected production flag addition: inspect value before continuing');
const raw=json(call(['projects','api-keys','--project-ref',ref,'--output','json']));const anon=raw.find(k=>k.name==='anon').api_key;
const probes=[];
for(const name of updated){const r=await fetch(`https://${ref}.supabase.co/functions/v1/${name}`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${anon}`,'Content-Type':'application/json'},body:'{}'});const body=await r.json();assert.ok([400,401,403].includes(r.status),`${name}: ${r.status}`);assert.ok(!body.success);probes.push({name,status:r.status,anonymousRejected:true});}
assert.equal(probes.find(x=>x.name==='create-checkout-session').status,401,'Checkout mode/key/DB configuration must pass before authentication rejection');
const verified=[],downloadRoot=fs.mkdtempSync('/private/tmp/tateyoko-closed-edge.');
for(const name of updated){
 const root=path.join(downloadRoot,name);fs.mkdirSync(root,{recursive:true});call(['functions','download',name,'--project-ref',ref,'--use-api'],root);
 const functions=path.join(root,'supabase/functions');const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
 for(const f of walk(functions)){const rel=path.relative(functions,f);assert.ok(fs.readFileSync(f).equals(fs.readFileSync(path.join('supabase/functions',rel))),`${name}/${rel}`);}
 fs.cpSync(root,path.resolve(dir,'edge-verified',name),{recursive:true});
 verified.push(name);
}
const report={at:new Date().toISOString(),ref,gates:result,metadata,serverFamilyFlag:'absent = OFF',probes,verified,authenticatedSmoke:false,livePayment:false,accountCreated:false,rolloutOpened:false};
fs.writeFileSync(`${dir}/postflight.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
