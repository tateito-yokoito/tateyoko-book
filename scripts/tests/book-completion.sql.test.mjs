import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const runtime=process.env.QA_PGLITE_PATH;
const {PGlite}=await import(runtime),{pgcrypto}=await import(new URL('./contrib/pgcrypto.js',pathToFileURL(runtime)));
const db=new PGlite({extensions:{pgcrypto}}),id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const rpc=async(name,args=[])=>(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema extensions;create extension pgcrypto with schema extensions;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.role() returns text language sql as $$select current_setting('test.role',true)$$;
 create table auth.users(id uuid primary key);
 create table persons(id uuid primary key,display_name text);
 create table book_projects(id uuid primary key,owner_user_id uuid,subject_person_id uuid,title text);
 create table answers(id uuid primary key,book_project_id uuid,subject_person_id uuid,user_question_id uuid,sequence_order integer,created_at timestamptz default now(),access_override text,transcript_edited text);
 create table user_questions(id uuid primary key,book_project_id uuid,question_id text,meta_json jsonb);
 create table book_cover_settings(book_project_id uuid,title text);
 create table media_assets(id uuid,answer_id uuid,book_project_id uuid,created_at timestamptz);
 create table video_stories(id uuid,book_project_id uuid,status text,metadata jsonb,slot_order int,source_answer_id uuid);
 create table voice_publications(id uuid primary key,book_project_id uuid,public_id text,status text,snapshot_metadata jsonb,video_assets jsonb,snapshot_schema_version int,
 book_title text,book_subtitle text,subject_name text,published_at timestamptz,access_mode text,access_code_hash text,access_code_changed_at timestamptz);
 create table voice_publication_items(publication_id uuid,item_order int,source_answer_id uuid,chapter_title text,question_text text,transcript_text text,audio_assets jsonb,photo_assets jsonb,metadata jsonb);
 create table commerce_orders(id uuid primary key,book_project_id uuid,purchaser_user_id uuid,order_type text,status text,shipping_address jsonb,
 stripe_checkout_session_id text,metadata jsonb default '{}');
 create function expire_commerce_order(input_order_id uuid) returns void language sql as $$update commerce_orders set status='expired' where id=input_order_id and status='checkout_pending'$$;
 create function create_book_commerce_order(u uuid,p uuid,d text,s integer,pr integer,g boolean,shipping jsonb) returns jsonb language plpgsql as $$
 declare o commerce_orders%rowtype;begin
 insert into commerce_orders(id,book_project_id,purchaser_user_id,order_type,status,shipping_address)
 values('${id(8)}',p,u,'self','checkout_pending',shipping) returning * into o;
 return jsonb_build_object('order',to_jsonb(o));end;$$;
 create function can_manage_book_cover(p uuid) returns boolean language sql as $$select exists(select 1 from book_projects where id=p and owner_user_id=auth.uid())$$;
 create function assert_experience_processing(p uuid,u uuid) returns void language plpgsql as $$begin if not can_manage_book_cover(p) then raise exception 'Forbidden';end if;end;$$;
 create function is_tateyoko_admin() returns boolean language sql as $$select false$$;
 insert into auth.users values('${id(1)}');insert into persons values('${id(2)}','QA');
 insert into book_projects values('${id(3)}','${id(1)}','${id(2)}','Book');
 insert into user_questions values('${id(4)}','${id(3)}','Q1','{}');
 insert into answers(id,book_project_id,subject_person_id,user_question_id,sequence_order,transcript_edited) values('${id(5)}','${id(3)}','${id(2)}','${id(4)}',1,'Original');
 set test.uid='${id(1)}';set test.role='authenticated';`);
 for(const f of ['202609160004_book_work_manifest.sql','202609230001_web_book_preview.sql','202609230004_book_completion_candidates.sql','202609230006_book_print_handoff.sql'])await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 const work=await rpc('save_book_selection',[id(3),[id(5)],0]);
 await db.exec(`set test.uid='${id(99)}'`);
 await assert.rejects(rpc('prepare_book_completion',[id(3),work.revision,true,'',true]),/confirmation/);
 await db.exec(`set test.uid='${id(1)}'`);
 await assert.rejects(rpc('prepare_book_completion',[id(3),work.revision,true,'',true]),/not enabled/);
 await db.exec('update book_completion_rollout set enabled=true');
 await assert.rejects(rpc('prepare_book_completion',[id(3),work.revision,true,'12345',true]),/PIN/);
 let c=await rpc('prepare_book_completion',[id(3),work.revision,true,'0000',true]);
 assert.equal(c.pin_hash,undefined);
 assert.equal((await rpc('prepare_book_completion',[id(3),work.revision,true,'0000',true])).id,c.id);
 assert.equal((await rpc('get_book_work',[id(3)])).confirmed_at,null);
 await assert.rejects(db.exec("update answers set transcript_edited='changed'"),/pending order/);
 await assert.rejects(db.exec(`update answers set book_project_id='${id(98)}'`),/pending order/);
 await assert.rejects(rpc('confirm_book_work',[id(3),work.revision,true]),/pending order/);
 await assert.rejects(rpc('prepare_book_completion',[id(3),work.revision,false,'0000',true]),/pending order/);
 await assert.rejects(rpc('cancel_book_completion',[c.id]),/Forbidden/);
 await db.exec("set test.role='service_role'");
 await rpc('cancel_book_completion',[c.id]); // no order exists: preparation failure is recoverable
 await db.exec("update answers set transcript_edited='Revised';set test.role='authenticated'");
 c=await rpc('prepare_book_completion',[id(3),work.revision,false,'',true]);
 await db.exec(`insert into voice_publications(id,book_project_id,work_manifest_id,public_id,status,snapshot_metadata) values('${id(6)}','${id(3)}','${work.id}','stable-url','draft','{}');
 insert into commerce_orders(id,book_project_id,purchaser_user_id,order_type,status,shipping_address) values('${id(7)}','${id(3)}','${id(1)}','self','checkout_pending','{}');set test.role='service_role';`);
 await assert.rejects(rpc('bind_book_completion_order',[c.id,id(7)]),/Invalid completion/);
 const items=[{item_order:1,source_answer_id:id(5),transcript_text:'Revised',audio_assets:[],photo_assets:[]}];
 await rpc('write_book_completion_publication',[c.id,id(6),{completionCandidateId:c.id},items,[]]);
 await assert.rejects(db.exec("update voice_publications set status='published'"),/paid order/);
 await assert.rejects(db.exec("update voice_publications set status='disabled'"),/paid order/);
 await rpc('bind_book_completion_order',[c.id,id(7)]);
 // Cancellation before any Stripe request is atomic; a saved request must be
 // verified with Stripe, even when the response/session ID was lost.
 await db.exec(`update commerce_orders set metadata='{"book_completion_checkout_request":[]}' where id='${id(7)}'`);
 await assert.rejects(rpc('cancel_unstarted_book_completion',[c.id]),/Verify payment/);
 await db.exec(`update commerce_orders set metadata='{}' where id='${id(7)}'`);
 await rpc('cancel_unstarted_book_completion',[c.id]);
 assert.equal((await db.query('select status from commerce_orders')).rows[0].status,'expired');
 await db.exec("set test.role='authenticated'");
 c=await rpc('prepare_book_completion',[id(3),work.revision,false,'0001',true]);
 await db.exec("set test.role='service_role'");
 // Real orders have different IDs. Keep the cancelled order for the audit log.
 await rpc('write_book_completion_publication',[c.id,id(6),{completionCandidateId:c.id},items,[]]);
 await assert.rejects(rpc('create_book_completion_order',[c.id,id(99),null,0,0,false,{}]),/unavailable/);
 assert.equal((await rpc('create_book_completion_order',[c.id,id(1),null,0,0,false,{}])).order.id,id(8));
 await assert.rejects(rpc('create_book_completion_order',[c.id,id(1),null,0,0,false,{}]),/already started/);
 assert.equal((await db.query('select count(*)::int n from commerce_orders')).rows[0].n,2,'cancelled order plus one new order only');
 await assert.rejects(rpc('complete_book_order',[id(8)]),/Payment/);
 await assert.rejects(rpc('get_book_print_handoff',[id(8)]),/Completed order/);
 await assert.rejects(rpc('cancel_book_completion',[c.id]),/Cancel payment/);
 await db.exec(`update commerce_orders set status='zero_paid' where id='${id(8)}';
 create function fail_publish() returns trigger language plpgsql as $$begin if new.status='published' then raise exception 'simulated failure';end if;return new;end;$$;
 create trigger fail_publish before update on voice_publications for each row execute function fail_publish();`);
 await assert.rejects(rpc('complete_book_order',[id(8)]),/simulated failure/);
 assert.equal((await rpc('get_book_work',[id(3)])).confirmed_at,null);
 assert.equal((await db.query('select status from voice_publications')).rows[0].status,'draft');
 await db.exec('drop trigger fail_publish on voice_publications');
 const completed=await rpc('complete_book_order',[id(8)]);
 assert.equal(completed.completed,true);
 assert.deepEqual(await rpc('complete_book_order',[id(8)]),completed);
 assert.equal((await db.query("select access_mode,extensions.crypt('0001',access_code_hash)=access_code_hash pin_matches from voice_publications")).rows[0].pin_matches,true);
 assert.equal((await db.query('select count(*)::int n from voice_publications')).rows[0].n,1);
 assert.equal((await db.query('select public_id from voice_publications')).rows[0].public_id,'stable-url');
 const handoff=await rpc('get_book_print_handoff',[id(8)]);
 assert.equal(handoff.web_book_path,'/?voice=stable-url');
 assert.equal(handoff.qr_in_book,false);
 assert.deepEqual(handoff.standard_qr_placements,[]);
 assert.deepEqual(handoff.premium_qr_placements,[]);
 await db.exec("set test.role='authenticated'");
 await assert.rejects(rpc('get_book_print_handoff',[id(8)]),/Forbidden/);
 await db.exec("set test.role='service_role'");
 await db.exec("update voice_publications set status='disabled';update voice_publications set status='published'");
 await db.exec("update answers set transcript_edited='Future story'");
 assert.equal((await rpc('get_book_work',[id(3)])).snapshot.answers[0].transcript_edited,'Revised');
 await assert.rejects(rpc('cancel_book_completion',[c.id]),/immutable/);
 assert.equal((await rpc('complete_book_order',[id(90)])).applicable,false);
 console.log('PASS completion: permission, 4-digit PIN, retry, editing lock, cancellation, readiness, unpaid denial, atomic failure rollback, zero-paid completion, idempotency, stable URL, future edits isolated, legacy no-op');
} finally {await db.close();}
