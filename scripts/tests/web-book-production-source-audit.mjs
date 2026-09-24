// Production metadata ONLY. No application RPC, DDL, DML, Storage download, or secret read.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
assert.equal(process.argv[2],'--read-only');
const cli=process.env.QA_SUPABASE_CLI;assert.ok(cli);
const dir='output/web-book-source-audit';mkdirSync(dir,{recursive:true,mode:0o700});
const tables={
 book_projects:['id','owner_user_id','subject_person_id','family_id','status','created_at','updated_at'],
 media_assets:['id','asset_type','storage_path','book_project_id','person_id','family_id','answer_id','created_at','meta_json'],
 answers:['id','book_project_id','subject_person_id','user_id','user_question_id','question_id','created_at','updated_at','access_override'],
 user_questions:['id','book_project_id','question_id'],questions:['id'],
 persons:['id','family_id'],
 project_supporters:['id','book_project_id','supporter_user_id','status'],
 family_uploads:['id','path','project_id','answer_id','actor_id','kind','committed_at'],
 video_stories:['id','book_project_id','subject_person_id','status','created_by_user_id','source_answer_id','video_storage_path','audio_storage_path','poster_storage_path'],
 book_cover_settings:['book_project_id','cover_photo_path','premium_cover_photo_path'],
 book_work_manifests:['id','book_project_id','confirmed_at','answer_ids','revision'],
 commerce_orders:['id','book_project_id','status','order_type','paid_at','created_at'],
 voice_publications:['id','book_project_id','status','work_manifest_id','published_at'],
 family_subject_bindings:['project_id','subject_person_id','subject_account_id','supporter_account_id','status'],
 family_production_consents:['id','project_id','subject_person_id','supporter_account_id','revoked_at','confirmed_at'],
};
const selects=Object.entries(tables).map(([table,cols])=>`'${table}',(select coalesce(jsonb_agg(jsonb_build_object(${cols.map(c=>c==='meta_json'?`'meta_json',jsonb_build_object('part',t.meta_json->'part','video_id',t.meta_json->'video_id')`:`'${c}',to_jsonb(t)->'${c}'`).join(',')})),'[]') from public.${table} t)`);
const sql=`begin read only;set local statement_timeout='45s';
select jsonb_build_object('read_only',current_setting('transaction_read_only'),
${selects.join(',\n')},
'identity_checks',jsonb_build_object(
 'missing_project_account',(select count(*) from public.book_projects p where not exists(select 1 from auth.users u where u.id=p.owner_user_id)),
 'missing_project_person',(select count(*) from public.book_projects p where not exists(select 1 from public.persons s where s.id=p.subject_person_id)),
 'project_person_family_mismatch',(select count(*) from public.book_projects p join public.persons s on s.id=p.subject_person_id where p.family_id is distinct from s.family_id),
 'answer_account_mismatch',(select count(*) from public.answers a join public.book_projects p on p.id=a.book_project_id where a.user_id is distinct from p.owner_user_id)
),
'family_gate',(select jsonb_build_object('enabled',enabled,'allowlist_count',cardinality(allowed_actor_ids),'connection',subject_connection_enabled) from family_private.rollout limit 1),
'unreferenced_history',(select coalesce(jsonb_agg(jsonb_build_object('bucket',s.bucket_id,'path',s.name,
 'retired',exists(select 1 from family_private.retired_media r where jsonb_path_exists(to_jsonb(r),'$.** ? (@ == $path)',jsonb_build_object('path',s.name))),
 'voice_revision',exists(select 1 from family_private.voice_revisions r where jsonb_path_exists(to_jsonb(r),'$.** ? (@ == $path)',jsonb_build_object('path',s.name))),
 'milestone_upload',exists(select 1 from public.book_milestone_uploads r where jsonb_path_exists(to_jsonb(r),'$.** ? (@ == $path)',jsonb_build_object('path',s.name))),
 'milestone_revision',exists(select 1 from public.book_milestone_revisions r where jsonb_path_exists(to_jsonb(r),'$.** ? (@ == $path)',jsonb_build_object('path',s.name)))
 )),'[]') from storage.objects s where s.bucket_id='audio' and not exists(select 1 from public.media_assets m where m.storage_path=s.name)),
'storage_objects',(select coalesce(jsonb_agg(jsonb_build_object('bucket_id',bucket_id,'name',name,'metadata',jsonb_build_object('size',metadata->'size'),'created_at',created_at)),'[]') from storage.objects where bucket_id in('audio','photos','videos')),
'snapshot_refs',(select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'book_project_id',w.book_project_id,'confirmed_at',w.confirmed_at,
 'media',(select coalesce(jsonb_agg(jsonb_build_object('id',a->'id','asset_type',a->'asset_type','storage_path',a->'storage_path','answer_id',a->'answer_id')),'[]') from jsonb_array_elements(coalesce(w.snapshot->'media','[]')||coalesce(w.snapshot->'web_intro'->'media','[]')) a),
 'cover',jsonb_build_object('cover_photo_path',w.snapshot->'cover'->'cover_photo_path','premium_cover_photo_path',w.snapshot->'cover'->'premium_cover_photo_path'),
 'videos',(select coalesce(jsonb_agg(jsonb_build_object('id',v->'id','video_storage_path',v->'video_storage_path','audio_storage_path',v->'audio_storage_path','poster_storage_path',v->'poster_storage_path')),'[]') from jsonb_array_elements(coalesce(w.snapshot->'videos','[]')||coalesce(w.snapshot->'web_intro'->'videos','[]')) v)
 )),'[]') from public.book_work_manifests w where w.snapshot is not null)
) as audit;commit;`;
const raw=execFileSync(cli,['db','query','--linked','--project-ref','wquxjeqkumossjxehdop',sql],{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe'],timeout:120000});
const response=JSON.parse(raw.slice(raw.indexOf('{')));assert.ok(!response.error,JSON.stringify(response.error));
const audit=response.rows[0].audit;assert.equal(audit.read_only,'on');
// Only operational metadata; no names, email, transcripts, PIN, or credentials.
for(const m of audit.media_assets)m.meta_json={part:m.meta_json?.part,video_id:m.meta_json?.video_id};
writeFileSync(`${dir}/production-source-metadata.json`,JSON.stringify({at:new Date().toISOString(),...audit},null,2),{mode:0o600});
console.log(JSON.stringify({readOnly:true,counts:Object.fromEntries(Object.entries(audit).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length]))}));
