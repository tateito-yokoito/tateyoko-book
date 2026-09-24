// Evaluate the exact release function locally against the read-only production metadata snapshot.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const {PGlite}=await import(process.env.QA_PGLITE_PATH);
const dir='output/web-book-source-audit',a=JSON.parse(readFileSync(`${dir}/production-source-metadata.json`));
assert.equal(a.read_only,'on');
const db=new PGlite();
await db.exec(`create schema storage;create role anon;create role authenticated;create role service_role;
create table storage.objects(bucket_id text,name text,metadata jsonb);
create table book_projects(id uuid,owner_user_id uuid,subject_person_id uuid,family_id uuid);
create table media_assets(id uuid,asset_type text,storage_path text,book_project_id uuid,person_id uuid,family_id uuid,answer_id uuid);
create table answers(id uuid,book_project_id uuid,subject_person_id uuid,user_question_id uuid,question_id text);
create table user_questions(id uuid,book_project_id uuid);
create table questions(id text);
create table project_supporters(book_project_id uuid,supporter_user_id uuid,status text);
create table family_uploads(id uuid,path text,project_id uuid,answer_id uuid,actor_id uuid,kind text,committed_at timestamptz);
create table video_stories(id uuid,book_project_id uuid,subject_person_id uuid,status text,created_by_user_id uuid,source_answer_id uuid,video_storage_path text,audio_storage_path text,poster_storage_path text);
create table book_cover_settings(book_project_id uuid,cover_photo_path text,premium_cover_photo_path text);`);
for(const table of ['book_projects','media_assets','answers','user_questions','questions','project_supporters','family_uploads','video_stories','book_cover_settings'])
 await db.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`,[JSON.stringify(a[table])]);
await db.query('insert into storage.objects select * from jsonb_populate_recordset(null::storage.objects,$1::jsonb)',[JSON.stringify(a.storage_objects)]);
const source=readFileSync('supabase/migrations/202609240002_publication_legacy_question_compat.sql','utf8');
await db.exec(source);
const objects=new Map(a.storage_objects.map(o=>[o.bucket_id+'/'+o.name,o]));
const projects=new Map(a.book_projects.map(p=>[p.id,p]));
const answers=new Map(a.answers.map(x=>[x.id,x]));
const sources=[];
for(const m of a.media_assets.filter(m=>['audio','photo'].includes(m.asset_type)))sources.push({project:m.book_project_id,kind:m.asset_type,bucket:m.asset_type==='audio'?'audio':'photos',path:m.storage_path,id:m.id,answer:m.answer_id,part:m.meta_json?.part});
for(const v of a.video_stories)for(const [field,kind] of [['video_storage_path','video'],['audio_storage_path','video_audio'],['poster_storage_path','video_poster']])
 if(v[field])sources.push({project:v.book_project_id,kind,bucket:'videos',path:v[field],id:v.id,answer:v.source_answer_id});
for(const c of a.book_cover_settings)for(const [field,kind] of [['cover_photo_path','cover'],['premium_cover_photo_path','premium_cover']])
 if(c[field])sources.push({project:c.book_project_id,kind,bucket:'photos',path:c[field],id:c.book_project_id});
for(const s of sources){
 s.allowed=(await db.query('select publication_source_asset_allowed($1::uuid,$2,$3,$4,$5::uuid) as allowed',[s.project,s.bucket,s.path,s.kind,s.id])).rows[0].allowed;
 const p=projects.get(s.project),ans=answers.get(s.answer),parts=s.path?.split('/')||[];
 s.format=s.path?.startsWith('family/')?'family':s.path?.startsWith('book-covers/')?'book-cover':parts.length===4&&parts[1]===s.project&&parts[2]===s.answer?'account/project/answer':parts.length===3&&parts[1]===s.answer?'legacy-account/answer':'nonstandard';
 s.legacyQuestion=Boolean(ans&&!ans.user_question_id&&ans.question_id);
 s.findings=[];
 if(!p)s.findings.push('project_missing');
 if(p&&!a.persons.some(x=>x.id===p.subject_person_id))s.findings.push('person_missing');
 if(!objects.has(s.bucket+'/'+s.path))s.findings.push('storage_missing');
 if(Number(objects.get(s.bucket+'/'+s.path)?.metadata?.size)<=0)s.findings.push('storage_empty');
 if(s.answer&&!ans)s.findings.push('answer_missing');
 if(ans&&(ans.book_project_id!==s.project||ans.subject_person_id!==p?.subject_person_id))s.findings.push('answer_scope_mismatch');
 const m=a.media_assets.find(m=>m.id===s.id);
 if(m&&(m.person_id!==p?.subject_person_id||(m.family_id&&m.family_id!==p?.family_id)))s.findings.push('media_scope_mismatch');
 if(!s.allowed&&!s.findings.length)s.findings.push('authorization_denied_other');
}
const group=(xs,f)=>xs.reduce((o,x)=>(o[f(x)]=(o[f(x)]||0)+1,o),{});
const referenced=new Set(sources.map(s=>s.bucket+'/'+s.path));
const unreferenced=a.storage_objects.filter(o=>!referenced.has(o.bucket_id+'/'+o.name));
const report={at:new Date().toISOString(),capturedAt:a.at,readOnly:true,remoteWrites:false,
 functionSha256:createHash('sha256').update(source).digest('hex'),
 counts:{sources:sources.length,allowed:sources.filter(s=>s.allowed).length,denied:sources.filter(s=>!s.allowed).length,
   kinds:group(sources,s=>s.kind),formats:group(sources,s=>s.format),legacyQuestion:sources.filter(s=>s.legacyQuestion).length,
   unreferencedObjects:unreferenced.length,additionalAudio:sources.filter(s=>s.kind==='audio'&&(Number(s.part)>1||/part-0[2-9]/.test(s.path))).length},
 sources,unreferenced,
 projects:a.book_projects.map(p=>({id:p.id,status:p.status,media:sources.filter(s=>s.project===p.id).length,denied:sources.filter(s=>s.project===p.id&&!s.allowed).length,orders:a.commerce_orders.filter(o=>o.book_project_id===p.id).map(o=>o.status)}))};
writeFileSync(`${dir}/authorization-audit.json`,JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify({at:report.at,functionSha256:report.functionSha256,...report.counts,findings:group(sources.flatMap(s=>s.findings),s=>s)},null,2));
await db.close();
