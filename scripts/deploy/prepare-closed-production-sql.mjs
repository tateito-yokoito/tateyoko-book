// Produces an explicit manifest/SQL file; never connects to a database.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
assert.equal(process.argv[2],'--closed');
const dir='output/closed-production-release',report=JSON.parse(fs.readFileSync('output/supporter-preflight/rehearsal-report.json')),prod=JSON.parse(fs.readFileSync('output/supporter-preflight/production-schema.json'));
assert.equal(prod.ref,'wquxjeqkumossjxehdop');assert.equal(report.sourceCapturedAt,prod.at);assert.equal(report.pass,true);assert.equal(report.applied.length,17);
assert.deepEqual(report.initialReleaseGate,{enabled:false,allowlist_count:0,subject_connection_enabled:false});assert.deepEqual(report.remainingFunctionDifferences,[]);
assert.equal(execFileSync('git',['diff','5ea27a8eb7f8ee551ed1949ceedd51934faf6937','--','supabase/migrations'],{encoding:'utf8'}),'');
const quote=s=>"'"+s.replaceAll("'","''")+"'",hash=(s,alg='sha256')=>createHash(alg).update(s).digest('hex');
const functionChecks=prod.functions.map(f=>`if to_regprocedure(${quote(f.signature)}) is null or md5(pg_get_functiondef(to_regprocedure(${quote(f.signature)}))) is distinct from ${quote(hash(f.definition,'md5'))} then raise exception 'Production function drift: %',${quote(f.signature)};end if;`).join('\n');
let sql=`-- APPROVED CLOSED RELEASE ONLY. Explicit production project ref required by caller.\nbegin;\nset local lock_timeout='3s';\nset local statement_timeout='60s';\nselect pg_advisory_xact_lock(260922001);\ndo $guard$ begin\nif (select count(*) from supabase_migrations.schema_migrations)<>${prod.migrations.length} then raise exception 'Migration ledger drift';end if;\nif to_regclass('public.family_subject_bindings') is not null then raise exception 'Family already exists; inspect, never reapply';end if;\n${functionChecks}\nend $guard$;\n`;
for(const {name,sha256} of report.migrationHashes){
 assert.match(name,/^202609\d{6}_[a-z0-9_]+\.sql$/);const source=fs.readFileSync('supabase/migrations/'+name,'utf8');assert.equal(hash(source),sha256);
 assert.equal((source.match(/^begin;$/gm)||[]).length,1);assert.equal((source.match(/^commit;$/gm)||[]).length,1);
 const [version,...parts]=name.slice(0,-4).split('_');assert.ok(!prod.migrations.some(m=>m.version===version));
 sql+=`\n-- ${name} sha256:${sha256}\n`+source.replace(/^begin;$/gm,'').replace(/^commit;$/gm,'')+`\ninsert into supabase_migrations.schema_migrations(version,name,statements) values(${quote(version)},${quote(parts.join('_'))},array[${quote(source)}]);\n`;
}
sql+=`do $closed$ begin
 if (select count(*) from family_private.rollout)<>1 or not exists(select 1 from family_private.rollout where id and not enabled and cardinality(allowed_actor_ids)=0 and not subject_connection_enabled) then raise exception 'Release is not closed';end if;
 if exists(select 1 from family_subject_bindings) or exists(select 1 from family_production_consents) then raise exception 'Unexpected family enrollment';end if;
 if has_function_privilege('anon','public.family_release_actor_allowed(uuid,uuid)','execute') then raise exception 'Anonymous release RPC grant';end if;
 if (select count(*) from supabase_migrations.schema_migrations)<>${prod.migrations.length+17} then raise exception 'Unexpected ledger count';end if;
end $closed$;
select jsonb_build_object('rollout',enabled,'allowlist_count',cardinality(allowed_actor_ids),'C',subject_connection_enabled,'migration_count',(select count(*) from supabase_migrations.schema_migrations)) as closed_release from family_private.rollout where id;
commit;
`;
fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.writeFileSync(`${dir}/apply-closed.sql`,sql,{mode:0o600});
fs.writeFileSync(`${dir}/migration-manifest.json`,JSON.stringify({at:new Date().toISOString(),ref:prod.ref,sourceCapturedAt:prod.at,sqlSha256:hash(sql),migrations:report.migrationHashes,closed:true,applied:false},null,2));
console.log(JSON.stringify({prepared:true,migrations:17,sqlBytes:Buffer.byteLength(sql),sqlSha256:hash(sql),remoteWrites:false}));
