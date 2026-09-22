// Synthetic TEST only; no production connection and no email/SMS.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {adoptionSQL,protectedSnapshot,preUseRollbackSQL} from '../deploy/existing-supporter-adoption.mjs';
const ref='zpswxefgfabzvxdbtyvq',dir='output/existing-supporter',cli=process.env.QA_SUPABASE_CLI;
assert.ok(cli);fs.mkdirSync(dir,{recursive:true,mode:0o700});
const phase=process.argv[2],file=dir+'/state-private.json';
const raw=execFileSync(cli,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const keys=JSON.parse(raw.slice(raw.indexOf('[')));
const admin=createClient(`https://${ref}.supabase.co`,keys.find(k=>k.name==='service_role').api_key,{auth:{persistSession:false,autoRefreshToken:false}});
const anon=keys.find(k=>k.name==='anon').api_key;
const query=sql=>{
 const raw=execFileSync(cli,['db','query','--linked','--project-ref',ref,sql],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000});
 const result=JSON.parse(raw.slice(raw.indexOf('{')));if(result.error)throw Error(result.error.message);return result.rows;
};
const s=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{ref,actors:{},target:{person:randomUUID(),project:randomUUID(),supporter:randomUUID(),order:randomUUID()},family:randomUUID()};assert.equal(s.ref,ref);
const save=()=>fs.writeFileSync(file,JSON.stringify(s,null,2),{mode:0o600});
const client=async name=>{const c=createClient(`https://${ref}.supabase.co`,anon,{auth:{persistSession:false,autoRefreshToken:false}});const a=await c.auth.setSession(s.actors[name].session);assert.ifError(a.error);s.actors[name].session=a.data.session;save();return c;};
if(phase==='fixture'){
 assert.ok(!s.seeded,'Already seeded');
 for(const name of ['mother','daughter','viewer'])if(!s.actors[name]){
  const email=`qa-adopt-${name}-${randomUUID()}@example.invalid`,password=randomBytes(32).toString('base64url');
  // Synthetic users only, never customer's email/phone. No outbound messages.
  const u=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:`QA ${name}`}});assert.ifError(u.error);
  const c=createClient(`https://${ref}.supabase.co`,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const login=await c.auth.signInWithPassword({email,password});assert.ifError(login.error);
  s.actors[name]={id:u.data.user.id,email,session:login.data.session};save();
 }
 s.target.mother=s.actors.mother.id;s.target.daughter=s.actors.daughter.id;save();
 const t=s.target;
 query(`begin;
 insert into profiles(id,name,email,display_name) values('${t.mother}','QA 架空の母','${s.actors.mother.email}','QA 架空の母'),('${t.daughter}','QA 架空の娘','${s.actors.daughter.email}','QA 架空の娘') on conflict(id) do nothing;
 insert into families(id,name,owner_user_id) values('${s.family}','QA existing supporter','${t.mother}');
 insert into persons(id,family_id,display_name) values('${t.person}','${s.family}','既存移行 E2E 架空の母');
 insert into user_person_links(user_id,person_id,role) values('${t.mother}','${t.person}','self');
 insert into persons(family_id,display_name) values('${s.family}','QA 自分の物語未開始の娘');
 insert into user_person_links(user_id,person_id,role) select '${t.daughter}',id,'self' from persons where family_id='${s.family}' and display_name='QA 自分の物語未開始の娘';
 insert into book_projects(id,family_id,owner_user_id,subject_person_id,title,status,base_question_set_id,onboarding_status,onboarding_ritual_step)
 select '${t.project}','${s.family}','${t.mother}','${t.person}','既存移行 E2E 架空の母','active',id,'completed','completed' from question_sets where code='tateito_yokoito_standard_v2' order by version desc limit 1;
 insert into user_questions(user_id,book_project_id,question_id,sequence_order,is_active,question_text_snapshot,chapter_title_snapshot,meta_json)
 select '${t.mother}','${t.project}',i.question_id,i.sequence_order,i.is_active,i.question_text_snapshot,i.chapter_title_snapshot,i.meta_json from question_set_items i join book_projects b on b.base_question_set_id=i.question_set_id where b.id='${t.project}';
 insert into project_participants(book_project_id,user_id,person_id,role,invite_status) select '${t.project}','${t.mother}','${t.person}',r,'active' from unnest(array['owner','subject','speaker']) r;
 insert into project_supporters(id,book_project_id,supporter_user_id,supporter_person_id,granted_by_user_id,status,can_operate_recording,can_manage_photos,can_edit_book_text,can_build_book,can_view_raw_audio)
 select '${t.supporter}','${t.project}','${t.daughter}',person_id,'${t.mother}','active',true,true,true,true,false from user_person_links where user_id='${t.daughter}' and role='self';
 insert into project_invites(book_project_id,inviter_user_id,invitee_email,role,status,accepted_at,auto_share_on_accept,email_delivery_status)
 values('${t.project}','${t.mother}','${s.actors.daughter.email}','supporter','accepted',now(),true,'sent');
 insert into story_sharing_preferences(book_project_id,owner_person_id,live_scope,selected_sharing_enabled,family_sharing_enabled) values('${t.project}','${t.person}','selected',true,false);
 insert into story_share_recipients(sharing_preference_id,recipient_user_id,source,status) select id,'${t.daughter}','supporter','active' from story_sharing_preferences where book_project_id='${t.project}';
 insert into story_share_recipients(sharing_preference_id,recipient_user_id,source,status) select id,'${s.actors.viewer.id}','direct','active' from story_sharing_preferences where book_project_id='${t.project}';
 insert into commerce_orders(id,book_project_id,purchaser_user_id,order_type,product_code,status,amount_subtotal,amount_total,discount_amount,base_book_amount,stripe_mode)
 values('${t.order}','${t.project}','${t.mother}','self','self_book_v1','checkout_pending',49800,0,49800,49800,'test');
 select register_experience_contract('${t.order}');
 update commerce_orders set status='zero_paid',purchased_at=now() where id='${t.order}';
 select confirm_experience_payment('${t.order}',now());
 update book_projects set access_status='paid',product_code='self_book_v1',purchased_at=now(),purchaser_user_id='${t.mother}',commerce_order_id='${t.order}',theme_experience_state='{}'::jsonb where id='${t.project}';
 update experience_contracts set production_started_at=now(),production_expires_at=now()+interval '1 year',main_experience_started_at=now(),main_started_by='${t.mother}' where order_id='${t.order}';
 insert into answers(user_id,book_project_id,subject_person_id,user_question_id,question_id,sequence_order,transcript_raw,transcript_edited,access_override)
 select '${t.mother}','${t.project}','${t.person}',q.id,q.question_id,q.sequence_order,'QA既存の語り。子供のころ家族と庭で遊んだ思い出です。','QA既存の語り。子供のころ家族と庭で遊んだ思い出です。',case when q.sequence_order%2=0 then 'private_forever' else 'inherit' end from user_questions q where book_project_id='${t.project}' order by sequence_order limit 6;
 update user_questions set status='answered',answered_at=now() where book_project_id='${t.project}' and id in(select user_question_id from answers where book_project_id='${t.project}');
 commit;`);
 s.seeded=true;save();console.log('PASS synthetic fixture: existing mother/self + daughter/supporter + zero-paid self contract + six stories + unchanged Viewer relationship');
}else if(phase==='adopt'){
 assert.ok(s.seeded&&!s.adopted);
 const t=s.target;
 s.before=query(`begin read only;${protectedSnapshot(t)};commit;`)[0].snapshot;save();
 const gate=query('select enabled,allowed_actor_ids,subject_connection_enabled from family_private.rollout where id')[0];assert.equal(gate.enabled,true);assert.equal(gate.subject_connection_enabled,false);s.previousGate=gate;save();
 // TEST allowlist only; preserve other QA actors. No production configuration.
 query(`update family_private.rollout set allowed_actor_ids=array(select distinct unnest(allowed_actor_ids||array['${t.daughter}'::uuid])) where id;`);
 const sql=adoptionSQL(t,{test:true,operatorReference:'synthetic TEST runner',approvalReference:'TEST-only user-approved existing supporter rehearsal',expectedSnapshot:s.before});
 fs.writeFileSync(dir+'/adopt-test.sql',sql,{mode:0o600});query(sql);
 s.adopted=true;save();
 const m=await client('mother'),d=await client('daughter');
 const mw=await m.rpc('family_journey',{p:t.project});assert.ifError(mw.error);assert.equal(mw.data.role,'subject');assert.equal(mw.data.can_produce,true);
 const dw=await d.rpc('family_journey',{p:t.project});assert.ifError(dw.error);assert.equal(dw.data.role,'supporter');assert.equal(dw.data.can_produce,false);
 assert.deepEqual(query(`begin read only;${protectedSnapshot(t)};commit;`)[0].snapshot,s.before);
 console.log('PASS adopted without changing protected records; existing mother retained; supporter requires explicit consent');
}else if(phase==='negative'){
 const t=s.target,before=query(`begin read only;${protectedSnapshot(t)};commit;`)[0].snapshot;
 const options={test:true,operatorReference:'negative TEST runner',approvalReference:'TEST-only rejection test',expectedSnapshot:before};
 assert.throws(()=>adoptionSQL({...t,project:randomUUID()},{...options,test:false}),/Only this/);
 assert.throws(()=>query(adoptionSQL(t,{...options,expectedSnapshot:{...before,answers:'DRIFT'}})),/Snapshot drift/);
 assert.throws(()=>query(adoptionSQL(t,options)),/Already adopted/);
 assert.throws(()=>query(preUseRollbackSQL(t,options)),/Already used/,'Never undo identity guards after consent');
 assert.deepEqual(query(`begin read only;${protectedSnapshot(t)};commit;`)[0].snapshot,before);
 console.log('PASS production scope rejection / drift rejection / duplicate adoption rejection, no protected mutations');
}else if(phase==='evidence'){
 const t=s.target,now=query(`begin read only;${protectedSnapshot(t)};commit;`)[0].snapshot;
 const unchanged=['persons','links','profiles','accounts','supporters','invites','participants','sharing','recipients','contracts'];
 for(const key of unchanged)assert.equal(now[key],s.before[key],`Protected ${key}`);
 const originalHashes=query(`begin read only;select jsonb_build_object('orders',(select md5(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text)::text) from(select * from commerce_orders where id='${t.order}')x),'answers',(select md5(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text)::text) from(select * from answers where book_project_id='${t.project}' and user_id='${t.mother}' and transcript_raw like 'QA既存%')x)) as hashes;commit;`)[0].hashes;
 assert.equal(originalHashes.orders,s.before.orders,'Original order byte-preserved');
 // UI deliberately edits one original story and attaches a photo. The migration
 // itself was byte-checked before those authorized edits; keep raw/source rows.
 const e=query(`begin read only;select jsonb_build_object('binding',(select jsonb_build_object('same_person',person_id='${t.person}'::uuid,'same_mother',subject_user_id='${t.mother}'::uuid) from family_subject_bindings where person_id='${t.person}'),'original_order',(select status='zero_paid' and purchaser_user_id='${t.mother}'::uuid and stripe_mode='test' from commerce_orders where id='${t.order}'),'project_identity',(select subject_person_id='${t.person}'::uuid and owner_user_id='${t.mother}'::uuid and purchaser_user_id='${t.mother}'::uuid and commerce_order_id='${t.order}'::uuid from book_projects where id='${t.project}'),'original_answers',(select count(*) from answers where book_project_id='${t.project}' and user_id='${t.mother}' and transcript_raw like 'QA既存%'),'daughter_own_answers',(select count(*) from answers a join book_projects b on b.id=a.book_project_id join user_person_links l on l.person_id=b.subject_person_id and l.role='self' where l.user_id='${t.daughter}'),'consent_audit',(select jsonb_agg(jsonb_build_object('event',event,'actor',actor_id,'person',person_id,'has_timestamp',created_at is not null)) from family_production_events where project_id='${t.project}'),'books',(select count(*) from book_work_manifests where book_project_id='${t.project}' and confirmed_at is not null),'orders',(select jsonb_agg(jsonb_build_object('type',order_type,'mode',stripe_mode,'status',status)) from commerce_orders where book_project_id='${t.project}')) as evidence;commit;`)[0].evidence;
 assert.equal(e.original_order,true);assert.equal(e.project_identity,true);assert.equal(e.original_answers,6);assert.equal(e.daughter_own_answers,0);assert.equal(e.books,1);
 assert.equal(e.binding.same_mother,true);assert.equal(e.binding.same_person,true);
 assert.ok(e.orders.every(o=>o.mode==='test'));
 assert.ok(e.consent_audit.some(a=>a.event==='consent'&&a.actor===t.daughter&&a.person===t.person&&a.has_timestamp));
 assert.ok(e.consent_audit.some(a=>a.event==='revoke'&&a.actor===t.mother&&a.person===t.person&&a.has_timestamp));
 fs.writeFileSync(dir+'/evidence.json',JSON.stringify({ref,unchanged,e},null,2));console.log(JSON.stringify({pass:true,ref,unchanged,e}));
}else throw Error('Use fixture / adopt / evidence');
