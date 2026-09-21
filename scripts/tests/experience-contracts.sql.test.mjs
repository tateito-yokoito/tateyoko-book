import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.QA_PGLITE_PATH || '@electric-sql/pglite');
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const rpc = async (name, args = []) => (await db.query(
  `select ${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args)).rows[0].result;
const actor = async n => db.exec(`set test.uid = '${n ? id(n) : ''}';`);
await db.exec(`
create schema auth;
create role authenticated; create role anon; create role service_role;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create table persons(id uuid primary key);
create table book_projects(id uuid primary key, owner_user_id uuid, subject_person_id uuid, status text default 'active', onboarding_ritual_step text default 'chapter_complete');
create table project_supporters(book_project_id uuid, supporter_user_id uuid, status text, can_operate_recording boolean);
create table commerce_orders(id uuid primary key, book_project_id uuid, purchaser_user_id uuid, order_type text,
 status text default 'checkout_pending', includes_base_book boolean default true, base_book_amount integer default 49800,
 amount_subtotal integer default 49800, amount_total integer default 49800, discount_amount integer default 0,
 gift_package_amount integer default 0, standard_extra_copy_count integer default 0, premium_copy_count integer default 0,
 created_at timestamptz default now());
create table gift_orders(id uuid primary key, commerce_order_id uuid, recipient_project_id uuid, claimed_at timestamptz, package_status text);
create table family_story_invitations(id uuid primary key, recipient_project_id uuid, inviter_user_id uuid, offer_type text, status text);
create table user_questions(id uuid primary key, book_project_id uuid, is_active boolean default true, status text default 'answered', meta_json jsonb);
create table answers(id uuid primary key, user_question_id uuid, book_project_id uuid, subject_person_id uuid);
create table media_assets(id uuid primary key, answer_id uuid, asset_type text, storage_path text);
insert into auth.users values ('${id(1)}'),('${id(2)}'),('${id(3)}');
insert into persons values ('${id(11)}'),('${id(12)}'),('${id(13)}'),('${id(14)}'),('${id(15)}');
insert into book_projects(id,owner_user_id,subject_person_id) values
 ('${id(21)}','${id(1)}','${id(11)}'),('${id(22)}','${id(2)}','${id(12)}'),
 ('${id(23)}','${id(1)}','${id(13)}'),('${id(24)}','${id(1)}','${id(14)}'),
 ('${id(25)}','${id(1)}','${id(11)}');
insert into project_supporters values ('${id(22)}','${id(1)}','active',true);
`);
await db.exec(await readFile(new URL('../../supabase/migrations/202609150001_add_experience_contracts_v2.sql', import.meta.url), 'utf8'));
let checks = 0;
const eq = (a,b,msg) => { assert.deepEqual(a,b,msg); checks++; };
const rejects = async (promise, pattern) => { await assert.rejects(promise,pattern); checks++; };
const order = async (n, project, kind = 'self', discount = 0, age = '1 day') => {
  await db.query(`insert into commerce_orders(id,book_project_id,purchaser_user_id,order_type,discount_amount,amount_total,created_at)
    values ($1,$2,$3,$4,$5,49800-$5,now()-$6::interval)`, [id(n),project ? id(project):null,id(1),kind,discount,age]);
  return rpc('register_experience_contract', [id(n)]);
};
const paid = async (n, age = '1 hour') => {
  await db.query("update commerce_orders set status='paid' where id=$1",[id(n)]);
  const time=(await db.query('select now()-$1::interval as time',[age])).rows[0].time;
  return rpc('confirm_experience_payment',[id(n),time]);
};
await actor(1);
const self=await order(31,21);
eq(self.guarantee_days,30);
eq((await rpc('register_experience_contract',[id(31)])).order_id,id(31),'Registration is idempotent');
await rejects(rpc('confirm_experience_payment',[id(31),new Date().toISOString()]),/not confirmed/);
const p=await paid(31);
eq(new Date(p.guarantee_expires_at)-new Date(p.payment_confirmed_at),30*86400000);
eq((await rpc('confirm_experience_payment',[id(31),new Date().toISOString()])).payment_confirmed_at,p.payment_confirmed_at,'Retry must not extend guarantee');
eq((await rpc('get_experience_access',[id(21)])).main_started_at,null);
await actor(3);
await rejects(rpc('start_main_experience',[id(21),true]),/access/);
await actor(1);
await rejects(rpc('start_main_experience',[id(21),false]),/subject/);
await db.query("update book_projects set onboarding_ritual_step='motivation' where id=$1",[id(21)]);
await rejects(rpc('start_main_experience',[id(21),true]),/starting chapter/);
await db.query("update book_projects set onboarding_ritual_step='chapter_complete' where id=$1",[id(21)]);
const main=await rpc('start_main_experience',[id(21),true]);
eq(await rpc('start_main_experience',[id(21),true]),main);
await rejects(rpc('request_experience_refund',[id(31)]),/not eligible/);

const gift=await order(32,null,'gift',14940);
eq(gift.guarantee_days,45);
eq(gift.base_paid_amount,34860);
await paid(32);
await db.query("insert into gift_orders values ($1,$2,$3,now(),'shipped')",[id(41),id(32),id(22)]);
const bound=await rpc('bind_gift_experience_contract',[id(32)]);
eq(bound.subject_person_id,id(12),'Mother is the subject, not the daughter/payer');
eq(bound.production_started_at,null,'Claiming is not paid-start');
await rejects(rpc('start_main_experience',[id(22),true]),/Production/);
await actor(2);
const starting=await rpc('start_paid_starting_chapter',[id(22),true]);
eq(await rpc('start_paid_starting_chapter',[id(22),true]),starting);
eq((await db.query("select production_expires_at = production_started_at + interval '1 year' as ok from experience_contracts where order_id=$1",[id(32)])).rows[0].ok,true,'Gift year starts at the paid introduction');
eq((await db.query('select production_started_at > payment_confirmed_at as ok from experience_contracts where order_id=$1',[id(32)])).rows[0].ok,true,'Payment or claim must not start the gift year');
eq((await rpc('get_experience_access',[id(22)])).main_started_at,null,'Paid introduction does not end guarantee');
await rejects(rpc('request_experience_refund',[id(32)]),/purchaser/);
await actor(1);
await db.query('update commerce_orders set gift_package_amount=3000,amount_total=37860 where id=$1',[id(32)]);
const refund=await rpc('request_experience_refund',[id(32)]);
eq(refund.requested_amount,34860,'Shipped option excluded, discounted principal included');
eq((await rpc('request_experience_refund',[id(32)])).id,refund.id,'Retry preserves initial request');
await rejects(rpc('start_main_experience',[id(22),true]),/refund request/);
await rpc('record_experience_refund_result',[refund.id,'re_test','pending',34860,null]);
eq((await rpc('get_experience_access',[id(22)])).refund_confirmed_at,null);
await rpc('record_experience_refund_result',[refund.id,'re_test','failed',34860,null]);
await rejects(rpc('record_experience_refund_result',[refund.id,'re_test','succeeded',37860,new Date().toISOString()]),/match/);
const settled=await rpc('record_experience_refund_result',[refund.id,'re_test','succeeded',34860,new Date().toISOString()]);
const access=await rpc('get_experience_access',[id(22)]);
eq(access.can_create,false);
eq(new Date(access.export_available_until)-new Date(access.refund_confirmed_at),30*86400000);
eq((await rpc('record_experience_refund_result',[refund.id,'re_test','pending',34860,null])).status,'succeeded','Out-of-order event cannot undo success');
eq(settled.deletion_review_status,'not_due');

// Unclaimed gift: accept now, verify identity before actual money movement.
await order(33,null,'gift'); await paid(33);
await db.query("insert into gift_orders values ($1,$2,null,null,'pending')",[id(42),id(33)]);
await db.query('update commerce_orders set gift_package_amount=3000,amount_total=52800 where id=$1',[id(33)]);
const unclaimed=await rpc('request_experience_refund',[id(33)]);
eq(unclaimed.identity_review_required,true);
eq(unclaimed.requested_amount,52800,'Unshipped package included');
await rejects(rpc('record_experience_refund_result',[unclaimed.id,'re_unclaimed','pending',52800,null]),/Verify/);
await rejects(rpc('resolve_experience_refund_subject',[unclaimed.id,id(12)]),/unique/);
await rpc('resolve_experience_refund_subject',[unclaimed.id,id(15)]);
await rpc('record_experience_refund_result',[unclaimed.id,'re_unclaimed','succeeded',52800,new Date().toISOString()]);

// Deadline from confirmation, not Checkout creation. No legacy backfill.
await order(34,23,'self',0,'40 days'); await paid(34,'31 days');
await rejects(rpc('request_experience_refund',[id(34)]),/not eligible/);
eq((await rpc('get_experience_access',[id(24)])).policy_version,'legacy');
await db.query("insert into commerce_orders(id,book_project_id,purchaser_user_id,order_type,status) values($1,$2,$3,'self','paid')",[id(35),id(24),id(1)]);
await rejects(rpc('register_experience_contract',[id(35)]),/new unpaid/);

// Time limits do not delete the person's records or silently restart a year.
await db.query('insert into persons values($1),($2)',[id(16),id(17)]);
await db.query('insert into book_projects(id,owner_user_id,subject_person_id) values($1,$2,$3),($4,$2,$5)',[id(26),id(1),id(16),id(27),id(17)]);
await order(37,null,'gift',0,'8 months'); await paid(37,'7 months');
await db.query("insert into gift_orders values($1,$2,$3,now(),'not_required')",[id(43),id(37),id(26)]);
await rpc('bind_gift_experience_contract',[id(37)]);
await rejects(rpc('start_paid_starting_chapter',[id(26),true]),/extend the gift activation/);
eq((await rpc('get_experience_access',[id(26)])).production_started_at,null);
await order(38,27,'self',0,'14 months'); await paid(38,'13 months');
eq((await rpc('get_experience_access',[id(27)])).can_create,false);
await rejects(rpc('start_paid_starting_chapter',[id(27),true]),/extend the production/);
await rejects(rpc('start_main_experience',[id(27),true]),/Production/);
eq((await db.query('select count(*)::int as n from book_projects where id=$1',[id(27)])).rows[0].n,1);

// Person-scoped saved trial and explicit intent, not completion notification.
await db.query("insert into family_story_invitations values ($1,$2,$3,'trial_gift','trial_completed')",[id(51),id(24),id(2)]);
for(let n=0;n<3;n++) {
  await db.query("insert into user_questions(id,book_project_id,meta_json) values($1,$2,'{\"onboarding_group\":\"trial_experience\"}')",[id(60+n),id(24)]);
  await db.query('insert into answers values($1,$2,$3,$4)',[id(70+n),id(60+n),id(24),id(14)]);
}
eq((await db.query('select count(*)::int as n from experience_notification_outbox')).rows[0].n,0);
await rejects(rpc('record_trial_continuation_intent',[id(24),'continue',true]),/saved trial/);
for(let n=0;n<3;n++) await db.query("insert into media_assets values($1,$2,'audio',$3)",[id(80+n),id(70+n),`audio/${n}.mp4`]);
await rejects(rpc('record_trial_continuation_intent',[id(24),'continue',false]),/subject intention/);
await rpc('record_trial_continuation_intent',[id(24),'later',true]);
eq((await db.query('select count(*)::int as n from experience_notification_outbox')).rows[0].n,0);
const intent=await rpc('record_trial_continuation_intent',[id(24),'continue',true]);
eq((await rpc('record_trial_continuation_intent',[id(24),'continue',true])).intent_id,intent.intent_id);
const outbox=(await db.query('select * from experience_notification_outbox')).rows;
eq(outbox.length,1);
eq(outbox[0].recipient_user_id,id(2));
eq(Object.keys(outbox[0]).some(k=>/transcript|audio|email|name/.test(k)),false,'Outbox carries no narrative');
await rpc('record_trial_continuation_intent',[id(24),'later',true]);
eq((await db.query('select status from experience_notification_outbox')).rows[0].status,'cancelled');
await actor(3);
await rejects(rpc('record_trial_continuation_intent',[id(24),'continue',true]),/access/);
await actor(null);
await rejects(rpc('get_experience_access',[id(21)]),/access/);
for(const fn of ['register_experience_contract(uuid)','confirm_experience_payment(uuid,timestamptz)',
 'record_experience_refund_result(uuid,text,text,integer,timestamptz)','resolve_experience_refund_subject(uuid,uuid)']) {
 eq((await db.query("select has_function_privilege('authenticated',$1,'execute') as ok",[fn])).rows[0].ok,false);
}
eq((await db.query("select has_table_privilege('authenticated','experience_contracts','UPDATE') as ok")).rows[0].ok,false);
eq((await db.query("select has_function_privilege('anon','start_main_experience(uuid,boolean)','execute') as ok")).rows[0].ok,false);
eq((await db.query('select count(*)::int as n from answers')).rows[0].n,3,'Refund never physically deletes records');
if (process.env.QA_EXPERIENCE_INTEGRATION === '1') {
  await (await import('./experience-commerce.integration.mjs')).default({db,id,rpc,actor,eq,rejects});
  await (await import('./experience-edge.integration.mjs')).default({db,id,rpc,actor,eq,rejects});
}
await db.close();
console.log(`PASS ${checks} assertions: v2 contracts, gift activation, principal refunds, unclaimed gifts, explicit person intent, idempotency, deadlines and RPC grants (local PGlite; not production E2E)`);
