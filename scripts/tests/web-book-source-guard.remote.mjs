// Remote TEST only. Migration rehearsal rolls back; application is explicit.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

const ref = 'zpswxefgfabzvxdbtyvq';
const mode = process.argv[2];
assert.ok(['--dry-run', '--apply-test'].includes(mode));
const cli = process.env.QA_SUPABASE_CLI;
assert.ok(cli);
const name = process.argv[3] === '--legacy-compat'
  ? '202609240002_publication_legacy_question_compat'
  : '202609240001_publication_source_asset_guard';
const source = readFileSync(`supabase/migrations/${name}.sql`, 'utf8')
  .replace(/^begin;\s*$/gm, '').replace(/^commit;\s*$/gm, '');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const sql = `begin; set local lock_timeout='3s'; set local statement_timeout='90s';
do $$begin
 if ${name.includes('0002') ? "to_regprocedure('public.publication_source_asset_allowed(uuid,text,text,text,uuid)') is null" : "to_regprocedure('public.publication_source_asset_allowed(uuid,text,text,text,uuid)') is not null"}
 or exists(select 1 from supabase_migrations.schema_migrations where version='${name.slice(0,12)}')
 then raise exception 'Migration already present'; end if;
end $$;
${source}
select to_regprocedure('public.publication_source_asset_allowed(uuid,text,text,text,uuid)') is not null
 and not has_function_privilege('authenticated','public.publication_source_asset_allowed(uuid,text,text,text,uuid)','execute')
 as guarded;
${mode === '--apply-test' ? `insert into supabase_migrations.schema_migrations(version,name,statements)
 values('${name.slice(0,12)}','${name.slice(13)}',array[${literal(readFileSync(`supabase/migrations/${name}.sql`, 'utf8'))}]);` : ''}
${mode === '--apply-test' ? 'commit;' : 'rollback;'}`;
const raw = execFileSync(cli, ['db','query','--linked','--project-ref',ref,sql],
  {encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:2_000_000,timeout:120_000});
const response = JSON.parse(raw.slice(raw.indexOf('{')));
assert.ok(!response.error, response.error?.message);
assert.equal(response.rows?.[0]?.guarded,true);
console.log(JSON.stringify({testOnly:true,mode,guarded:true,productionChanged:false}));
