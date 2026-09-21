// READ ONLY audit of the two synthetic TEST journeys. No customer rows returned.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const ref='zpswxefgfabzvxdbtyvq',dir=process.env.QA_OUTPUT_DIR,cli=process.env.QA_SUPABASE_CLI;
assert.ok(dir&&cli);
const evidence=[];
for(const name of ['A','B']){
 const s=JSON.parse(fs.readFileSync(`${dir}/${name}-private.json`));
 assert.equal(s.ref,ref);assert.ok(/^[a-f0-9-]{36}$/.test(s.projectId));
 const raw=execFileSync(cli,['db','query','--linked','--project-ref',ref,`begin read only;
 select jsonb_build_object(
 'person_preserved',b.subject_person_id='${s.personId}'::uuid,
 'mother_account_absent',fb.subject_user_id is null,
 'paid_test_orders',(select count(*) from commerce_orders o where o.book_project_id=b.id and o.status='paid' and o.stripe_mode='test'),
 'paid_live_orders',(select count(*) from commerce_orders o where o.book_project_id=b.id and o.stripe_mode='live'),
 'trial_answers',(select count(distinct a.user_question_id) from answers a join user_questions q on q.id=a.user_question_id where a.book_project_id=b.id and q.meta_json->>'onboarding_group'='trial_experience'),
 'consent_valid',(select count(*) from family_production_consents c where c.project_id=b.id and c.person_id=b.subject_person_id and c.confirmed_by=b.owner_user_id and c.supporter_user_id=b.owner_user_id and c.subject_intent_confirmed and c.confirmed_at is not null and c.revoked_at is null),
 'audits',(select jsonb_agg(jsonb_build_object('event',e.event,'person_matches',e.person_id=b.subject_person_id,'actor_matches',e.actor_id=b.owner_user_id,'has_supporter',e.supporter_id is not null,'has_consent',e.consent_id is not null,'has_timestamp',e.created_at is not null)) from family_production_events e where e.project_id=b.id and e.event in('consent','starting_chapter','main_experience')),
 'book_confirmed',(select count(*) from book_work_manifests m where m.book_project_id=b.id and m.confirmed_at is not null)
 ) as evidence from book_projects b join family_subject_bindings fb on fb.person_id=b.subject_person_id
 where b.id='${s.projectId}' and b.title like '%E2E%';commit;`],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const result=JSON.parse(raw.slice(raw.indexOf('{')));assert.ok(!result.error);
 const e=result.rows[0]?.evidence;assert.ok(e,'Synthetic project must exist');
 assert.equal(e.person_preserved,true);assert.equal(e.mother_account_absent,true);
 assert.equal(e.paid_test_orders,1);assert.equal(e.paid_live_orders,0);
 assert.equal(e.trial_answers,name==='A'?3:0);assert.equal(e.consent_valid,1);assert.equal(e.book_confirmed,1);
 assert.equal(e.audits.length,3);assert.ok(e.audits.every(a=>a.person_matches&&a.actor_matches&&a.has_supporter&&a.has_consent&&a.has_timestamp));
 evidence.push({case:name,...e});
}
fs.writeFileSync(`${dir}/audit-evidence.json`,JSON.stringify({at:new Date().toISOString(),ref,readOnly:true,evidence},null,2));
console.log(JSON.stringify({remoteAuditPassed:true,readOnly:true,evidence}));
