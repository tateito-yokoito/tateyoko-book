import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.QA_PGLITE_PATH),db=new PGlite();
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const rpc=async(name,args=[])=>(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
const rate=async()=>(await db.query('select * from register_private_web_book_request($1,$2,$3)',[id(4),'hash','metadata'])).rows[0];
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.role() returns text language sql as $$select current_setting('test.role',true)$$;
 create table voice_publication_request_windows(publication_id uuid,counter_key text,request_kind text,window_started_at timestamptz,request_count bigint,updated_at timestamptz,primary key(publication_id,counter_key,request_kind,window_started_at));
 create table book_projects(id uuid,owner_user_id uuid);
 create table project_supporters(book_project_id uuid,supporter_user_id uuid,status text,can_build_book boolean);
 create table voice_publications(id uuid,public_id text,book_project_id uuid,book_title text,book_subtitle text,subject_name text,published_at timestamptz,status text,access_mode text);
 create function family_managed(p uuid) returns boolean language sql as $$select current_setting('test.family',true)='true'$$;
 create function family_creator(p uuid) returns boolean language sql as $$select current_setting('test.creator',true)='true'$$;
 create function list_voice_library() returns table(publication_id uuid,public_id text,book_project_id uuid,title text,subtitle text,subject_name text,published_at timestamptz,access_mode text,relationship text)
 language sql as $$ select id,public_id,book_project_id,book_title,book_subtitle,subject_name,published_at,access_mode,'owner'::text from voice_publications where status='published' $$;
 insert into book_projects values('${id(3)}','${id(1)}');
 insert into project_supporters values('${id(3)}','${id(2)}','active',true);
 insert into voice_publications values('${id(4)}','stable-url','${id(3)}','Book','','QA',now(),'published','code');
 set test.uid='${id(1)}';set test.family='false';set test.creator='false';`);
 await db.exec(await readFile('supabase/migrations/202609230005_completed_web_book_library.sql','utf8'));
 assert.equal((await rpc('list_completed_web_book_library'))[0].can_manage_access,true);
 await db.exec("update voice_publications set status='disabled'");
 let shelf=await rpc('list_completed_web_book_library');
 assert.equal(shelf.length,1);assert.equal(shelf[0].public_id,'stable-url');assert.equal(shelf[0].status,'disabled');
 await assert.rejects(rpc('register_private_web_book_request',[id(4),'hash','metadata']),/Forbidden/);
 await db.exec("set test.role='service_role'");
 for(let i=0;i<30;i++)assert.equal((await rate()).allowed,true);
 assert.equal((await rate()).allowed,false);
 assert.equal((await db.query('select status from voice_publications')).rows[0].status,'disabled');
 await db.exec(`set test.uid='${id(2)}'`);
 assert.equal((await rpc('list_completed_web_book_library'))[0].relationship,'managed');
 await db.exec("update project_supporters set status='paused'");
 assert.equal((await rpc('list_completed_web_book_library')).length,0);
 await db.exec(`set test.uid='${id(99)}'`);
 assert.equal(await rpc('can_read_private_web_book',[id(3)]),false);
 await db.exec(`set test.uid=''`);
 assert.equal((await rpc('list_completed_web_book_library')).length,0);
 await db.exec(`set test.uid='${id(2)}';set test.family='true';set test.creator='true'`);
 assert.equal((await rpc('list_completed_web_book_library')).length,1);
 await db.exec("set test.creator='false';update project_supporters set status='active'");
 assert.equal((await rpc('list_completed_web_book_library')).length,0); // no legacy fallback after withdrawal
 await db.exec("set test.creator='true';update voice_publications set status='draft'");
 assert.equal((await rpc('list_completed_web_book_library')).length,0);
 console.log('PASS private bookshelf: published/disabled stable URL, owner/supporter, withdrawn/no legacy fallback, outsider/anonymous/draft denied');
}finally{await db.close();}
