// Explicit TEST-only migration, no rollout, Auth or production changes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const ref='zpswxefgfabzvxdbtyvq',cli=process.env.QA_SUPABASE_CLI;
assert.equal(process.argv[2],'--apply-test');assert.ok(cli);
const query=sql=>{
 const raw=execFileSync(cli,['db','query','--linked','--project-ref',ref,sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const result=JSON.parse(raw.slice(raw.indexOf('{')));if(result.error)throw Error(result.error.message);return result.rows;
};
const migrations={
 '--audit-key':['202609210004','production_start_audit_key'],
 '--separate-authority':['202609210005','separate_production_mode_and_authority'],
 '--preserve-sms':['202609210006','preserve_supporter_sms_compatibility'],
};
assert.ok(!process.argv[3]||migrations[process.argv[3]],'Explicit known TEST migration required');
const [version,name]=migrations[process.argv[3]]||['202609210003','production_supporter'];
const patch=version!=='202609210003';
const pre=query(`select to_regprocedure('public.family_revise_voice(uuid,uuid,uuid[],text,jsonb,text)') as prerequisite,
 to_regclass('public.family_production_consents') as applied`)[0];
assert.ok(pre.prerequisite);
if(patch){assert.ok(pre.applied);assert.equal(query(`select version from supabase_migrations.schema_migrations where version='${version}'`).length,0);}
else assert.equal(pre.applied,null,'Already applied: inspect, do not overwrite');
if(version>='202609210005')assert.equal(query(`select version from supabase_migrations.schema_migrations where version='${version==='202609210005'?'202609210004':'202609210005'}'`).length,1,'Previous reviewed migration required');
const source=fs.readFileSync(`supabase/migrations/${version}_${name}.sql`,'utf8');
const literal=s=>"'"+s.replaceAll("'","''")+"'";
query(`begin;set local lock_timeout='3s';set local statement_timeout='60s';
${source.replace(/^begin;$/gm,'').replace(/^commit;$/gm,'')}
insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${literal(source)}]);commit;`);
console.log(JSON.stringify({ref,migration:version,productionChanged:false,authChanged:false,rolloutChanged:false}));
