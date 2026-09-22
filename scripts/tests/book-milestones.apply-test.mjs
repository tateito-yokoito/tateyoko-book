// Only remote TEST, only this migration, after current-schema local rehearsal.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
assert.equal(process.argv[2],'--apply-test');
const cli=process.env.QA_SUPABASE_CLI;assert.ok(cli);
const ref='zpswxefgfabzvxdbtyvq',dir='output/book-milestones-preflight';
const version='202609220002',name='book_milestones';
const source=fs.readFileSync(`supabase/migrations/${version}_${name}.sql`,'utf8');
const report=JSON.parse(fs.readFileSync(`${dir}/rehearsal.json`));
assert.equal(report.sha256,createHash('sha256').update(source).digest('hex'));
assert.ok(report.results.length===2 && report.results.every(r=>r.pass));
const schema=JSON.parse(fs.readFileSync(`${dir}/test-schema.json`));
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const guard=schema.functions.filter(f=>['video_delivery_path_allowed','guard_experience_content_write','family_journey'].includes(f.name)).map(f=>{
 const md5=createHash('md5').update(f.definition).digest('hex');
 return `if md5(pg_get_functiondef(${literal(f.signature)}::regprocedure))<>${literal(md5)} then raise exception 'TEST function drift';end if;`;
}).join('\n');
const sql=`begin;set local lock_timeout='3s';set local statement_timeout='60s';
do $$begin if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then raise exception 'Already applied';end if;${guard}end $$;
${source.replace(/^begin;$/gm,'').replace(/^commit;$/gm,'')}
insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${literal(source)}]);commit;`;
const raw=execFileSync(cli,['db','query','--linked','--project-ref',ref,sql],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000});
const result=JSON.parse(raw.slice(raw.indexOf('{')));assert.ok(!result.error,result.error?.message);
fs.writeFileSync(`${dir}/test-applied.json`,JSON.stringify({at:new Date().toISOString(),ref,version,sha256:report.sha256,productionChanged:false},null,2));
console.log('PASS TEST migration only; no production, account, rollout or frontend changes');
