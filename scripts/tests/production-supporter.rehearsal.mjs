// Offline rehearsal from read-only production schema metadata. No remote writes.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const runtime=process.env.QA_PGLITE_PATH;assert.ok(runtime);
const {PGlite}=await import(runtime),{pgcrypto}=await import(new URL('./contrib/pgcrypto.js',pathToFileURL(runtime)));
const db=new PGlite({extensions:{pgcrypto}}),dir='output/supporter-preflight';
const prod=JSON.parse(await readFile(`${dir}/production-schema.json`)),test=JSON.parse(await readFile(`${dir}/test-schema.json`));
const q=s=>'"'+s.replaceAll('"','""')+'"';
const migrations=[
 '202609170002_family_subject_connection.sql','202609170003_family_subject_rls.sql','202609170004_family_legacy_guards.sql',
 '202609170005_family_creation_payer_guard.sql','202609170006_family_paid_journey.sql','202609170007_family_journey_guards.sql',
 '202609170008_family_voice_adapter.sql','202609170009_family_photo_voice.sql','202609170010_family_story_editor.sql',
 '202609170011_family_voice_revision.sql','202609170012_family_theme_navigation.sql',
 // 170013 is TEST-only delivery preferences; not a production dependency.
 '202609170014_family_legacy_question_index.sql',
 '202609210003_production_supporter.sql','202609210004_production_start_audit_key.sql',
 '202609210005_separate_production_mode_and_authority.sql','202609210006_preserve_supporter_sms_compatibility.sql'];
const needles={
 'family_private.theme_navigation(uuid)':['not family_subject(p)'],
 'family_workspace(uuid)':['progress:=own or','(own or (custom_question_text','(own or actor_id=auth.uid())',"'connected',s.claimed_at is not null"],
 'family_journey(uuid)':["w->>'role'='subject'"],
 'save_book_selection(uuid,uuid[],integer)':["a.access_override is distinct from 'private_forever'"],
 'confirm_book_work(uuid,integer,boolean)':["a.access_override is distinct from 'private_forever'"]};
const dynamicNames=['can_manage_book_cover','can_manage_video_stories','assert_experience_processing','family_original_asset_read','family_storage_access','family_recipient_allowed','family_finish_starting_chapter','family_photo_question','family_commit_photo_voice','family_edit_story','family_remove_story_photo','family_attach_story_photo','family_voice_edit_context','family_revise_voice','family_order_privacy_guard'];
const report={at:new Date().toISOString(),sourceCapturedAt:prod.at,remoteReadOnly:true,userDataCopied:false,stubs:['auth.uid/jwt/role','auth.users structure','storage.objects structure'],applied:[],replacementChecks:[],comparison:[]};
const norm=s=>s.replace(/\s+/g,' ').trim(),hash=s=>createHash('sha256').update(s).digest('hex');
try{
 assert.equal(Object.keys(prod.indexConflicts||{}).length,4,'Read-only uniqueness checks are required');
 assert.ok(Object.values(prod.indexConflicts).every(n=>n===0),'Production index conflicts require manual review');
 await db.exec(`create schema auth;create schema storage;create schema extensions;create schema family_private;
 create extension pgcrypto with schema extensions;
 create role authenticated;create role anon;create role service_role bypassrls;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
 create function auth.role() returns text language sql as $$select current_user::text$$;
 create table auth.users(id uuid primary key,email text,phone text,phone_confirmed_at timestamptz,last_sign_in_at timestamptz,raw_user_meta_data jsonb default '{}',created_at timestamptz,updated_at timestamptz);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb,created_at timestamptz default now());
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 set check_function_bodies=off;`);
 for(const s of prod.sequences||[])await db.exec(`create sequence ${q(s.schema)}.${q(s.name)}`);
 for(const [key,values] of Map.groupBy(prod.enums||[],x=>x.schema+'.'+x.name))await db.exec(`create type ${key} as enum (${values.sort((a,b)=>a.order-b.order).map(x=>"'"+x.label.replaceAll("'","''")+"'").join(',')})`);
 for(const [table,cols] of Map.groupBy(prod.columns,c=>`${q(c.table_schema)}.${q(c.table_name)}`))await db.exec(`create table ${table} (${cols.sort((a,b)=>a.ordinal_position-b.ordinal_position).map(c=>`${q(c.column_name)} ${c.udt_name.startsWith('_')?c.udt_name.slice(1)+'[]':c.udt_name}${c.column_default?' default '+c.column_default:''}${c.is_nullable==='NO'?' not null':''}`).join(',')})`);
 for(const c of [...prod.constraints].sort((a,b)=>Number(a.def.startsWith('FOREIGN KEY'))-Number(b.def.startsWith('FOREIGN KEY'))))await db.exec(`alter table ${c.table} add constraint ${q(c.name)} ${c.def}`);
 for(const i of prod.indexes)await db.exec(i.definition);
 for(const f of prod.functions)await db.exec(f.definition);
 for(const t of prod.triggers)await db.exec(t.definition);
 for(const t of prod.tables)if(t.rls)await db.exec(`alter table ${q(t.schema)}.${q(t.name)} enable row level security`);
 for(const p of prod.policies)await db.exec(`create policy ${q(p.policyname)} on ${q(p.schemaname)}.${q(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(q).join(',')}${p.qual?' using ('+p.qual+')':''}${p.with_check?' with check ('+p.with_check+')':''}`);
 await db.exec('set check_function_bodies=on;');
 const defs=async()=> (await db.query("select p.oid::regprocedure::text signature,p.proname name,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','family_private') and p.prokind='f'")).rows;
 for(const name of migrations){
  assert.ok(!prod.migrations.some(m=>m.version===name.split('_')[0]),'Do not reapply an existing migration');
  if(name.startsWith('202609210003')){
   const functions=await defs();
   for(const f of functions.filter(f=>dynamicNames.includes(f.name)))needles[f.signature]=['family_subject('];
   for(const name of dynamicNames)assert.ok(functions.some(f=>f.name===name),`Missing ${name}`);
   for(const [signature,strings] of Object.entries(needles)){
    const f=functions.find(f=>f.signature===signature);assert.ok(f,`Missing ${signature}`);
    for(const needle of strings){const count=f.definition.split(needle).length-1;assert.ok(count>0,`Absent replacement ${signature}: ${needle}`);report.replacementChecks.push({signature,needle,count});}
   }
  }
  await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
  report.applied.push(name);console.log('LOCAL_APPLIED '+name);
 }
 const after=await defs();
 for(const signature of Object.keys(needles)){
  const a=after.find(f=>f.signature===signature),b=test.functions.find(f=>f.signature===signature);
  report.comparison.push({signature,testPresent:!!b,exactMatch:!!b&&a.definition===b.definition,normalizedMatch:!!b&&norm(a.definition)===norm(b.definition),localHash:hash(a.definition),testHash:b?hash(b.definition):null});
 }
 assert.ok(report.comparison.every(x=>x.normalizedMatch),'Dynamic replacement definitions must match the captured TEST definitions');
 const before=new Map(prod.functions.map(f=>[f.signature,f.definition]));
 report.modifiedProductionFunctions=after.filter(f=>before.has(f.signature)&&before.get(f.signature)!==f.definition).map(f=>f.signature);
 report.remainingFunctionDifferences=report.modifiedProductionFunctions.filter(signature=>{
  const a=after.find(f=>f.signature===signature),b=test.functions.find(f=>f.signature===signature);
  return !b||norm(a.definition)!==norm(b.definition);
 });
 assert.ok(report.remainingFunctionDifferences.every(s=>s==='can_confirm_experience_intent(uuid)'),'All changed existing functions must match TEST except the intentional new authority fix');
 for(const name of ['respond_to_supporter_invite','respond_to_supporter_invite_resilient','list_owned_project_supporters']){
  const a=after.find(f=>f.name===name),b=test.functions.find(f=>f.name===name);
  assert.equal(norm(a.definition),norm(b.definition),`Preserve current SMS support and family guards: ${name}`);
 }
 await writeFile(`${dir}/rehearsed-functions.json`,JSON.stringify(after,null,2),{mode:0o600});
 report.pass=true;
}catch(e){report.pass=false;report.error=e.message;report.where=e.where;console.error({error:e.message,where:e.where});process.exitCode=1;}
finally{await writeFile(`${dir}/rehearsal-report.json`,JSON.stringify(report,null,2));await db.close();console.log(JSON.stringify({pass:report.pass,applied:report.applied.length,replacementChecks:report.replacementChecks.length,mismatches:report.comparison.filter(x=>!x.normalizedMatch).map(x=>x.signature)}));}
