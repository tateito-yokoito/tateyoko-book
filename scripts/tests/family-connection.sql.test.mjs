// Uses schema metadata only, captured by family-schema.remote.mjs (no user rows).
// Auth/JWT values are fixtures; this is not a real SMS/browser E2E.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const runtime = process.env.QA_PGLITE_PATH;
const { PGlite } = await import(runtime || '@electric-sql/pglite');
const { pgcrypto } = await import(runtime ? new URL('./contrib/pgcrypto.js', pathToFileURL(runtime)).href : '@electric-sql/pglite/contrib/pgcrypto');
const db = new PGlite({ extensions: { pgcrypto } });
const schema = JSON.parse(await readFile(new URL('./fixtures/family-baseline-schema.json', import.meta.url)));
const quote = x => '"' + x.replaceAll('"', '""') + '"';
export const id = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let checks = 0;
const ok = (x, message) => { assert.ok(x, message); checks++; };
const rejects = async (fn, match) => { await assert.rejects(fn, match); checks++; };
const val = async (sql, args=[]) => (await db.query(sql,args)).rows[0]?.value;
await db.exec(`
 create schema auth; create schema storage; create schema extensions;
 create extension pgcrypto with schema extensions;
 create role authenticated; create role anon; create role service_role bypassrls;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb$$;
 create function auth.role() returns text language sql as $$select current_user::text$$;
 create table auth.users(id uuid primary key, email text, phone text, phone_confirmed_at timestamptz, last_sign_in_at timestamptz, raw_user_meta_data jsonb default '{}');
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb,created_at timestamptz default now());
 create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
 create sequence commerce_order_number_seq;
 set check_function_bodies=off;
`);
const grouped = Map.groupBy(schema.columns, c=>c.table_name);
for (const [table, cols] of grouped) {
 await db.exec(`create table public.${quote(table)} (${cols.sort((a,b)=>a.ordinal_position-b.ordinal_position).map(c=>
  `${quote(c.column_name)} ${c.udt_name.startsWith('_')?c.udt_name.slice(1)+'[]':c.udt_name}${c.column_default?' default '+c.column_default:''}${c.is_nullable==='NO'?' not null':''}`).join(',')})`);
}
for (const c of schema.constraints) await db.exec(`alter table ${quote(c.table)} add constraint ${quote(c.name)} ${c.def}`);
for (const f of schema.functions) await db.exec(f.definition);
for (const t of schema.triggers) await db.exec(t.definition);
for (const p of schema.policies) {
 await db.exec(`alter table ${quote(p.schemaname)}.${quote(p.tablename)} enable row level security`);
 await db.exec(`create policy ${quote(p.policyname)} on ${quote(p.schemaname)}.${quote(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(quote).join(',')}${p.qual?' using ('+p.qual+')':''}${p.with_check?' with check ('+p.with_check+')':''}`);
}
await db.exec('set check_function_bodies=on; grant usage on schema public,auth,storage,extensions to authenticated,anon,service_role; grant all on all tables in schema public,storage to authenticated; grant usage on all sequences in schema public to authenticated;');
for (const name of ['202609170002_family_subject_connection.sql','202609170003_family_subject_rls.sql','202609170004_family_legacy_guards.sql','202609170005_family_creation_payer_guard.sql','202609170006_family_paid_journey.sql','202609170007_family_journey_guards.sql','202609170008_family_voice_adapter.sql','202609170009_family_photo_voice.sql','202609170010_family_story_editor.sql','202609170011_family_voice_revision.sql']) {
 await db.exec(await readFile(new URL('../../supabase/migrations/'+name, import.meta.url),'utf8'));
}
const as = async n => { await db.exec(`reset role; set test.uid='${id(n)}'; select set_config('test.jwt',jsonb_build_object('sub','${id(n)}','amr',jsonb_build_array(jsonb_build_object('method','otp','timestamp',extract(epoch from now()))))::text,false); set role authenticated;`); };
const admin = async sql => { await db.exec('reset role;'); await db.exec(sql); };
await admin(`
 insert into auth.users(id,email,phone,phone_confirmed_at,last_sign_in_at) values
 ('${id(1)}','fixture-daughter@example.invalid',null,null,now()),
 ('${id(2)}',null,'819000000002',now(),now()),
 ('${id(3)}',null,'819000000003',now(),now());
 insert into profiles(id,name,email) values ('${id(1)}','娘','fixture-daughter@example.invalid');
 insert into families(id,name,owner_user_id) values('${id(10)}','TEST family','${id(1)}');
 insert into persons(id,family_id,display_name) values('${id(11)}','${id(10)}','娘'),('${id(12)}','${id(10)}','母');
 insert into user_person_links(user_id,person_id,role) values('${id(1)}','${id(11)}','self');
 insert into book_projects(id,family_id,owner_user_id,purchaser_user_id,subject_person_id,title,status,onboarding_preferences)
 values('${id(20)}','${id(10)}','${id(1)}','${id(1)}','${id(12)}','母の物語','active','{"support_mode":"child_led"}'),
 ('${id(21)}','${id(10)}','${id(1)}','${id(1)}','${id(11)}','自分の物語','active','{}');
 insert into project_supporters(book_project_id,supporter_user_id,granted_by_user_id,status,can_operate_recording,can_manage_photos)
 values('${id(20)}','${id(1)}','${id(1)}','active',true,true);
 insert into questions(id,sequence_order,chapter,content) values('TEST_Q1',1,'TEST','幼い頃のこと'),('TEST_Q2',2,'TEST','次の問い'),('SELF_Q',3,'TEST','自分の問い');
 insert into user_questions(id,user_id,book_project_id,question_id,sequence_order,is_active,question_text_snapshot,status)
 values('${id(30)}','${id(1)}','${id(20)}','TEST_Q1',9011,true,'幼い頃のこと','answered'),
 ('${id(31)}','${id(1)}','${id(20)}','TEST_Q2',9012,true,'次の問い','pending');
 update user_questions set meta_json='{"onboarding_group":"trial_experience"}' where book_project_id='${id(20)}';
 insert into answers(id,user_id,sequence_order,book_project_id,subject_person_id,user_question_id,question_id,transcript_raw,access_override)
 values('${id(40)}','${id(1)}',1,'${id(20)}','${id(12)}','${id(30)}','TEST_Q1','PRIVATE_FIXTURE','private_forever'),
 ('${id(41)}','${id(1)}',2,'${id(21)}','${id(11)}',null,'SELF_Q','OWN_FIXTURE','private_forever');
 insert into media_assets(answer_id,user_id,book_project_id,person_id,asset_type,storage_path) values('${id(40)}','${id(1)}','${id(20)}','${id(12)}','audio','${id(1)}/old-private.mp4');
 insert into storage.objects(bucket_id,name) values('audio','${id(1)}/old-private.mp4');
`);
await as(1);
await rejects(()=>db.query('select family_enable($1,true)',[id(20)]),/rollout is not enabled/);
await admin(`update family_private.rollout set enabled=true,allowed_actor_ids=ARRAY['${id(1)}'::uuid];`); // LOCAL fixture only.
await as(1);
await db.query('select family_enable($1,true)',[id(20)]);
ok((await db.query('select id from answers')).rows.length===1, 'Daughter cannot read existing private mother answer through original user_id grant');
ok((await db.query('select id from media_assets')).rows.length===0, 'Private media metadata hidden from creator');
ok((await db.query('select name from storage.objects')).rows.length===0, 'Old actor-prefix audio hidden');
ok((await val('select family_workspace($1) value',[id(20)])).answered===1, 'Progress without private contents');
ok((await db.query('delete from profiles where id=$1 returning id',[id(1)])).rows.length===0,'Deleting daughter profile cannot cascade-delete mother recordings');
await rejects(()=>db.query('select get_supporter_questions($1)',[id(20)]),/Use family workspace/);
await rejects(()=>db.query('select save_supporter_recording($1,$2,null,$3,$3,$3,$3,ARRAY[]::text[],0)',[id(20),id(30),'ATTACK']),/Use family workspace/);
await rejects(()=>db.query('select append_supporter_recording($1,$2,null,$3,$3,$3,$3,ARRAY[]::text[],0)',[id(20),id(30),'ATTACK']),/Use family workspace/);
ok(await val('select can_manage_book_cover($1) value',[id(20)])===false,'Payer/old owner cannot read or build private book');
ok(await val('select can_manage_video_stories($1) value',[id(20)])===false,'Payer/old owner cannot read private video');
ok(await val('select can_manage_book_cover($1) value',[id(21)])===true,'Ordinary self-use authorization preserved');
await rejects(()=>db.query("insert into user_person_links(user_id,person_id,role) values($1,$2,'self')",[id(1),id(12)]),/row-level security/);
await rejects(()=>db.query('select family_issue_invite($1,$2)',[id(20),'bad']),/Invalid mobile/);
const invitation = await val('select family_issue_invite($1,$2) value',[id(20),'09000000002']);
ok(invitation.token.length===64, 'One-time high entropy token');
await rejects(()=>db.query('select family_claim_invite($1,true)',[invitation.token]),/Connection unavailable/);
await as(3);
await rejects(()=>db.query('select family_claim_invite($1,true)',[invitation.token]),/Verified phone/);
await as(2);
await rejects(()=>db.query('select family_claim_invite($1,false)',[invitation.token]),/Connection unavailable/);
ok(await val('select family_claim_invite($1,true) value',[invitation.token])===id(20), 'Phone proof attaches to existing project');
ok(await val('select family_claim_invite($1,true) value',[invitation.token])===id(20), 'Lost response retry idempotent');
ok((await val('select family_workspace($1) value',[id(20)])).answers[0].text==='PRIVATE_FIXTURE', 'Subject sees private content');
ok((await db.query('select name from storage.objects')).rows.some(r=>r.name.endsWith('/old-private.mp4')),'Mother can retrieve original audio uploaded by daughter');
await admin('');
ok(await val('select count(*)::int value from persons')===2,'No new Person');
ok(await val('select count(*)::int value from book_projects')===2,'No new Project');
ok(await val('select owner_user_id value from book_projects where id=$1',[id(20)])===id(1),'Legacy owner unchanged');
ok(await val('select purchaser_user_id value from book_projects where id=$1',[id(20)])===id(1),'Payer unchanged');
await as(1);
await rejects(()=>db.query('select family_issue_invite($1,$2)',[id(20),'09000000002']),/Initial connection unavailable/);
await as(2);
await db.query('select family_set_progress($1,false)',[id(20)]);
await as(1);
ok((await val('select family_workspace($1) value',[id(20)])).answered===null,'Progress permission can be withdrawn independently');
await rejects(()=>db.query('select family_set_progress($1,true)',[id(20)]),/Forbidden/);
await as(2);
const upload=await val('select family_reserve_upload($1,$2,$3) value',[id(20),'audio','mp4']);
await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['audio',upload.path]);
const answer=await val('select family_commit_recording($1,$2,$3,false) value',[upload.id,id(31),'NEW_PRIVATE']);
ok(await val('select family_commit_recording($1,$2,$3,false) value',[upload.id,id(31),'NEW_PRIVATE'])===answer,'Recording retries do not duplicate');
await as(1);
ok((await val('select family_workspace($1) value',[id(20)])).answers.length===0,'New private answer hidden from supporter');
await rejects(()=>db.query('select family_set_answer_sharing($1,true)',[answer]),/Forbidden/);
await as(2);
await db.query('select family_set_answer_sharing($1,true)',[answer]);
await as(1);
ok((await val('select family_workspace($1) value',[id(20)])).answers.length===1,'Only explicitly shared answer visible');
const continuation=await val('select family_reserve_upload($1,$2,$3) value',[id(20),'audio','mp4']);
await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['audio',continuation.path]);
await rejects(()=>db.query('select family_commit_recording($1,$2,$3,false,$4)',[continuation.id,id(30),'ATTACK',id(40)]),/Continuation forbidden/);
await db.query('select family_commit_recording($1,$2,$3,false,$4)',[continuation.id,id(31),'TOGETHER',answer]);
ok((await val('select family_workspace($1) value',[id(20)])).answers[0].text==='NEW_PRIVATE\n\nTOGETHER','Co-recording appends without replacing original');
await admin('');
ok(await val('select meta_json->>\'last_actor_user_id\' value from answers where id=$1',[answer])===id(1),'Append actor is daughter, subject remains mother');
await rejects(()=>db.query('select family_assert_asset($1,$2,$3,$4)',['audio',`${id(1)}/old-private.mp4`,id(1),id(21)]),/Forbidden asset/);
await as(2);
await db.query('select family_set_answer_sharing($1,false)',[answer]);
await as(1);
ok((await val('select family_workspace($1) value',[id(20)])).answers.length===0,'Private again also hides co-recorded content from actor');
const photo=await val('select family_reserve_upload($1,$2,$3) value',[id(20),'photo','jpg']);
await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['photos',photo.path]);
await db.query('select family_commit_photo($1)',[photo.id]);
await as(2);
ok((await val('select family_workspace($1) value',[id(20)])).photos.length===1,'Mother sees daughter photo inbox');
await admin(`insert into question_sets(id,code,name,is_active,version) values('${id(80)}','tateito_yokoito_standard_v2','QA standard',true,2);
 insert into question_set_items(question_set_id,question_id,sequence_order,question_text_snapshot,meta_json)
 values('${id(80)}','TEST_Q1',1,'QA','{"onboarding_group":"trial_experience"}');`);
await as(1);
const created=await val('select family_create($1,true,$2) value',['QA mother 2',id(81)]);
ok(await val('select family_create($1,true,$2) value',['QA mother 2',id(81)])===created,'Daughter creation RPC is retry-safe');
await admin('');
ok(await val('select purchaser_user_id value from book_projects where id=$1',[created])===null,'Payer not invented before actual purchase');
ok(await val('select owner_user_id value from book_projects where id=$1',[created])===id(1),'Daughter creates mother project without moving existing ownership');
await admin(`
 insert into commerce_products(product_code,display_name,amount_jpy) values('self_book_v1','TEST book',49800);
 insert into commerce_orders(id,book_project_id,purchaser_user_id,order_type,product_code,status,amount_subtotal,amount_total,base_book_amount)
 values('${id(90)}','${id(20)}','${id(1)}','self','self_book_v1','checkout_pending',49800,49800,49800),
 ('${id(91)}','${id(21)}','${id(1)}','self','self_book_v1','checkout_pending',49800,49800,49800);
`);
const familyContract=await val('select register_experience_contract($1) value',[id(90)]);
ok(familyContract.guarantee_days===45 && familyContract.purchase_kind==='gift','Existing family Project purchase gets 45-day gift contract without a new Person');
ok((await val('select register_experience_contract($1) value',[id(91)])).guarantee_days===30,'Normal self purchase keeps 30-day contract');
await admin(`update commerce_orders set status='paid' where id='${id(90)}';`);
const familyPaid=await val('select confirm_experience_payment($1,now()) value',[id(90)]);
ok(familyPaid.production_started_at===null,'Daughter payment does not start mother production year');
ok(new Date(familyPaid.guarantee_expires_at)-new Date(familyPaid.payment_confirmed_at)===45*86400000,'45 days measured from payment');
await as(1);
await rejects(()=>db.query('select start_paid_starting_chapter($1,true)',[id(20)]),/access/);
await rejects(()=>db.query('select start_main_experience($1,true)',[id(20)]),/access/);
ok((await val('select family_journey($1) value',[id(20)])).access.guarantee_days===45,'Supporter can see contract status without getting subject start permission');
await as(2);
await rejects(()=>db.query('select start_paid_starting_chapter($1,false)',[id(20)]),/subject/);
await db.query('select start_paid_starting_chapter($1,true)',[id(20)]);
await admin(`
 insert into questions(id,sequence_order,chapter,content) values('TEST_MOTIVATION',4,'はじまりの章','門出の声'),('TEST_MAIN',5,'幼い頃のこと','本編');
 insert into user_questions(id,user_id,book_project_id,question_id,sequence_order,is_active,question_text_snapshot,status,meta_json)
 values('${id(92)}','${id(1)}','${id(20)}','TEST_MOTIVATION',4,true,'門出の声','pending','{"onboarding_group":"starting_motivation"}'),
 ('${id(93)}','${id(1)}','${id(20)}','TEST_MAIN',5,true,'本編','pending','{"theme_code":"ty_theme_childhood"}');
`);
await as(2);
ok(await val('select family_question_allowed($1) value',[id(92)]),'Paid introduction available after mother explicit start');
ok(!await val('select family_question_allowed($1) value',[id(93)]),'Main questions locked until mother explicit main start');
await rejects(()=>db.query('select family_finish_starting_chapter($1)',[id(20)]),/starting chapter/);
const startingUpload=await val('select family_reserve_upload($1,$2,$3) value',[id(20),'audio','mp4']);
await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['audio',startingUpload.path]);
await db.query('select family_commit_recording($1,$2,$3,false)',[startingUpload.id,id(92),'MOTHER STARTING']);
await rejects(()=>db.query('select family_finish_starting_chapter($1)',[id(20)]),/starting chapter/);
for(let n=0;n<3;n++) {
 await admin(`insert into questions(id,sequence_order,chapter,content) values('TEST_OPEN_${n}',${31+n},'はじまり','はじめの会話');
 insert into user_questions(id,user_id,book_project_id,question_id,sequence_order,is_active,question_text_snapshot,status,meta_json)
 values('${id(94+n)}','${id(1)}','${id(20)}','TEST_OPEN_${n}',${31+n},true,'はじめの会話','pending','{"onboarding_group":"starting_conversation"}');`);
 await as(2);
 const u=await val('select family_reserve_upload($1,$2,$3) value',[id(20),'audio','mp4']);
 await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['audio',u.path]);
 await db.query('select family_commit_recording($1,$2,$3,false)',[u.id,id(94+n),'MOTHER OPENING']);
}
await db.query('select family_finish_starting_chapter($1)',[id(20)]);
await rejects(()=>db.query('select start_main_experience($1,false)',[id(20)]),/subject/);
await db.query('select start_main_experience($1,true)',[id(20)]);
ok(await val('select family_question_allowed($1) value',[id(93)]),'Main questions available only after subject start');
await admin('');
ok(await val('select main_started_by value from experience_contracts where order_id=$1',[id(90)])===id(2),'Mother, not payer, is audited as the main-start actor');
ok(await val("select production_expires_at=production_started_at+interval '1 year' value from experience_contracts where order_id=$1",[id(90)]),'Production year starts with mother paid introduction');
ok(await val('select owner_user_id value from book_projects where id=$1',[id(20)])===id(1),'Paid start does not transfer legacy owner');
await db.query('update commerce_orders set design_snapshot=$1 where id=$2',[{title:'PRIVATE_COVER'},id(90)]);
ok(Object.keys(await val('select design_snapshot value from commerce_orders where id=$1',[id(90)])).length===0,'Payer receipt cannot contain private book cover');
await as(1);
const voiceParts=[];
for(let n=0;n<2;n++) {
 const upload=await val('select family_reserve_upload($1,$2,$3) value',[id(20),'audio','mp4']);
 await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['audio',upload.path]);
 voiceParts.push(upload);
}
await rejects(()=>db.query('select family_pending_voice_scope($1,$2,$3)',[id(20),id(1),voiceParts.map(u=>u.id)]),/permission/);
await admin('');
const scope=await val('select family_pending_voice_scope($1,$2,$3) value',[id(20),id(1),voiceParts.map(u=>u.id)]);
ok(scope.subject===false && scope.paths.join()===voiceParts.map(u=>u.path).join(),'Supporter processing is limited to their own uncommitted parts');
await rejects(()=>db.query('select family_pending_voice_scope($1,$2,$3)',[id(21),id(1),voiceParts.map(u=>u.id)]),/Forbidden/);
await rejects(()=>db.query('select family_pending_voice_scope($1,$2,$3)',[id(20),id(2),voiceParts.map(u=>u.id)]),/Forbidden/);
await rejects(()=>db.query('select family_pending_voice_scope($1,$2,$3)',[id(20),id(1),[voiceParts[0].id,voiceParts[0].id]]),/Invalid/);
await as(1);
const draft={transcript:'RAW',transcriptClean:'CLEAN',transcriptReadable:'READABLE',transcriptEssay:'ESSAY',editedText:'EDITED',selectedStyle:'essay',duration:85};
const voiceAnswer=await val('select family_commit_voice($1,$2,$3) value',[voiceParts.map(u=>u.id),id(93),draft]);
ok(!!voiceAnswer,'Existing review payload saves both audio parts');
ok(await val('select family_commit_voice($1,$2,$3) value',[voiceParts.map(u=>u.id),id(93),draft])===voiceAnswer,'Retry returns same answer');
ok(await val('select count(*) value from answers where id=$1',[voiceAnswer])===0,'Supporter cannot read even their own committed private voice');
await admin('');
await rejects(()=>db.query('select family_pending_voice_scope($1,$2,$3)',[id(20),id(1),voiceParts.map(u=>u.id)]),/Forbidden/);
ok(await val('select count(*) value from media_assets where answer_id=$1',[voiceAnswer])===2,'Retry does not duplicate parts');
await as(2);
const savedVoice=await val('select to_jsonb(a) value from answers a where id=$1',[voiceAnswer]);
ok(savedVoice.transcript_raw==='RAW' && savedVoice.transcript_edited==='EDITED' && savedVoice.transcript_readable==='READABLE' && savedVoice.transcript_essay==='ESSAY' && savedVoice.selected_style==='essay','Mother sees all established review styles without losing edits');
ok(savedVoice.subject_person_id===id(12) && savedVoice.user_id===id(1),'Voice retains mother subject and daughter actor');
// Photo-origin entry uses the same Person/Project and preserves question order.
const photoQuestion=await val('select family_photo_question($1,$2) value',[id(20),id(110)]);
ok(await val('select family_photo_question($1,$2) value',[id(20),id(110)])===photoQuestion,'Photo question retry reuses same question');
ok(await val('select sequence_order value from user_questions where id=$1',[id(30)])===9011,'Photo creation does not renumber original question');
const photoVoice=await val('select family_reserve_upload($1,$2,$3) value',[id(20),'audio','mp4']);
const photoImage=await val('select family_reserve_upload($1,$2,$3) value',[id(20),'photo','jpg']);
await db.query('insert into storage.objects(bucket_id,name) values($1,$2),($3,$4)',['audio',photoVoice.path,'photos',photoImage.path]);
await rejects(()=>db.query('select family_commit_photo_voice($1,$2,$3,$4)',[[photoVoice.id],id(93),draft,photoImage.id]),/Photo unavailable/);
await admin('');
ok(await val('select committed_at is null value from family_uploads where id=$1',[photoVoice.id]),'Invalid photo save does not commit audio');
await as(2);
const photoAnswer=await val('select family_commit_photo_voice($1,$2,$3,$4) value',[[photoVoice.id],photoQuestion,{...draft,photoStoryTitle:'この一枚のこと'},photoImage.id]);
ok(await val('select family_commit_photo_voice($1,$2,$3,$4) value',[[photoVoice.id],photoQuestion,draft,photoImage.id])===photoAnswer,'Photo voice retry returns same answer');
ok(await val('select count(*) value from media_assets where answer_id=$1',[photoAnswer])===2,'Exactly one photo and one audio attached');
ok(await val("select meta_json->>'story_origin' value from answers where id=$1",[photoAnswer])==='photo','Book receives existing photo-origin metadata');
await admin('');
ok(await val('select answer_id value from family_uploads where id=$1',[photoImage.id])===photoAnswer,'Photo permissions follow answer');
await as(1);
await rejects(()=>db.query('select family_photo_question($1,$2)',[id(20),id(111)]),/Subject main access/);
await rejects(()=>db.query('select family_commit_photo_voice($1,$2,$3,$4)',[[photoVoice.id],photoQuestion,draft,photoImage.id]),/Forbidden photo/);
ok(await val('select count(*) value from answers where id=$1',[photoAnswer])===0,'Daughter denied private photo story');
ok(await val('select count(*) value from storage.objects where name=$1',[photoImage.path])===0,'Daughter denied private photo bytes');
ok(!(await val('select family_workspace($1) value',[id(20)])).photos.some(p=>p.path===photoImage.path),'Private mother photo is not daughter inbox data');
await as(2);
await db.query('select family_set_answer_sharing($1,true)',[photoAnswer]);
await as(1);
ok(await val('select count(*) value from storage.objects where name=$1',[photoImage.path])===1,'Explicit sharing allows photo');
await as(2);
await db.query('select family_set_answer_sharing($1,false)',[photoAnswer]);
await as(1);
ok(await val('select count(*) value from storage.objects where name=$1',[photoImage.path])===0,'Revoking sharing denies photo immediately at storage policy');
// Existing story editor: subject can edit a daughter's original recording.
await rejects(()=>db.query('select family_edit_story($1,$2,$3,$4,$5)',[id(20),voiceAnswer,'readable','ATTACK',{style:'essay',body:'EDITED'}]),/Subject access/);
await as(2);
const version={style:'essay',body:'EDITED'};
await db.query('select family_edit_story($1,$2,$3,$4,$5)',[id(20),voiceAnswer,'readable','MOTHER_EDIT',version]);
await db.query('select family_edit_story($1,$2,$3,$4,$5)',[id(20),voiceAnswer,'readable','MOTHER_EDIT',version]);
ok(await val('select transcript_edited value from answers where id=$1',[voiceAnswer])==='MOTHER_EDIT','Mother edits daughter-authored content; retry idempotent');
ok(await val('select user_id value from answers where id=$1',[voiceAnswer])===id(1),'Original actor preserved on edit');
await rejects(()=>db.query('select family_edit_story($1,$2,$3,$4,$5)',[id(20),voiceAnswer,'essay','STALE',version]),/Story changed/);
await rejects(()=>db.query('select family_edit_story($1,$2,$3,$4,$5)',[id(21),voiceAnswer,'essay','CROSS',version]),/Subject access/);
const addedPhoto=await val('select family_reserve_upload($1,$2,$3) value',[id(20),'photo','jpg']);
await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['photos',addedPhoto.path]);
await db.query('select family_attach_story_photo($1,$2,$3)',[id(20),voiceAnswer,addedPhoto.id]);
await db.query('select family_attach_story_photo($1,$2,$3)',[id(20),voiceAnswer,addedPhoto.id]);
const addedMedia=await val('select id value from media_assets where storage_path=$1',[addedPhoto.path]);
ok(!!addedMedia,'Photo attached to existing story');
ok(await val("select count(*) value from media_assets where answer_id=$1 and asset_type='photo'",[voiceAnswer])===1,'Photo retry does not duplicate');
await as(1);
await rejects(()=>db.query('select family_remove_story_photo($1,$2)',[id(20),addedMedia]),/Subject access/);
await rejects(()=>db.query('select family_attach_story_photo($1,$2,$3)',[id(20),voiceAnswer,addedPhoto.id]),/Subject access/);
await as(2);
const corrected=await val('select family_reserve_upload($1,$2,$3) value',[id(20),'photo','jpg']);
await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['photos',corrected.path]);
await db.query('select family_attach_story_photo($1,$2,$3,$4)',[id(20),voiceAnswer,corrected.id,addedMedia]);
await db.query('select family_attach_story_photo($1,$2,$3,$4)',[id(20),voiceAnswer,corrected.id,addedMedia]);
ok(await val("select count(*) value from media_assets where answer_id=$1 and asset_type='photo'",[voiceAnswer])===1,'Photo replacement is atomic and idempotent');
ok(await val('select count(*) value from storage.objects where name=$1',[addedPhoto.path])===0,'Old photo inaccessible after correction');
ok(await val('select count(*) value from storage.objects where name=$1',[corrected.path])===1,'New photo available to mother');
const correctedMedia=await val('select id value from media_assets where storage_path=$1',[corrected.path]);
await db.query('select family_remove_story_photo($1,$2)',[id(20),correctedMedia]);
await db.query('select family_remove_story_photo($1,$2)',[id(20),correctedMedia]);
ok(await val('select count(*) value from storage.objects where name=$1',[corrected.path])===0,'Removed photo denied even to historical uploader');
await admin('');
ok(await val('select count(*) value from storage.objects where name=$1',[corrected.path])===1,'Removed bytes retained for recovery, not destroyed');
// One existing mother's story through append, replace, photo preservation and denial.
await as(2);
const originalPhoto=await val("select storage_path value from media_assets where answer_id=$1 and asset_type='photo'",[photoAnswer]);
const editContext=await val('select family_voice_edit_context($1,$2) value',[id(20),photoAnswer]);
const appendUpload=await val('select family_reserve_upload($1,$2,$3) value',[id(20),'audio','mp4']);
await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['audio',appendUpload.path]);
const revise=(upload,mode,revision,body=draft)=>val('select family_revise_voice($1,$2,$3,$4,$5,$6) value',[id(20),photoAnswer,[upload.id],mode,body,revision]);
ok(await revise(appendUpload,'append',editContext.revision,{...draft,transcript:'OLD AND NEW'})===photoAnswer,'Append uses original answer ID');
ok(await revise(appendUpload,'append',editContext.revision)===photoAnswer,'Append retry idempotent');
ok(await val("select count(*) value from media_assets where answer_id=$1 and asset_type='audio'",[photoAnswer])===2,'Append retains old audio');
const replaceUpload=await val('select family_reserve_upload($1,$2,$3) value',[id(20),'audio','mp4']);
await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['audio',replaceUpload.path]);
await rejects(()=>revise(replaceUpload,'replace',editContext.revision),/Story changed/);
const updatedContext=await val('select family_voice_edit_context($1,$2) value',[id(20),photoAnswer]);
ok(await revise(replaceUpload,'replace',updatedContext.revision,{...draft,transcript:'REPLACED'})===photoAnswer,'Replace uses original answer ID');
ok(await revise(replaceUpload,'replace',updatedContext.revision)===photoAnswer,'Replace retry idempotent');
ok(await val("select count(*) value from media_assets where answer_id=$1 and asset_type='audio'",[photoAnswer])===1,'Only replacement audio remains active');
ok(await val("select storage_path value from media_assets where answer_id=$1 and asset_type='photo'",[photoAnswer])===originalPhoto,'Replacement preserves original photo');
ok(await val('select count(*) value from storage.objects where name=$1',[appendUpload.path])===0,'Superseded audio cannot be fetched');
ok(await val("select access_override='private_forever' and subject_person_id=$2 value from answers where id=$1",[photoAnswer,id(12)]),'Revision preserves privacy and subject');
await as(1);
await rejects(()=>db.query('select family_voice_edit_context($1,$2)',[id(20),photoAnswer]),/Subject access/);
await rejects(()=>revise(replaceUpload,'replace',updatedContext.revision),/Subject access/);
ok(await val('select count(*) value from storage.objects where name=$1',[replaceUpload.path])===0,'Daughter denied replacement audio');
await admin('');
await db.exec(await readFile(new URL('../../supabase/migrations/202609170012_family_theme_navigation.sql',import.meta.url),'utf8'));
await as(2);
const firstTheme=(await val('select family_journey($1) value',[id(20)])).theme_navigation;
ok(firstTheme.phase==='first_intro','Mother main start is followed by existing first theme introduction');
await rejects(()=>db.query('select family_theme_navigate($1,$2,$3)',[id(20),{...firstTheme,order:9},'finish']),/Navigation changed/);
await db.query('select family_theme_navigate($1,$2,$3)',[id(20),firstTheme,'enter']);
await db.query('select family_theme_navigate($1,$2,$3)',[id(20),firstTheme,'enter']);
await admin(`update user_questions set meta_json='{"theme_code":"ty_theme_childhood"}',status='pending' where id='${id(93)}';`);
await as(2);
await db.query('select family_skip_question($1,$2)',[id(20),id(93)]);
let nav=(await val('select family_journey($1) value',[id(20)])).theme_navigation;
ok(nav.phase==='complete' && nav.order===1,'Resolved theme resumes at completion after fresh journey load');
ok((await val('select family_journey($1) value',[id(20)])).questions.find(q=>q.id===id(93)).skipped,'Skipped is progress, not a fabricated answer');
await rejects(()=>db.query('select family_skip_question($1,$2)',[id(21),id(93)]),/Forbidden/);
await db.query('select family_theme_navigate($1,$2,$3)',[id(20),nav,'next']);
nav=(await val('select family_journey($1) value',[id(20)])).theme_navigation;
ok(nav.phase==='intro' && nav.order===1,'Next-theme introduction survives revisit');
await db.query('select family_theme_navigate($1,$2,$3)',[id(20),nav,'enter']);
ok(!(await val('select family_journey($1) value',[id(20)])).theme_navigation,'Acknowledged completion does not repeat');
await db.query('select family_set_progress($1,false)',[id(20)]);
await as(1);
ok(!(await val('select family_journey($1) value',[id(20)])).theme_navigation,'Hidden progress does not leak through navigation');
ok((await val('select family_journey($1) value',[id(20)])).questions.every(q=>q.skipped===null),'Skipped status respects progress permission');
await rejects(()=>db.query('select family_theme_navigate($1,$2,$3)',[id(20),nav,'enter']),/Navigation changed/);
await admin('');
await db.exec(await readFile(new URL('../../supabase/migrations/202609170013_family_test_delivery_preferences.sql',import.meta.url),'utf8'));
const deliverySnapshot=await val("select jsonb_build_object('schedules',(select jsonb_agg(to_jsonb(n)) from notification_schedules n),'preferences',(select jsonb_agg(to_jsonb(u)) from notification_preferences u)) value");
await as(1);
await rejects(()=>db.query('select family_test_delivery_preferences($1)',[id(20)]),/Subject access/);
await rejects(()=>db.query('select family_save_test_delivery($1,null,true)',[id(20)]),/Subject access/);
await as(2);
let delivery=await val('select family_test_delivery_preferences($1) value',[id(20)]);
ok(delivery.email===null && delivery.phone_number==='819000000002' && !!delivery.phone_verified_at,'Subject delivery identity comes from verified Auth account');
delivery=await val('select family_save_test_delivery($1,$2,true) value',[id(20),[{weekday:1,hour:9,minute:15}]]);
ok(delivery.sms_enabled && delivery.delivery_suppressed && !delivery.is_active && !delivery.email_enabled,'Requested SMS setting never enables TEST transport');
delivery=await val('select family_save_test_delivery($1,$2,null) value',[id(20),[{weekday:2,hour:10,minute:30}]]);
ok(delivery.sms_enabled && delivery.schedules[0].weekday===2,'Schedule edits preserve separate SMS preference');
await val('select family_save_test_delivery($1,null,false) value',[id(20)]);
delivery=await val('select family_test_delivery_preferences($1) value',[id(20)]);
ok(!delivery.sms_enabled && delivery.schedules[0].weekday===2 && !!delivery.phone_verified_at,'Stopping notifications does not remove authentication');
for(const bad of [[],[{weekday:7,hour:9,minute:0}],[{weekday:1,hour:null,minute:0}],[{weekday:1,hour:9,minute:0},{weekday:1,hour:9,minute:0}]])await rejects(()=>db.query('select family_save_test_delivery($1,$2,null)',[id(20),bad]),/schedules/);
await admin('');
ok(JSON.stringify(await val("select jsonb_build_object('schedules',(select jsonb_agg(to_jsonb(n)) from notification_schedules n),'preferences',(select jsonb_agg(to_jsonb(u)) from notification_preferences u)) value"))===JSON.stringify(deliverySnapshot),'No existing notification schedules or preferences mutated');
// Reuse the fully exercised legacy fixture for additive migration regressions.
export { db, as, admin, val };
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await db.close();
console.log(`PASS ${checks} family SQL checks (real pgcrypto/RLS; fixture auth; NOT browser/SMS E2E)`);
