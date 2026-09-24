// Apply this one additive migration to TEST only, after a rollback rehearsal.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const ref='zpswxefgfabzvxdbtyvq',mode=process.argv[2],file='202609240003_book_completion_account_rollout.sql';
assert.ok(['--rehearse','--apply-test'].includes(mode));
const cli=process.env.QA_SUPABASE_CLI;assert.ok(cli);
const source=fs.readFileSync(`supabase/migrations/${file}`,'utf8');
const inner=source.replace(/^begin;\s*$/gm,'').replace(/^commit;\s*$/gm,'');
const literal=s=>`'${String(s).replaceAll("'","''")}'`;
const sql=`begin;set local lock_timeout='3s';set local statement_timeout='90s';
do $$begin
 if to_regclass('public.book_completion_rollout') is null
 or exists(select 1 from supabase_migrations.schema_migrations where version='202609240003')
 then raise exception 'Unexpected TEST catalog';end if;
end $$;
${inner}
select jsonb_build_object(
 'global_off',(select not enabled from public.book_completion_rollout),
 'allowlist_empty',(select cardinality(allowed_account_ids)=0 from public.book_completion_rollout),
 'client_no_list',not has_table_privilege('authenticated','public.book_completion_rollout','SELECT'),
 'service_only',not has_function_privilege('authenticated','public.book_completion_account_allowed(uuid)','execute'),
 'client_capability',has_function_privilege('authenticated','public.can_use_book_completion(uuid)','execute'),
 'prepare_guard',position('book_completion_account_allowed' in pg_get_functiondef('public.prepare_book_completion(uuid,integer,boolean,text,boolean)'::regprocedure))>0,
 'checkout_guard',position('book_completion_account_allowed' in pg_get_functiondef('public.create_book_completion_order(uuid,uuid,text,integer,integer,boolean,jsonb)'::regprocedure))>0
) as checks;
${mode==='--apply-test'?`insert into supabase_migrations.schema_migrations(version,name,statements)
 values('202609240003','book_completion_account_rollout',array[${literal(source)}]);commit;`:'rollback;'}`;
const raw=execFileSync(cli,['db','query','--linked','--project-ref',ref,sql],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:3000000});
const response=JSON.parse(raw.slice(raw.indexOf('{')));assert.ok(!response.error,response.error?.message);
const checks=response.rows?.[0]?.checks;assert.ok(checks&&Object.values(checks).every(Boolean),JSON.stringify(checks));
console.log(JSON.stringify({testOnly:true,mode,checks,productionChanged:false}));
