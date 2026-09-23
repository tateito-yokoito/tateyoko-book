import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {isWebBookPin} from '../../src/lib/webBookPin.js';
for(const value of ['','0000','1234','9999'])assert.ok(isWebBookPin(value));
for(const value of ['1','123','12345','１２３４','abcd','1234\n'])assert.ok(!isWebBookPin(value));
const runtime=process.env.QA_PGLITE_PATH;
const {PGlite}=await import(runtime),{pgcrypto}=await import(new URL('./contrib/pgcrypto.js',pathToFileURL(runtime)));
const db=new PGlite({extensions:{pgcrypto}});
try {
 await db.exec(`create schema auth;create schema extensions;create extension pgcrypto with schema extensions;
 create role anon;create role authenticated;create role service_role;
 create function auth.role() returns text language sql as $$select current_setting('test.role',true)$$;
 create table voice_publications(id uuid primary key,access_mode text,access_code_hash text,access_code_changed_at timestamptz);
 create table voice_publication_access_sessions(publication_id uuid);
 insert into voice_publications values('00000000-0000-0000-0000-000000000001','code',extensions.crypt('123456',extensions.gen_salt('bf',4)),now());`);
 const oldHash=(await db.query('select access_code_hash h from voice_publications')).rows[0].h;
 await db.exec(await readFile('supabase/migrations/202609230002_web_book_pin.sql','utf8'));
 assert.equal((await db.query('select access_code_hash h from voice_publications')).rows[0].h,oldHash);
 const set=pin=>db.query("select set_voice_publication_access_code('00000000-0000-0000-0000-000000000001',$1)",[pin]);
 await db.exec("set test.role='authenticated'");await assert.rejects(set('1234'),/forbidden/);
 await db.exec("set test.role='service_role'");
 for(const pin of ['123','12345','１２３４'])await assert.rejects(set(pin),/4 digits/);
 await set('0000');
 assert.ok((await db.query("select access_code_hash=extensions.crypt('0000',access_code_hash) valid from voice_publications")).rows[0].valid);
 await set('');assert.equal((await db.query('select access_mode from voice_publications')).rows[0].access_mode,'link');
 console.log('PASS PIN: four digits, leading zero, removal, server role, hash storage, existing hash unchanged');
} finally {await db.close();}
