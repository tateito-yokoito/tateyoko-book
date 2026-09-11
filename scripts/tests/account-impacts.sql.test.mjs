// Run with QA_PGLITE_PATH pointing at an installed @electric-sql/pglite module.
// All fixtures live in an in-memory PostgreSQL database; no production access.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.QA_PGLITE_PATH || '@electric-sql/pglite');
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
await db.exec(`
create schema auth;
create role anon; create role authenticated;
create function auth.uid() returns uuid language sql as $$ select '${id(1)}'::uuid $$;
create function public.is_tateyoko_admin() returns boolean language sql as $$ select coalesce(current_setting('test.admin', true), 'yes') = 'yes' $$;
create table auth.users(id uuid primary key, banned_until timestamptz);
create table public.admin_users(user_id uuid, is_active boolean);
create table public.book_projects(id uuid primary key, owner_user_id uuid, purchaser_user_id uuid, title text, access_status text);
create table public.project_supporters(book_project_id uuid, supporter_user_id uuid, status text);
create table public.admin_trash_entries(entity_type text, entity_id uuid);
create table public.answers(id uuid primary key, book_project_id uuid, user_question_id uuid);
create table public.user_questions(id uuid primary key, meta_json jsonb);
create table public.media_assets(id uuid, book_project_id uuid, answer_id uuid, asset_type text);
create table public.video_stories(book_project_id uuid);
create table public.voice_publications(book_project_id uuid, status text);
create table public.story_sharing_preferences(id uuid, book_project_id uuid);
create table public.story_share_recipients(sharing_preference_id uuid, status text);
create table public.project_introductions(book_project_id uuid, body_text text, generation_status text, meta_json jsonb);
create function public.get_admin_project_display_names(uuid[]) returns jsonb language sql as $$ select '{}'::jsonb $$;
insert into auth.users values ('${id(1)}',null),('${id(2)}',null),('${id(3)}',now()+interval '1 year');
insert into admin_users values ('${id(1)}',true);
insert into book_projects values
 ('${id(10)}','${id(2)}','${id(2)}','Owned A','paid'),
 ('${id(11)}','${id(2)}',null,'Hidden B','trial'),
 ('${id(12)}','${id(1)}','${id(2)}','Others C','paid');
insert into project_supporters values
 ('${id(10)}','${id(2)}','active'), ('${id(10)}','${id(3)}','active'),
 ('${id(12)}','${id(2)}','active'), ('${id(11)}','${id(3)}','revoked');
insert into admin_trash_entries values ('book_project','${id(11)}');
insert into user_questions values ('${id(20)}','{"question_role":"starting_conversation"}'), ('${id(21)}','{}');
insert into answers values ('${id(30)}','${id(10)}','${id(20)}'),('${id(31)}','${id(10)}','${id(21)}'),('${id(32)}','${id(11)}','${id(21)}');
insert into media_assets values
 ('${id(40)}','${id(10)}','${id(30)}','audio'),('${id(41)}','${id(10)}','${id(30)}','audio'),
 ('${id(42)}','${id(10)}','${id(30)}','audio'),('${id(43)}','${id(10)}','${id(31)}','audio'),
 ('${id(44)}','${id(10)}','${id(31)}','photo');
insert into video_stories values ('${id(10)}'),('${id(10)}'),('${id(12)}');
insert into voice_publications values ('${id(10)}','published'),('${id(11)}','published'),('${id(10)}','disabled');
insert into story_sharing_preferences values ('${id(50)}','${id(10)}');
insert into story_share_recipients values ('${id(50)}','active'),('${id(50)}','pending'),('${id(50)}','revoked');
insert into project_introductions values ('${id(10)}','Intro','generated','{"additional_audio":[{},{}]}');
`);
await db.exec(await readFile(new URL('../../supabase/migrations/202609110001_add_admin_account_impacts.sql', import.meta.url), 'utf8'));
const result = await db.query('select public.get_admin_account_impacts($1::uuid[]) as impact', [[id(1),id(2),id(3)]]);
const data = result.rows[0].impact;
assert.equal(data[id(1)].is_admin, true);
assert.equal(data[id(3)].is_suspended, true);
const projects = data[id(2)].projects;
assert.equal(projects.length, 3, 'Multi-role projects must appear only once');
const a = projects.find(p => p.id === id(10));
assert.deepEqual(a.roles, ['owner','purchaser','supporter']);
assert.equal(a.answer_count, 2);
assert.equal(a.starting_count, 1);
assert.equal(a.addition_count, 2);
assert.equal(a.video_count, 2);
assert.equal(a.publication_count, 1);
assert.equal(a.supporter_count, 2);
assert.equal(a.sharing_count, 2);
assert.equal(a.introduction_count, 1);
assert.equal(a.introduction_addition_count, 2);
assert.equal(projects.find(p => p.id === id(11)).hidden, true);
assert.equal(projects.find(p => p.id === id(12)).roles.includes('owner'), false);
assert.equal(data[id(3)].projects.length, 1, 'Revoked supporter is not an active relationship');
assert.deepEqual((await db.query('select get_admin_account_impacts(null) as x')).rows[0].x, {});
await assert.rejects(db.query('select get_admin_account_impacts($1::uuid[])', [Array(251).fill(id(1))]), /250/);
await db.exec("set test.admin = 'no'");
await assert.rejects(db.query('select get_admin_account_impacts($1::uuid[])', [[id(2)]]), /Admin access required/);
await db.close();
console.log('PASS SQL: independent counts, multi-role deduplication, hidden projects, introductions, admin protection, empty/oversized/unauthorized requests');
