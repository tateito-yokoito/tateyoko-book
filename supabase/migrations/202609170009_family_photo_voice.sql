begin;

-- A photo-origin question belongs to the existing mother's Project. A retry
-- keeps its identity and never renumbers existing questions or answers.
create function public.family_photo_question(p uuid, request_id uuid) returns uuid
language plpgsql security definer set search_path=public,auth as $$
declare q uuid; catalog_id text; seq integer; catalog_seq integer;
begin
 if request_id is null or not family_subject(p) or not experience_data_allowed(p,true)
 or not exists(select 1 from experience_contracts where book_project_id=p
   and main_experience_started_at is not null and refund_confirmed_at is null)
 then raise exception 'Subject main access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p::text,0));
 select id into q from user_questions where book_project_id=p
 and meta_json->>'photo_request_id'=request_id::text;
 if q is not null then return q; end if;
 lock table questions in share row exclusive mode;
 select coalesce(max(sequence_order),0)+1 into seq from user_questions where book_project_id=p;
 select coalesce(max(sequence_order),0)+1 into catalog_seq from questions;
 catalog_id:='FAMILY_PHOTO_'||replace(gen_random_uuid()::text,'-','');
 insert into questions(id,sequence_order,chapter,content,is_active,meta_json)
 values(catalog_id,catalog_seq,'写真から残した記憶','この写真について、覚えていることをお話しください。',true,
   '{"flow_type":"story","question_role":"custom_story"}');
 insert into user_questions(user_id,book_project_id,question_id,sequence_order,chapter,
   chapter_title_snapshot,question_text_snapshot,custom_question_text,status,is_active,meta_json)
 values(auth.uid(),p,catalog_id,seq,'写真から残した記憶','写真から残した記憶',
   'この写真について、覚えていることをお話しください。','この写真について、覚えていることをお話しください。',
   'pending',true,jsonb_build_object('flow_type','story','onboarding_group','photo_story',
     'is_custom',true,'photo_request_id',request_id)) returning id into q;
 return q;
end $$;
revoke all on function public.family_photo_question(uuid,uuid) from public,anon;
grant execute on function public.family_photo_question(uuid,uuid) to authenticated;

-- Audio, all text variants and the photo become one private answer atomically.
-- Photo reservations remain private while recording; no shared inbox commit.
create function public.family_commit_photo_voice(uploads uuid[], question_uuid uuid, draft jsonb, photo_upload uuid)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare photo family_uploads%rowtype; audio family_uploads%rowtype; b book_projects%rowtype; answer uuid;
begin
 select * into photo from family_uploads where id=photo_upload for update;
 select * into audio from family_uploads where id=uploads[1];
 if photo.id is null or photo.actor_id is distinct from auth.uid() or photo.kind<>'photo'
 or audio.id is null or photo.project_id<>audio.project_id or not family_subject(photo.project_id)
 or not experience_data_allowed(photo.project_id,true)
 then raise exception 'Forbidden photo' using errcode='42501'; end if;
 if not exists(select 1 from user_questions where id=question_uuid and book_project_id=photo.project_id
   and meta_json->>'onboarding_group'='photo_story')
 or not exists(select 1 from storage.objects where bucket_id='photos' and name=photo.path)
 or (photo.committed_at is null and photo.created_at<now()-interval '1 hour')
 then raise exception 'Photo unavailable'; end if;
 if photo.committed_at is not null and (audio.committed_at is null or photo.answer_id is distinct from audio.answer_id)
 then raise exception 'Invalid photo retry'; end if;
 if audio.committed_at is not null and photo.committed_at is null then raise exception 'Invalid photo retry'; end if;
 answer:=family_commit_voice(uploads,question_uuid,draft,null);
 if photo.committed_at is not null then return answer; end if;
 select * into b from book_projects where id=photo.project_id;
 insert into media_assets(answer_id,user_id,family_id,book_project_id,person_id,asset_type,storage_path,meta_json)
 values(answer,auth.uid(),b.family_id,b.id,b.subject_person_id,'photo',photo.path,
   jsonb_build_object('actor_user_id',auth.uid(),'story_origin','photo','part',1,'total_parts',1));
 update family_uploads set answer_id=answer,committed_at=now() where id=photo.id;
 update answers set meta_json=coalesce(meta_json,'{}')||jsonb_build_object(
   'story_origin','photo','print_title',left(coalesce(nullif(draft->>'photoStoryTitle',''),'この一枚のこと'),200),
   'title_source',coalesce(draft->>'photoStoryTitleSource','fallback'),
   'photo_caption',left(draft->>'photoStoryCaption',1000),'hide_prompt_in_book',true)
 where id=answer;
 return answer;
end $$;
revoke all on function public.family_commit_photo_voice(uuid[],uuid,jsonb,uuid) from public,anon;
grant execute on function public.family_commit_photo_voice(uuid[],uuid,jsonb,uuid) to authenticated;
commit;
