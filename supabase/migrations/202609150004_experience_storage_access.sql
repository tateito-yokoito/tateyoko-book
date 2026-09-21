begin;
-- Resolve both pre-v2 user/answer paths and v2 user/project/answer paths.
create function public.experience_storage_allowed(input_bucket text,input_name text,input_write boolean) returns boolean
 language plpgsql stable security definer set search_path=public,auth as $$
declare pid uuid; segment text:=split_part(input_name,'/',2);
begin
 if input_bucket not in ('audio','photos','videos') or input_name like 'published/%' then return true; end if;
 select coalesce(m.book_project_id,a.book_project_id) into pid from media_assets m left join answers a on a.id=m.answer_id
   where m.storage_path=input_name limit 1;
 if pid is null and segment ~ '^[0-9a-fA-F-]{36}$' then
   select id into pid from book_projects where id=segment::uuid;
   if pid is null then select book_project_id into pid from answers where id=segment::uuid; end if;
 end if;
 if pid is null and segment='introductions' and split_part(input_name,'/',3) ~ '^[0-9a-fA-F-]{36}$' then
   select book_project_id into pid from project_introductions where id=split_part(input_name,'/',3)::uuid;
 end if;
 if pid is not null then return experience_data_allowed(pid,input_write); end if;
 -- An unassociated new file cannot evade the contract by inventing another answer ID.
 if input_write and exists(select 1 from experience_contracts c join book_projects p on p.id=c.book_project_id
   where p.owner_user_id=auth.uid() and c.payment_confirmed_at is not null) then return false; end if;
 return true;
end; $$;
revoke all on function experience_storage_allowed(text,text,boolean) from public,anon;
grant execute on function experience_storage_allowed(text,text,boolean) to authenticated,service_role;
create policy experience_storage_read on storage.objects as restrictive for select to authenticated
 using(experience_storage_allowed(bucket_id,name,false));
create policy experience_storage_insert on storage.objects as restrictive for insert to authenticated
 with check(experience_storage_allowed(bucket_id,name,true));
create policy experience_storage_update on storage.objects as restrictive for update to authenticated
 using(experience_storage_allowed(bucket_id,name,true)) with check(experience_storage_allowed(bucket_id,name,true));
-- Save each supporter recording as an immutable audio part. Retrying the same
-- segment is idempotent; continuing never deletes earlier audio or its metadata.
create or replace function public.append_supporter_recording(
  input_book_project_id uuid,
  input_user_question_id uuid,
  input_answer_id uuid,
  input_transcript_raw text,
  input_transcript_readable text,
  input_transcript_essay text,
  input_selected_style text,
  input_storage_paths text[],
  input_duration_seconds numeric default 0
)
returns uuid language plpgsql security definer set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  target_project public.book_projects%rowtype;
  target_question public.user_questions%rowtype;
  target_answer public.answers%rowtype;
  audio_path text;
  part_count integer;
  readable text := coalesce(nullif(input_transcript_readable, ''), input_transcript_raw, '');
begin
  if actor is null or not exists (
    select 1 from public.project_supporters
    where book_project_id = input_book_project_id and supporter_user_id = actor
      and status = 'active' and can_operate_recording = true
  ) then raise exception 'Supporter recording access is not allowed'; end if;

  select * into target_project from public.book_projects
  where id = input_book_project_id and status = 'active';
  if target_project.id is null then raise exception 'Book project was not found'; end if;

  -- Serialize saves for this question, including a retry following a timeout.
  select * into target_question from public.user_questions
  where id = input_user_question_id and book_project_id = input_book_project_id
    and is_active = true for update;
  if target_question.id is null then raise exception 'Question was not found'; end if;

  if input_answer_id is null or coalesce(cardinality(input_storage_paths), 0) <> 1 then
    raise exception 'Exactly one audio segment is required';
  end if;
  audio_path := input_storage_paths[1];
  if audio_path is null or audio_path not in (
    actor::text || '/' || input_book_project_id::text || '/' || input_answer_id::text || '/part-01.mp4',
    actor::text || '/' || input_book_project_id::text || '/' || input_answer_id::text || '/part-01.aac',
    actor::text || '/' || input_book_project_id::text || '/' || input_answer_id::text || '/part-01.webm',
    actor::text || '/' || input_answer_id::text || '/part-01.mp4',
    actor::text || '/' || input_answer_id::text || '/part-01.aac',
    actor::text || '/' || input_answer_id::text || '/part-01.webm'
  ) then raise exception 'Forbidden audio path'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'audio' and name = audio_path) then
    raise exception 'Uploaded audio was not found';
  end if;
  if input_duration_seconds is null or input_duration_seconds < 0 or input_duration_seconds > 86400 then
    raise exception 'Invalid duration';
  end if;

  select * into target_answer from public.answers
  where book_project_id = input_book_project_id and user_question_id = input_user_question_id
  order by created_at desc limit 1 for update;
  if exists (select 1 from public.media_assets where storage_path = audio_path and asset_type = 'audio') then
    if exists (select 1 from public.media_assets where answer_id = target_answer.id
      and storage_path = audio_path and asset_type = 'audio') then
      return target_answer.id;
    end if;
    raise exception 'Audio segment already belongs to another answer';
  end if;

  if target_answer.id is null then
    insert into public.answers (
      id, user_id, book_project_id, speaker_person_id, subject_person_id,
      user_question_id, question_id, sequence_order, transcript_raw,
      transcript_clean, transcript_readable, transcript_essay, transcript_edited,
      selected_style, ai_mirror, snippet, meta_json
    ) values (
      input_answer_id, target_project.owner_user_id, target_project.id,
      target_project.subject_person_id, target_project.subject_person_id,
      target_question.id, target_question.question_id, target_question.sequence_order,
      coalesce(input_transcript_raw, ''), readable, readable, nullif(input_transcript_essay, ''), readable,
      'readable', 'ご家族と残した声が、ひとつの物語になりました', '',
      jsonb_build_object('recorded_with_supporter', true, 'supporter_user_id', actor,
        'duration_seconds', input_duration_seconds)
    ) returning * into target_answer;
  else
    update public.answers set
      transcript_raw = concat_ws(E'\n\n', nullif(transcript_raw, ''), nullif(input_transcript_raw, '')),
      transcript_clean = concat_ws(E'\n\n', nullif(transcript_clean, ''), nullif(readable, '')),
      transcript_readable = concat_ws(E'\n\n', nullif(transcript_readable, ''), nullif(readable, '')),
      transcript_essay = concat_ws(E'\n\n', nullif(transcript_essay, ''), nullif(input_transcript_essay, '')),
      transcript_edited = concat_ws(E'\n\n', coalesce(nullif(transcript_edited, ''), nullif(transcript_readable, '')), nullif(readable, '')),
      selected_style = 'readable',
      meta_json = coalesce(meta_json, '{}'::jsonb) || jsonb_build_object(
        'recorded_with_supporter', true, 'supporter_user_id', actor,
        'duration_seconds', coalesce((meta_json->>'duration_seconds')::numeric, 0) + input_duration_seconds
      )
    where id = target_answer.id;
  end if;

  select count(*) + 1 into part_count from public.media_assets
  where answer_id = target_answer.id and asset_type = 'audio';
  insert into public.media_assets (
    answer_id, user_id, family_id, book_project_id, person_id, asset_type, storage_path, meta_json
  ) values (
    target_answer.id, target_project.owner_user_id, target_project.family_id,
    target_project.id, target_project.subject_person_id, 'audio', audio_path,
    jsonb_build_object('part', part_count, 'total_parts', part_count,
      'recorded_with_supporter', true, 'supporter_user_id', actor,
      'segment_id', input_answer_id, 'duration_seconds', input_duration_seconds)
  );
  update public.media_assets set meta_json = coalesce(meta_json, '{}'::jsonb) || jsonb_build_object('total_parts', part_count)
  where answer_id = target_answer.id and asset_type = 'audio';
  update public.user_questions set status = 'answered', answered_at = coalesce(answered_at, now())
  where id = target_question.id;
  return target_answer.id;
end;
$$;

revoke all on function public.append_supporter_recording(uuid, uuid, uuid, text, text, text, text, text[], numeric) from public;
grant execute on function public.append_supporter_recording(uuid, uuid, uuid, text, text, text, text, text[], numeric) to authenticated;
commit;
