-- Photos may be attached before an answer exists. Keep them outside answers and
-- media_assets until the user explicitly finishes the question: answer INSERT
-- fires the existing progress trigger. The object already lives in the private
-- photos bucket, under the acting user's path.
begin;

create table public.book_answer_photo_drafts (
  id uuid primary key,
  book_project_id uuid not null references public.book_projects(id),
  user_question_id uuid not null references public.user_questions(id),
  user_id uuid not null references auth.users(id),
  storage_path text not null unique,
  sort_order integer not null check (sort_order between 0 and 1000),
  meta_json jsonb not null default '{}'::jsonb,
  answer_id uuid references public.answers(id),
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint book_answer_photo_draft_commit_pair check
    ((answer_id is null and committed_at is null) or
     (answer_id is not null and committed_at is not null))
);
create index book_answer_photo_drafts_question_idx on public.book_answer_photo_drafts
  (user_id,book_project_id,user_question_id,sort_order) where committed_at is null;
alter table public.book_answer_photo_drafts enable row level security;
revoke all on public.book_answer_photo_drafts from public,anon;
grant select on public.book_answer_photo_drafts to authenticated;
create policy book_answer_photo_drafts_owner_select on public.book_answer_photo_drafts
  for select to authenticated using (user_id=auth.uid());

create function public.register_book_answer_photo_draft(
  input_project_id uuid,input_question_id uuid,input_photo_id uuid,
  input_storage_path text,input_sort_order integer,input_meta jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer
set search_path=public,auth,storage as $$
declare uid uuid:=auth.uid(); q public.user_questions%rowtype;
  p public.book_projects%rowtype; existing public.book_answer_photo_drafts%rowtype;
begin
  if uid is null or input_photo_id is null or input_meta is null
    or jsonb_typeof(input_meta)<>'object' or input_sort_order not between 0 and 1000
    or input_storage_path is distinct from
       uid::text||'/'||input_project_id::text||'/draft/'||input_photo_id::text||'.jpg' then
    raise exception 'Invalid photo draft' using errcode='22023';
  end if;
  select * into q from public.user_questions where id=input_question_id
    and user_id=uid and book_project_id=input_project_id and is_active is true;
  select * into p from public.book_projects where id=input_project_id;
  if q.id is null or p.id is null or p.status<>'active'
    or public.unpaid_trial_project(input_project_id)
    or exists(select 1 from public.book_work_manifests w
      where w.book_project_id=input_project_id and w.confirmed_at is not null)
    or not exists(select 1 from storage.objects o
      where o.bucket_id='photos' and o.name=input_storage_path) then
    raise exception 'Photo draft unavailable' using errcode='42501';
  end if;
  select * into existing from public.book_answer_photo_drafts where id=input_photo_id;
  if existing.id is not null then
    if existing.user_id<>uid or existing.book_project_id<>input_project_id
      or existing.user_question_id<>input_question_id
      or existing.storage_path<>input_storage_path or existing.committed_at is not null then
      raise exception 'Photo draft conflict' using errcode='40001';
    end if;
    return jsonb_build_object('status','saved','id',existing.id);
  end if;
  if (select count(*) from public.book_answer_photo_drafts
      where user_id=uid and user_question_id=input_question_id and committed_at is null)>=10 then
    raise exception 'Too many photos' using errcode='22023'; end if;
  insert into public.book_answer_photo_drafts
    (id,book_project_id,user_question_id,user_id,storage_path,sort_order,meta_json)
  values (input_photo_id,input_project_id,input_question_id,uid,input_storage_path,
    input_sort_order,input_meta);
  return jsonb_build_object('status','saved','id',input_photo_id);
end;
$$;

-- The existing recording commit remains authoritative for audio, transcription
-- and revisions. Calling it inside this function keeps the photo attachment in
-- the same transaction; a photo failure rolls the recording commit back too.
create function public.complete_book_recording_with_photos(
  input_attempt_id uuid,input_base_text_revision bigint,input_body text,
  input_transcript_raw text,input_transcript_clean text,
  input_transcript_readable text,input_transcript_essay text,
  input_selected_style text,input_segment_transcripts text[],
  input_allow_rewrite boolean,input_photo_ids uuid[],
  input_carry_body text default null,input_carry_device_id uuid default null,
  input_carry_generation bigint default null,input_carry_edit_number bigint default null
) returns jsonb language plpgsql security definer set search_path=public,auth,storage as $$
declare uid uuid:=auth.uid(); t public.answer_recording_attempts%rowtype;
  p public.book_projects%rowtype; d public.book_answer_photo_drafts%rowtype;
  text_draft public.answer_text_drafts%rowtype;
  ids uuid[]:=coalesce(input_photo_ids,'{}'::uuid[]); result jsonb;
  selected_count integer; committed_count integer; photo_number integer:=0;
begin
  if uid is null or (cardinality(ids)=0 and input_carry_body is null)
    or cardinality(ids)>10 then
    raise exception 'Invalid photo request' using errcode='22023'; end if;
  select * into t from public.answer_recording_attempts
    where id=input_attempt_id and user_id=uid for update;
  select * into p from public.book_projects where id=t.book_project_id;
  if t.id is null or t.mode<>'initial' or p.id is null or p.status<>'active'
    or public.unpaid_trial_project(t.book_project_id)
    or exists(select 1 from public.book_work_manifests w
      where w.book_project_id=t.book_project_id and w.confirmed_at is not null) then
    raise exception 'Recording unavailable' using errcode='42501'; end if;
  if input_carry_body is not null and t.state<>'committed' then
    select * into text_draft from public.answer_text_drafts
      where user_id=uid and sequence_order=t.sequence_order for update;
    if text_draft.user_id is null or text_draft.book_project_id<>t.book_project_id
      or text_draft.state<>'active' or text_draft.body is distinct from input_carry_body
      or text_draft.device_id is distinct from input_carry_device_id
      or text_draft.generation is distinct from input_carry_generation
      or text_draft.edit_number is distinct from input_carry_edit_number
      or text_draft.base_text_revision<>0
      or left(input_body,length(input_carry_body))<>input_carry_body then
      raise exception 'Text draft changed during recording' using errcode='40001'; end if;
  end if;
  select count(*),count(*) filter(where committed_at is not null)
    into selected_count,committed_count from public.book_answer_photo_drafts
    where id=any(ids) and user_id=uid and book_project_id=t.book_project_id
      and user_question_id in (select id from public.user_questions
        where user_id=uid and book_project_id=t.book_project_id
          and sequence_order=t.sequence_order and is_active is true);
  if selected_count<>cardinality(ids)
    or (select count(distinct photo_id) from unnest(ids) as photo_id)<>cardinality(ids)
    or (committed_count<>0 and committed_count<>selected_count) then
    raise exception 'Photo draft mismatch' using errcode='40001'; end if;
  if committed_count=0 then
    for d in select * from public.book_answer_photo_drafts where id=any(ids)
      order by sort_order,id for update loop
      if not exists(select 1 from storage.objects o
        where o.bucket_id='photos' and o.name=d.storage_path) then
        raise exception 'Photo file unavailable' using errcode='40001'; end if;
    end loop;
  end if;
  result:=public.commit_answer_recording_with_segments(
    input_attempt_id,input_base_text_revision,input_body,input_transcript_raw,
    input_transcript_clean,input_transcript_readable,input_transcript_essay,
    input_selected_style,input_segment_transcripts,input_allow_rewrite);
  if result->>'status'<>'saved' then return result; end if;
  if input_carry_body is not null and t.state<>'committed' then
    update public.answer_text_drafts set body=null,state='discarded',
      generation=generation+1,edit_number=0,updated_at=now()
      where user_id=uid and sequence_order=t.sequence_order;
  end if;
  if committed_count=selected_count then
    if exists(select 1 from public.book_answer_photo_drafts
      where id=any(ids) and answer_id is distinct from (result->>'answer_id')::uuid) then
      raise exception 'Photo answer conflict' using errcode='40001'; end if;
    return result;
  end if;
  for d in select * from public.book_answer_photo_drafts where id=any(ids)
    order by sort_order,id for update loop
    photo_number:=photo_number+1;
    insert into public.media_assets
      (answer_id,user_id,family_id,book_project_id,person_id,
       asset_type,storage_path,meta_json)
    values ((result->>'answer_id')::uuid,uid,p.family_id,t.book_project_id,p.subject_person_id,
      'photo',d.storage_path,d.meta_json||jsonb_build_object('part',photo_number,
        'total_parts',cardinality(ids),'is_primary',photo_number=1));
    update public.book_answer_photo_drafts set answer_id=(result->>'answer_id')::uuid,
      committed_at=now() where id=d.id;
  end loop;
  return result;
end;
$$;

create function public.remove_book_answer_photo_draft(input_photo_id uuid)
returns text language plpgsql security definer set search_path=public,auth as $$
declare path text;
begin
  delete from public.book_answer_photo_drafts where id=input_photo_id
    and user_id=auth.uid() and committed_at is null returning storage_path into path;
  if path is null then raise exception 'Photo draft unavailable' using errcode='42501'; end if;
  return path;
end;
$$;

-- A single transaction commits the text (if present), photo metadata, and
-- formal question status. An error in any one step rolls all DB changes back.
create function public.complete_book_answer_with_photos(
  input_project_id uuid,input_sequence_order integer,input_photo_ids uuid[],
  input_body text default null,input_device_id uuid default null,
  input_generation bigint default null,input_edit_number bigint default null,
  input_base_text_revision bigint default null,input_reason text default 'initial'
) returns jsonb language plpgsql security definer set search_path=public,auth,storage as $$
declare uid uuid:=auth.uid(); q public.user_questions%rowtype;
  p public.book_projects%rowtype; a public.answers%rowtype;
  d public.book_answer_photo_drafts%rowtype; ids uuid[]:=coalesce(input_photo_ids,'{}'::uuid[]);
  outcome jsonb; selected_count integer; already_count integer; photo_number integer:=0;
begin
  if uid is null or input_project_id is null or input_sequence_order is null
    or cardinality(ids)=0 or cardinality(ids)>10
    or (input_body is not null and length(input_body)>100000)
    or (input_body is not null and length(btrim(input_body))=0) then
    raise exception 'Invalid answer content' using errcode='22023';
  end if;
  select * into q from public.user_questions where user_id=uid
    and book_project_id=input_project_id and sequence_order=input_sequence_order
    and is_active is true;
  select * into p from public.book_projects where id=input_project_id;
  if q.id is null or p.id is null or p.status<>'active'
    or public.unpaid_trial_project(input_project_id)
    or exists(select 1 from public.book_work_manifests w
      where w.book_project_id=input_project_id and w.confirmed_at is not null) then
    raise exception 'Question unavailable' using errcode='42501';
  end if;
  select count(*),count(*) filter (where committed_at is not null)
    into selected_count,already_count from public.book_answer_photo_drafts
    where id=any(ids) and book_project_id=input_project_id
      and user_question_id=q.id and user_id=uid;
  if selected_count<>cardinality(ids) or
    (select count(distinct photo_id) from unnest(ids) as photo_id)<>cardinality(ids) then
    raise exception 'Photo draft mismatch' using errcode='40001';
  end if;
  -- A repeated request after a lost response is read-only and does not
  -- advance the progress trigger or create another answer/media row.
  if selected_count>0 and already_count=selected_count then
    select saved_answer.* into a from public.answers saved_answer
      join public.book_answer_photo_drafts used_photo on used_photo.answer_id=saved_answer.id
      where used_photo.id=ids[1] and saved_answer.user_id=uid
        and saved_answer.book_project_id=input_project_id;
    if a.id is not null and not exists(select 1 from public.book_answer_photo_drafts
      where id=any(ids) and answer_id is distinct from a.id) then
      return jsonb_build_object('status','saved','answer_id',a.id,'already_committed',true);
    end if;
  end if;
  if already_count<>0 then raise exception 'Photo draft conflict' using errcode='40001'; end if;
  for d in select * from public.book_answer_photo_drafts
    where id=any(ids) order by sort_order,id for update loop
    if not exists(select 1 from storage.objects o
      where o.bucket_id='photos' and o.name=d.storage_path) then
      raise exception 'Photo file unavailable' using errcode='40001';
    end if;
  end loop;

  if input_body is not null then
    if input_device_id is null or input_generation is null or input_edit_number is null
      or input_base_text_revision is null then
      raise exception 'Text draft acknowledgement required' using errcode='22023';
    end if;
    outcome:=public.save_answer_text(input_project_id,input_sequence_order,input_device_id,
      input_generation,input_edit_number,input_base_text_revision,input_body,input_reason);
    if outcome->>'status'<>'saved' then return outcome; end if;
    select * into a from public.answers where id=(outcome->>'answer_id')::uuid;
  else
    select * into a from public.answers where user_id=uid
      and sequence_order=input_sequence_order for update;
    if a.id is null then
      insert into public.answers
        (id,user_id,book_project_id,subject_person_id,user_question_id,
         question_id,sequence_order,selected_style)
      values (gen_random_uuid(),uid,input_project_id,p.subject_person_id,q.id,
        q.question_id,input_sequence_order,'readable') returning * into a;
    elsif a.book_project_id is distinct from input_project_id then
      raise exception 'Answer conflict' using errcode='40001';
    end if;
    update public.user_questions set answered_at=coalesce(answered_at,now()),
      status='answered' where id=q.id;
  end if;

  for d in select * from public.book_answer_photo_drafts
    where id=any(ids) order by sort_order,id for update loop
    photo_number:=photo_number+1;
    insert into public.media_assets
      (answer_id,user_id,family_id,book_project_id,person_id,
       asset_type,storage_path,meta_json)
    values (a.id,uid,p.family_id,input_project_id,p.subject_person_id,'photo',
      d.storage_path,d.meta_json||jsonb_build_object('part',photo_number,
        'total_parts',cardinality(ids),'is_primary',photo_number=1));
    update public.book_answer_photo_drafts set answer_id=a.id,committed_at=now()
      where id=d.id;
  end loop;
  return jsonb_build_object('status','saved','answer_id',a.id,
    'text_revision',a.text_revision,
    'generation',case when input_body is null then null else (outcome->>'generation')::bigint end,
    'already_committed',false);
end;
$$;

revoke all on function public.register_book_answer_photo_draft(uuid,uuid,uuid,text,integer,jsonb)
  from public,anon,authenticated;
revoke all on function public.remove_book_answer_photo_draft(uuid)
  from public,anon,authenticated;
revoke all on function public.complete_book_answer_with_photos(uuid,integer,uuid[],text,uuid,bigint,bigint,bigint,text)
  from public,anon,authenticated;
revoke all on function public.complete_book_recording_with_photos(uuid,bigint,text,text,text,text,text,text,text[],boolean,uuid[],text,uuid,bigint,bigint)
  from public,anon,authenticated;
grant execute on function public.register_book_answer_photo_draft(uuid,uuid,uuid,text,integer,jsonb)
  to authenticated;
grant execute on function public.remove_book_answer_photo_draft(uuid) to authenticated;
grant execute on function public.complete_book_answer_with_photos(uuid,integer,uuid[],text,uuid,bigint,bigint,bigint,text)
  to authenticated;
grant execute on function public.complete_book_recording_with_photos(uuid,bigint,text,text,text,text,text,text,text[],boolean,uuid[],text,uuid,bigint,bigint)
  to authenticated;
commit;
