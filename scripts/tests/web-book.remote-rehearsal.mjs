// TEST only: execute the exact migration batch inside one rolled-back transaction.
// Does not deploy functions, enable flags, or modify production/customer rows.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const ref='zpswxefgfabzvxdbtyvq',cli=process.env.QA_SUPABASE_CLI,dir=process.env.QA_PREFLIGHT_DIR;
assert.ok(cli);assert.ok(/^output\/[a-z0-9-]+$/.test(dir||''));
const schema=JSON.parse(readFileSync(`${dir}/test-schema.json`)),report=JSON.parse(readFileSync(`${dir}/web-book-rehearsal.json`));
assert.equal(schema.ref,ref);assert.ok(report.results.every(r=>r.pass));
assert.ok(Date.now()-Date.parse(schema.at)<60*60*1000,'Refresh the catalog first');
const files=report.migration.split(', ');
assert.deepEqual(files,['202609230001_web_book_preview.sql','202609230002_web_book_pin.sql','202609230003_web_book_admin_live.sql','202609230004_book_completion_candidates.sql','202609230005_completed_web_book_library.sql','202609230006_book_print_handoff.sql','202609230007_completed_work_sets.sql','202609230008_admin_customer_experience.sql']);
const sources=files.map(f=>readFileSync('supabase/migrations/'+f,'utf8'));
assert.equal(createHash('sha256').update(sources.join('\n')).digest('hex'),report.sha256,'Rehearse changed SQL locally first');
const literal=x=>"'"+x.replaceAll("'","''")+"'";
const guards=schema.functions.filter(f=>['can_manage_book_cover','family_creator','family_production_supporter','create_book_commerce_order','expire_commerce_order','get_book_work','confirm_book_work','list_voice_library'].includes(f.name)).map(f=>
 `if md5(pg_get_functiondef(${literal(f.signature)}::regprocedure))<>${literal(createHash('md5').update(f.definition).digest('hex'))} then raise exception 'TEST schema drift';end if;`).join('\n');
const source=sources.join('\n').replace(/^begin;\s*$/gm,'').replace(/^commit;\s*$/gm,'');
const sql=`begin;set local lock_timeout='3s';set local statement_timeout='60s';
do $$begin if to_regclass('public.book_completion_candidates') is not null then raise exception 'Already applied';end if;${guards}end $$;
${source}
select jsonb_build_object('completion_gate_closed',(select not enabled from public.book_completion_rollout),
 'candidates_empty',(select count(*)=0 from public.book_completion_candidates),
 'authenticated_cannot_finalize',not has_function_privilege('authenticated','public.complete_book_order(uuid)','execute'),
 'anonymous_cannot_private_read',not has_function_privilege('anon','public.can_read_private_web_book(uuid)','execute')) as checks;
rollback;`;
const raw=execFileSync(cli,['db','query','--linked','--project-ref',ref,sql],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:1024*1024,timeout:120000});
const response=JSON.parse(raw.slice(raw.indexOf('{')));assert.ok(!response.error,JSON.stringify(response.error));
assert.ok(response.rows?.[0]?.checks);assert.ok(Object.values(response.rows[0].checks).every(x=>x===true));
const verify=execFileSync(cli,['db','query','--linked','--project-ref',ref,"begin read only;select to_regclass('public.book_completion_candidates') is null and to_regprocedure('public.list_completed_web_book_library()') is null as rolled_back;commit;"],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
assert.equal(JSON.parse(verify.slice(verify.indexOf('{'))).rows[0].rolled_back,true);
const result={at:new Date().toISOString(),ref,sha256:report.sha256,checks:response.rows[0].checks,rolledBack:true,productionChanged:false,customerRowsChanged:false};
writeFileSync(`${dir}/test-transaction-rehearsal.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
