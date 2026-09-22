// Production checks are READ ONLY / anonymous denial; no customer writes or payments.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
assert.equal(process.argv[2],'--read-only');
const cli=process.env.QA_SUPABASE_CLI;assert.ok(cli);
const ref='wquxjeqkumossjxehdop',dir='output/book-milestones-production-release';
const call=args=>{const s=execFileSync(cli,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:4*1024*1024});return JSON.parse(s.slice(s.search(/[\[{]/)));};
const result=call(['db','query','--linked','--project-ref',ref,`begin read only;
select jsonb_build_object('readOnly',current_setting('transaction_read_only'),'rollout',(select enabled from family_private.rollout where id),'allowlist',(select cardinality(allowed_actor_ids) from family_private.rollout where id),'C',(select subject_connection_enabled from family_private.rollout where id),
'migration',(select count(*) from supabase_migrations.schema_migrations where version='202609220002'),
'closingCatalog',(select count(*) from questions where id='TY_CLOSING01'),
'closingUserQuestions',(select count(*) from user_questions where question_id='TY_CLOSING01'),
'anonContextAllowed',has_function_privilege('anon','book_milestone_context(uuid,uuid)','execute'),
'authContextAllowed',has_function_privilege('authenticated','book_milestone_context(uuid,uuid)','execute'),
'privateTables',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'authSelect',has_table_privilege('authenticated',c.oid,'select'))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in('book_milestone_uploads','book_milestone_revisions'))
) as verification;commit;`]);assert.ok(!result.error);
const db=result.rows[0].verification;
assert.equal(db.readOnly,'on');assert.equal(db.rollout,false);assert.equal(db.allowlist,0);assert.equal(db.C,false);
assert.equal(db.migration,1);assert.equal(db.closingCatalog,1);assert.equal(db.closingUserQuestions,0);
assert.equal(db.anonContextAllowed,false);assert.equal(db.authContextAllowed,true);
assert.equal(db.privateTables.length,2);assert.ok(db.privateTables.every(t=>t.rls&&!t.authSelect));
const edges=call(['functions','list','--project-ref',ref,'--output','json']);
const before=JSON.parse(fs.readFileSync('output/book-milestones-release-preflight/deployment-metadata.json'));
for(const b of before.edges){const e=edges.find(e=>e.slug===b.slug);assert.ok(e);for(const k of ['version','verify_jwt','ezbr_sha256'])assert.equal(e[k],b[k],`${b.slug}/${k}`);}
const secrets=call(['secrets','list','--project-ref',ref,'--output','json']).map(s=>s.name).sort();
assert.deepEqual(secrets,before.settingNames);assert.ok(!secrets.includes('FAMILY_PRODUCTION_ENABLED'));
const keys=call(['projects','api-keys','--project-ref',ref,'--output','json']),anon=keys.find(k=>k.name==='anon').api_key;
const rpc=await fetch(`https://${ref}.supabase.co/rest/v1/rpc/book_milestone_context`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${anon}`,'Content-Type':'application/json'},body:JSON.stringify({p:'00000000-0000-0000-0000-000000000000',q:'00000000-0000-0000-0000-000000000000'})});
assert.ok([401,403].includes(rpc.status));
const report={at:new Date().toISOString(),db,edgesUnchanged:before.edges.length,secretNamesUnchanged:true,familyServerFlag:'absent = OFF',anonymousRpcStatus:rpc.status};
fs.writeFileSync(`${dir}/postflight.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
