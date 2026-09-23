// Apply only the rehearsed Web-book batch to remote TEST, with all release
// switches closed. Never use this script against production.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
assert.equal(process.argv[2], '--apply-test');
const ref = 'zpswxefgfabzvxdbtyvq';
const cli = process.env.QA_SUPABASE_CLI;
const dir = 'output/web-book-lifecycle-preflight';
assert.ok(cli);
const schema = JSON.parse(readFileSync(`${dir}/test-schema.json`));
const rehearsal = JSON.parse(readFileSync(`${dir}/web-book-rehearsal.json`));
const remote = JSON.parse(readFileSync(`${dir}/test-transaction-rehearsal.json`));
assert.equal(schema.ref, ref);
assert.ok(Date.now() - Date.parse(schema.at) < 60 * 60 * 1000, 'Refresh TEST catalog');
assert.ok(rehearsal.results.length === 2 && rehearsal.results.every(item => item.pass));
assert.equal(remote.ref, ref);
assert.equal(remote.sha256, rehearsal.sha256);
assert.equal(remote.rolledBack, true);
const files = rehearsal.migration.split(', ');
assert.equal(files.length, 8);
assert.ok(files.every((file, index) => file.startsWith(`20260923000${index + 1}_`)));
const sources = files.map(file => readFileSync(`supabase/migrations/${file}`, 'utf8'));
assert.equal(createHash('sha256').update(sources.join('\n')).digest('hex'), rehearsal.sha256);
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const guardedFunctions = schema.functions.filter(item => [
  'can_manage_book_cover', 'family_creator', 'family_production_supporter',
  'create_book_commerce_order', 'expire_commerce_order', 'get_book_work',
  'confirm_book_work', 'list_voice_library'
].includes(item.name));
const guards = guardedFunctions.map(item => {
  const hash = createHash('md5').update(item.definition).digest('hex');
  return `if md5(pg_get_functiondef(${literal(item.signature)}::regprocedure))<>${literal(hash)} then raise exception 'TEST function drift';end if;`;
}).join('\n');
const source = sources.join('\n').replace(/^begin;\s*$/gm, '').replace(/^commit;\s*$/gm, '');
const registrations = files.map((file, index) => {
  const [version, ...name] = file.replace(/\.sql$/, '').split('_');
  return `insert into supabase_migrations.schema_migrations(version,name,statements)
    values(${literal(version)},${literal(name.join('_'))},array[${literal(sources[index])}]);`;
}).join('\n');
const sql = `begin;set local lock_timeout='3s';set local statement_timeout='90s';
do $$begin
 if to_regclass('public.book_completion_candidates') is not null then raise exception 'Already applied';end if;
 ${files.map(file => `if exists(select 1 from supabase_migrations.schema_migrations where version=${literal(file.slice(0, 12))}) then raise exception 'Version already applied';end if;`).join('\n')}
 ${guards}
end $$;
${source}
${registrations}
select jsonb_build_object('rollout_off',(select not enabled from public.book_completion_rollout),
 'candidates_empty',(select count(*)=0 from public.book_completion_candidates),
 'print_handoff_service_only',not has_function_privilege('authenticated','public.get_book_print_handoff(uuid)','execute'),
 'customer_review_admin_checked',has_function_privilege('authenticated','public.get_admin_customer_experience(uuid)','execute')) as checks;
commit;`;
const raw = execFileSync(cli, ['db', 'query', '--linked', '--project-ref', ref, sql], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024, timeout: 150000
});
const response = JSON.parse(raw.slice(raw.indexOf('{')));
assert.ok(!response.error, response.error?.message);
assert.ok(response.rows?.[0]?.checks && Object.values(response.rows[0].checks).every(Boolean));
const result = { at: new Date().toISOString(), ref, files, sha256: rehearsal.sha256,
  checks: response.rows[0].checks, productionChanged: false, rolloutEnabled: false };
writeFileSync(`${dir}/test-applied.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
