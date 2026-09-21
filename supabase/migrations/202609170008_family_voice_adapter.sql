begin;

-- A narrow capability for the existing transcription/polish endpoints. It does
-- NOT grant supporters project-wide processing or access to existing answers.
create function public.family_pending_voice_scope(p uuid, actor uuid, uploads uuid[])
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare u family_uploads%rowtype; item uuid; paths text[] := '{}';
begin
 if actor is null or not family_managed(p)
 or not (family_subject(p,actor) or family_supporter(p,actor))
 or not experience_data_allowed(p,true) then raise exception 'Forbidden' using errcode='42501'; end if;
 if coalesce(cardinality(uploads),0) not between 1 and 5
 or (select count(distinct x) from unnest(uploads) x)<>cardinality(uploads)
 then raise exception 'Invalid uploads'; end if;
 foreach item in array uploads loop
  select * into u from family_uploads where id=item;
  if u.id is null or u.project_id<>p or u.actor_id<>actor or u.kind<>'audio'
  or u.committed_at is not null or u.created_at<now()-interval '1 hour'
  or not exists(select 1 from storage.objects where bucket_id='audio' and name=u.path)
  then raise exception 'Forbidden upload' using errcode='42501'; end if;
  paths:=array_append(paths,u.path);
 end loop;
 return jsonb_build_object('paths',paths,'subject',family_subject(p,actor));
end $$;
revoke all on function public.family_pending_voice_scope(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.family_pending_voice_scope(uuid,uuid,uuid[]) to service_role;

-- Persist the established review UI's variants and all parts atomically. The
-- first reserved upload is the retry key; retries never append the text twice.
create function public.family_commit_voice(uploads uuid[], question_uuid uuid, draft jsonb, continuation uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare first_upload family_uploads%rowtype; u family_uploads%rowtype; b book_projects%rowtype;
 item uuid; answer uuid; style text; display_text text; duration integer;
begin
 if coalesce(cardinality(uploads),0) not between 1 and 5
 or (select count(distinct x) from unnest(uploads) x)<>cardinality(uploads)
 then raise exception 'Invalid uploads'; end if;
 -- Deterministic lock order avoids deadlocks with a reordered request.
 perform 1 from family_uploads where id=any(uploads) order by id for update;
 select * into first_upload from family_uploads where id=uploads[1];
 if first_upload.id is null or first_upload.actor_id is distinct from auth.uid()
 or not (family_subject(first_upload.project_id) or family_supporter(first_upload.project_id))
 then raise exception 'Forbidden' using errcode='42501'; end if;
 if first_upload.committed_at is not null then
  if not exists(select 1 from answers where id=first_upload.answer_id and user_question_id=question_uuid)
  or exists(select 1 from unnest(uploads) x left join family_uploads f on f.id=x
    where f.id is null or f.actor_id<>auth.uid() or f.answer_id is distinct from first_upload.answer_id)
  then raise exception 'Invalid retry'; end if;
  return first_upload.answer_id;
 end if;
 perform family_pending_voice_scope(first_upload.project_id,auth.uid(),uploads);
 style:=coalesce(draft->>'selectedStyle','readable');
 if draft is null or style not in ('clean','readable','essay') or jsonb_typeof(draft)<>'object'
 or octet_length(draft::text)>400000 then raise exception 'Invalid draft'; end if;
 display_text:=coalesce(nullif(draft->>'editedText',''),draft->>'transcriptReadable',draft->>'transcript','');
 duration:=greatest(0,least(1500,coalesce((draft->>'duration')::integer,0)));
 -- The existing commit enforces paid start, target question and continuation
 -- visibility. Supporters still cannot append to an unseen private answer.
 answer:=family_commit_recording(uploads[1],question_uuid,display_text,false,continuation);
 select * into b from book_projects where id=first_upload.project_id;
 foreach item in array uploads[2:cardinality(uploads)] loop
  select * into u from family_uploads where id=item;
  insert into media_assets(answer_id,user_id,family_id,book_project_id,person_id,asset_type,storage_path,meta_json)
  values(answer,auth.uid(),b.family_id,b.id,b.subject_person_id,'audio',u.path,
   jsonb_build_object('actor_user_id',auth.uid(),'segment_id',u.id));
  update family_uploads set committed_at=now(),answer_id=answer where id=item;
 end loop;
 if continuation is null then
  update answers set transcript_raw=coalesce(draft->>'transcript',''),
   transcript_clean=coalesce(draft->>'transcriptClean',''),
   transcript_readable=coalesce(draft->>'transcriptReadable',''),
   transcript_essay=coalesce(draft->>'transcriptEssay',''),
   transcript_edited=display_text,selected_style=style,
   meta_json=coalesce(meta_json,'{}')||jsonb_build_object('duration_seconds',duration)
  where id=answer;
 end if;
 return answer;
end $$;
revoke all on function public.family_commit_voice(uuid[],uuid,jsonb,uuid) from public,anon;
grant execute on function public.family_commit_voice(uuid[],uuid,jsonb,uuid) to authenticated;
commit;
