// Explicit, single-migration production release. No Edge/rollout/customer enrollment changes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const action=process.argv[2];assert.ok(['--prepare','--apply'].includes(action));
const ref='wquxjeqkumossjxehdop',dir='output/book-milestones-production-release';
fs.mkdirSync(dir,{recursive:true,mode:0o700});
const preflight='output/book-milestones-release-preflight';
const schema=JSON.parse(fs.readFileSync(`${preflight}/production-schema.json`));assert.equal(schema.ref,ref);
const rehearsal=JSON.parse(fs.readFileSync(`${preflight}/rehearsal.json`));
const source=fs.readFileSync('supabase/migrations/202609220002_book_milestones.sql','utf8');
const hash=createHash('sha256').update(source).digest('hex');assert.equal(hash,rehearsal.sha256);
assert.ok(rehearsal.results.some(r=>r.label==='production'&&r.pass&&r.sourceCapturedAt===schema.at));
const lit=s=>"'"+s.replaceAll("'","''")+"'";
const guard=schema.functions.map(f=>`if md5(pg_get_functiondef(${lit(f.signature)}::regprocedure))<>${lit(createHash('md5').update(f.definition).digest('hex'))} then raise exception 'Function drift: %',${lit(f.signature)};end if;`).join('\n');
const tables=['book_projects','answers','media_assets','video_stories','commerce_orders','experience_contracts','book_work_manifests','family_subject_bindings','family_production_consents'];
const snapshots=tables.map(t=>`select '${t}' as name,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as digest from public.${t} t`);
// Only the explicitly intended ONB04 capability/pending-prompt changes are excluded.
snapshots.push(`select 'user_questions',md5(coalesce(jsonb_agg(case when t.question_id='TY_ONB04' then
 (to_jsonb(t)-'meta_json'-'question_text_snapshot') || jsonb_build_object('meta_json',t.meta_json-'answer_formats'-'video_slot_key'-'include_in_story_list','answered_prompt',case when t.status='answered' or t.answered_at is not null then t.question_text_snapshot else null end)
 else to_jsonb(t) end order by t.id)::text,'[]')) from user_questions t`);
snapshots.push(`select 'rollout',md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from family_private.rollout t`);
const comparison=snapshots.join('\nunion all\n');
const sql=`begin;set local lock_timeout='3s';set local statement_timeout='60s';
lock table ${[...tables,'user_questions','questions','question_set_items'].map(t=>'public.'+t).join(',')},family_private.rollout in share row exclusive mode;
do $$begin
 if exists(select 1 from supabase_migrations.schema_migrations where version='202609220002') then raise exception 'Already applied';end if;
 if (select count(*) from supabase_migrations.schema_migrations)<>${schema.migrations.length} then raise exception 'Migration history drift';end if;
 if exists(select 1 from family_private.rollout where enabled or subject_connection_enabled or cardinality(allowed_actor_ids)>0) then raise exception 'Family gate drift';end if;
 ${guard}
end $$;
create temp table milestone_protected_before on commit drop as ${comparison};
${source.replace(/^begin;$/gm,'').replace(/^commit;$/gm,'')}
create temp table milestone_protected_after on commit drop as ${comparison};
do $$begin if exists(select * from milestone_protected_before except select * from milestone_protected_after) then raise exception 'Existing customer data changed unexpectedly';end if;end $$;
insert into supabase_migrations.schema_migrations(version,name,statements) values('202609220002','book_milestones',array[${lit(source)}]);
select jsonb_build_object('existingDataPreserved',true,'protectedSets',(select count(*) from milestone_protected_before),'migration','202609220002','rolloutOpened',false) as verification;
commit;`;
fs.writeFileSync(`${dir}/apply.sql`,sql,{mode:0o600});
if(action==='--prepare'){console.log(JSON.stringify({prepared:true,ref,sha256:hash,protectedSets:snapshots.length,applied:false}));process.exit(0);}
assert.ok(Date.now()-Date.parse(schema.at)<60*60*1000,'Refresh production preflight before applying');
const cli=process.env.QA_SUPABASE_CLI;assert.ok(cli);
const raw=execFileSync(cli,['db','query','--linked','--project-ref',ref,sql],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:4*1024*1024});
const result=JSON.parse(raw.slice(raw.indexOf('{')));assert.ok(!result.error,result.error?.message);
assert.equal(result.rows[0]?.verification?.existingDataPreserved,true);
const report={at:new Date().toISOString(),ref,sha256:hash,...result.rows[0].verification};
fs.writeFileSync(`${dir}/db-applied.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
