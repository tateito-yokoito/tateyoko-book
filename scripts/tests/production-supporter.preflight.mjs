// Metadata only. Both remote transactions are READ ONLY; no application RPCs.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const cli=process.env.QA_SUPABASE_CLI;assert.ok(cli);
assert.equal(process.argv[2],'--read-only');
const dir='output/supporter-preflight';mkdirSync(dir,{recursive:true,mode:0o700});
const sql=`begin read only;set local statement_timeout='15s';
select jsonb_build_object(
 'read_only',current_setting('transaction_read_only'),
 'indexConflicts',jsonb_build_object(
  'project_question',(select count(*) from (select 1 from public.user_questions where book_project_id is not null group by book_project_id,question_id having count(*)>1) x),
  'project_sequence',(select count(*) from (select 1 from public.user_questions where book_project_id is not null group by book_project_id,sequence_order having count(*)>1) x),
  'unassigned_question',(select count(*) from (select 1 from public.user_questions where book_project_id is null group by user_id,question_id having count(*)>1) x),
  'unassigned_sequence',(select count(*) from (select 1 from public.user_questions where book_project_id is null group by user_id,sequence_order having count(*)>1) x)),
 'migrations',(select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations),
 'tables',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','family_private') and c.relkind='r'),
 'columns',(select jsonb_agg(to_jsonb(c)) from information_schema.columns c where table_schema in('public','family_private')),
 'sequences',(select jsonb_agg(jsonb_build_object('schema',schemaname,'name',sequencename)) from pg_sequences where schemaname in('public','family_private')),
 'enums',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.typname,'label',e.enumlabel,'order',e.enumsortorder)) from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace where n.nspname in('public','family_private')),
 'constraints',(select jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'def',pg_get_constraintdef(oid))) from pg_constraint where connamespace in(select oid from pg_namespace where nspname in('public','family_private')) and conrelid<>0),
 'indexes',(select jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(i.indexrelid))) from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','family_private') and not exists(select 1 from pg_constraint k where k.conindid=i.indexrelid)),
 'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname in('public','storage','family_private')),
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'authenticated',has_function_privilege('authenticated',p.oid,'execute'),'anon',has_function_privilege('anon',p.oid,'execute'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','family_private') and p.prokind='f'),
 'triggers',(select jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'definition',pg_get_triggerdef(t.oid))) from pg_trigger t where not t.tgisinternal and tgrelid in(select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','auth','family_private')))
) as schema;commit;`;
for(const [label,ref] of Object.entries({test:'zpswxefgfabzvxdbtyvq',production:'wquxjeqkumossjxehdop'})){
 const raw=execFileSync(cli,['db','query','--linked','--project-ref',ref,sql],{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});
 const response=JSON.parse(raw.slice(raw.indexOf('{')));assert.ok(!response.error);
 const schema=response.rows[0].schema;assert.equal(schema.read_only,'on');
 writeFileSync(`${dir}/${label}-schema.json`,JSON.stringify({ref,at:new Date().toISOString(),...schema},null,2),{mode:0o600});
 console.log(JSON.stringify({label,readOnly:true,tables:schema.tables.length,functions:schema.functions.length,migrations:schema.migrations.length}));
}
// Deployment metadata and configuration NAMES only, never secret values.
const ref='wquxjeqkumossjxehdop';
const list=(command)=>{
 const raw=execFileSync(cli,[...command,'--project-ref',ref,'--output','json'],{encoding:'utf8',maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']});
 return JSON.parse(raw.slice(raw.indexOf('[')));
};
const names=['create-checkout-session','sync-checkout-session','stripe-webhook','transcribe-audio','polish-transcript','publish-voice-edition','export-experience-data','request-experience-refund'];
const edges=list(['functions','list']).filter(f=>names.includes(f.slug)).map(({slug,version,verify_jwt,ezbr_sha256})=>({slug,version,verify_jwt,ezbr_sha256}));
const settings=list(['secrets','list']).map(x=>x.name).sort();
writeFileSync(`${dir}/deployment-metadata.json`,JSON.stringify({at:new Date().toISOString(),ref,edges,settingNames:settings,valuesRead:false},null,2),{mode:0o600});
console.log(JSON.stringify({edgeMetadata:edges.length,settingNames:settings.length,secretValuesRead:false}));
