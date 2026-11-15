-- Scope BOOK text drafts to a project without deleting or rewriting existing drafts.
-- Existing project IDs are NOT NULL; the former key already guarantees uniqueness
-- of every existing (user_id,book_project_id,sequence_order) tuple.
begin;
alter table public.answer_text_drafts
  drop constraint answer_text_drafts_pkey,
  add constraint answer_text_drafts_pkey primary key (user_id,book_project_id,sequence_order);

CREATE OR REPLACE FUNCTION public.sync_answer_text_draft(input_project_id uuid, input_sequence_order integer, input_generation bigint, input_edit_number bigint, input_expected_server_edit_number bigint, input_device_id uuid, input_body text, input_base_text_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  uid uuid := auth.uid();
  q public.user_questions%rowtype;
  a public.answers%rowtype;
  d public.answer_text_drafts%rowtype;
begin
  if uid is null or input_device_id is null or input_edit_number < 1
    or input_generation < 0 or input_body is null or length(input_body) > 100000 then
    raise exception 'Invalid text draft request';
  end if;
  select * into q from public.user_questions
    where user_id = uid and book_project_id = input_project_id
      and sequence_order = input_sequence_order and is_active is true;
  if q.id is null then raise exception 'Question unavailable'; end if;
  select * into a from public.answers
    where user_id=uid and book_project_id=input_project_id and sequence_order=input_sequence_order;
  if a.id is not null and (a.book_project_id is not null and a.book_project_id <> input_project_id
    or a.text_revision <> input_base_text_revision) then
    return jsonb_build_object('status','answer_conflict','answer_revision',a.text_revision);
  end if;
  if a.id is null and input_base_text_revision <> 0 then
    return jsonb_build_object('status','answer_conflict','answer_revision',0);
  end if;

  insert into public.answer_text_drafts
    (user_id, sequence_order, book_project_id, generation, edit_number,
     device_id, body, base_text_revision, state)
  values (uid, input_sequence_order, input_project_id, 0, 0,
          input_device_id, null, input_base_text_revision, 'discarded')
  on conflict (user_id,book_project_id,sequence_order) do nothing;
  select * into d from public.answer_text_drafts
    where user_id=uid and book_project_id=input_project_id and sequence_order=input_sequence_order for update;
  if d.book_project_id <> input_project_id or d.generation <> input_generation then
    return jsonb_build_object('status','generation_conflict','draft',to_jsonb(d));
  end if;
  if d.edit_number <> input_expected_server_edit_number then
    return jsonb_build_object('status','edit_conflict','draft',to_jsonb(d));
  end if;
  if d.state = 'active' and d.device_id is distinct from input_device_id then
    return jsonb_build_object('status','device_conflict','draft',to_jsonb(d));
  end if;
  if d.state = 'active' and input_edit_number <= d.edit_number then
    return jsonb_build_object('status','stale_edit','draft',to_jsonb(d));
  end if;
  update public.answer_text_drafts set
    body = input_body, base_text_revision = input_base_text_revision,
    edit_number = input_edit_number, device_id = input_device_id,
    state = 'active', updated_at = now()
    where user_id=uid and book_project_id=input_project_id and sequence_order=input_sequence_order returning * into d;
  return jsonb_build_object('status','saved','draft',to_jsonb(d));
end; $function$;


CREATE OR REPLACE FUNCTION public.discard_answer_text_draft(input_project_id uuid, input_sequence_order integer, input_generation bigint, input_device_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare uid uuid := auth.uid(); d public.answer_text_drafts%rowtype;
begin
  if uid is null or input_device_id is null or input_generation < 0 or not exists (
    select 1 from public.user_questions where user_id = uid
      and book_project_id = input_project_id and sequence_order = input_sequence_order
  ) then raise exception 'Question unavailable'; end if;
  insert into public.answer_text_drafts
    (user_id, sequence_order, book_project_id, generation, edit_number,
     device_id, body, state)
  values (uid, input_sequence_order, input_project_id, 0, 0,
          input_device_id, null, 'discarded')
  on conflict (user_id,book_project_id,sequence_order) do nothing;
  select * into d from public.answer_text_drafts
    where user_id=uid and book_project_id=input_project_id and sequence_order=input_sequence_order for update;
  if d.book_project_id <> input_project_id or d.generation <> input_generation then
    return jsonb_build_object('status','generation_conflict','draft',to_jsonb(d));
  end if;
  if d.state = 'active' and d.device_id is distinct from input_device_id then
    return jsonb_build_object('status','device_conflict','draft',to_jsonb(d));
  end if;
  update public.answer_text_drafts set
    body = null, state = 'discarded', generation = generation + 1,
    edit_number = 0, device_id = input_device_id, updated_at = now()
    where user_id=uid and book_project_id=input_project_id and sequence_order=input_sequence_order returning * into d;
  return jsonb_build_object('status','discarded','draft',to_jsonb(d));
end; $function$;


CREATE OR REPLACE FUNCTION public.save_answer_text(input_project_id uuid, input_sequence_order integer, input_device_id uuid, input_generation bigint, input_edit_number bigint, input_base_text_revision bigint, input_body text, input_reason text DEFAULT 'edit'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  uid uuid := auth.uid();
  q public.user_questions%rowtype;
  p public.book_projects%rowtype;
  a public.answers%rowtype;
  d public.answer_text_drafts%rowtype;
  old_body text;
  next_revision bigint;
begin
  if uid is null or input_device_id is null or input_body is null
    or length(btrim(input_body)) = 0 or length(input_body) > 100000
    or input_reason not in ('initial','edit','restore') then
    raise exception 'Invalid answer text';
  end if;
  select * into q from public.user_questions
    where user_id = uid and book_project_id = input_project_id
      and sequence_order = input_sequence_order and is_active is true;
  select * into p from public.book_projects where id = input_project_id;
  if q.id is null or p.id is null or p.status <> 'active'
    or (public.unpaid_trial_project(input_project_id)
      and not public.unpaid_trial_question(input_project_id,q.id)) then
    raise exception 'Question unavailable';
  end if;
  select * into d from public.answer_text_drafts
    where user_id=uid and book_project_id=input_project_id and sequence_order=input_sequence_order for update;
  if d.user_id is null or d.book_project_id <> input_project_id
    or d.state <> 'active' or d.device_id is distinct from input_device_id
    or d.generation <> input_generation or d.edit_number <> input_edit_number
    or d.body is distinct from input_body
    or d.base_text_revision <> input_base_text_revision then
    return jsonb_build_object('status','draft_conflict');
  end if;
  select * into a from public.answers
    where user_id=uid and book_project_id=input_project_id and sequence_order=input_sequence_order for update;
  if a.id is not null and (a.book_project_id is not null and a.book_project_id <> input_project_id
      or a.text_revision <> input_base_text_revision) then
    return jsonb_build_object('status','answer_conflict','answer_revision',a.text_revision);
  end if;
  if a.id is null and input_base_text_revision <> 0 then
    return jsonb_build_object('status','answer_conflict','answer_revision',0);
  end if;
  if a.id is null then
    insert into public.answers
      (user_id, book_project_id, subject_person_id, user_question_id,
       question_id, sequence_order, transcript_edited, selected_style, text_revision)
    values (uid, input_project_id, p.subject_person_id, q.id,
            q.question_id, input_sequence_order, input_body, 'readable', 1)
    returning * into a;
  else
    old_body := coalesce(a.transcript_edited, a.transcript_readable,
                         a.transcript_clean, a.transcript_raw, a.snippet, '');
    -- Legacy rows have revision zero: retain their visible text before the first edit.
    if a.text_revision = 0 and old_body <> '' then
      insert into public.answer_text_versions
        (answer_id,user_id,text_revision,body,reason)
      values (a.id,uid,0,old_body,'initial') on conflict do nothing;
    end if;
    next_revision := a.text_revision + 1;
    update public.answers set transcript_edited = input_body,
      book_project_id = coalesce(book_project_id,input_project_id),
      user_question_id = coalesce(user_question_id,q.id),
      text_revision = next_revision where id = a.id returning * into a;
  end if;
  insert into public.answer_text_versions
    (answer_id,user_id,text_revision,body,reason)
  values (a.id,uid,a.text_revision,input_body,input_reason);
  update public.user_questions set answered_at = coalesce(answered_at,now()),
    status = 'answered' where id = q.id;
  update public.answer_text_drafts set body = null, state = 'discarded',
    generation = generation + 1, edit_number = 0, updated_at = now()
    where user_id=uid and book_project_id=input_project_id and sequence_order=input_sequence_order;
  return jsonb_build_object('status','saved','answer_id',a.id,
                            'text_revision',a.text_revision,
                            'generation',input_generation + 1);
end; $function$;


CREATE OR REPLACE FUNCTION public.resolve_answer_text_draft_conflict(input_project_id uuid, input_sequence_order integer, input_generation bigint, input_remote_edit_number bigint, input_device_id uuid, input_body text, input_base_text_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare uid uuid := auth.uid(); d public.answer_text_drafts%rowtype;
        answer_revision bigint;
begin
  if uid is null or input_device_id is null or input_body is null
    or length(input_body) > 100000 or not exists (
      select 1 from public.user_questions where user_id = uid
        and book_project_id = input_project_id and sequence_order = input_sequence_order
    ) then raise exception 'Question unavailable'; end if;
  select * into d from public.answer_text_drafts
    where user_id=uid and book_project_id=input_project_id and sequence_order=input_sequence_order for update;
  if d.user_id is null or d.book_project_id <> input_project_id
    or d.generation <> input_generation or d.edit_number <> input_remote_edit_number then
    return jsonb_build_object('status','conflict','draft',to_jsonb(d));
  end if;
  select coalesce(text_revision,0) into answer_revision from public.answers
    where user_id=uid and book_project_id=input_project_id and sequence_order=input_sequence_order;
  if coalesce(answer_revision,0) <> input_base_text_revision then
    return jsonb_build_object('status','answer_conflict',
      'answer_revision',coalesce(answer_revision,0));
  end if;
  update public.answer_text_drafts set
    body=input_body, base_text_revision=input_base_text_revision,
    edit_number=edit_number+1, device_id=input_device_id,
    state='active', updated_at=now()
    where user_id=uid and book_project_id=input_project_id and sequence_order=input_sequence_order returning * into d;
  return jsonb_build_object('status','saved','draft',to_jsonb(d));
end; $function$;


CREATE OR REPLACE FUNCTION public.discard_conflicted_answer_text_draft(input_project_id uuid, input_sequence_order integer, input_generation bigint, input_remote_edit_number bigint, input_device_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare uid uuid:=auth.uid(); d public.answer_text_drafts%rowtype;
begin
  if uid is null or input_device_id is null or input_generation<0
    or input_remote_edit_number<0 or not exists (
      select 1 from public.user_questions q where q.user_id=uid
        and q.book_project_id=input_project_id
        and q.sequence_order=input_sequence_order
    ) then raise exception 'Question unavailable'; end if;
  select * into d from public.answer_text_drafts
    where user_id=uid and book_project_id=input_project_id and sequence_order=input_sequence_order for update;
  if d.user_id is null or d.book_project_id<>input_project_id
    or d.generation<>input_generation or d.edit_number<>input_remote_edit_number then
    return jsonb_build_object('status','conflict','draft',to_jsonb(d));
  end if;
  update public.answer_text_drafts set body=null,state='discarded',
    generation=generation+1,edit_number=0,device_id=input_device_id,
    updated_at=now() where user_id=uid and book_project_id=input_project_id and sequence_order=input_sequence_order
    returning * into d;
  return jsonb_build_object('status','discarded','draft',to_jsonb(d));
end; $function$;


CREATE OR REPLACE FUNCTION public.rebase_conflicted_answer_text_draft(input_project_id uuid, input_sequence_order integer, input_generation bigint, input_edit_number bigint, input_device_id uuid, input_answer_revision bigint, input_choice text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  uid uuid := auth.uid();
  q public.user_questions%rowtype;
  p public.book_projects%rowtype;
  d public.answer_text_drafts%rowtype;
  a public.answers%rowtype;
  chosen_body text;
  current_body text;
begin
  if uid is null or input_device_id is null or input_choice not in ('local','remote') then
    raise exception 'Invalid draft resolution';
  end if;
  select * into q from public.user_questions where user_id = uid
    and book_project_id = input_project_id and sequence_order = input_sequence_order
    and is_active is true;
  select * into p from public.book_projects where id = input_project_id;
  if q.id is null or p.id is null or p.status <> 'active'
    or (public.unpaid_trial_project(input_project_id)
      and not public.unpaid_trial_question(input_project_id,q.id)) then
    raise exception 'Question unavailable';
  end if;
  select * into d from public.answer_text_drafts where user_id = uid
    and book_project_id = input_project_id and sequence_order = input_sequence_order for update;
  if d.user_id is null or d.state <> 'active' or d.device_id <> input_device_id
    or d.generation <> input_generation or d.edit_number <> input_edit_number then
    return jsonb_build_object('status','draft_conflict');
  end if;
  select * into a from public.answers where user_id=uid and book_project_id=input_project_id and sequence_order=input_sequence_order for update;
  if a.id is not null and a.book_project_id is distinct from input_project_id then
    raise exception 'Answer unavailable';
  end if;
  if coalesce(a.text_revision,0) <> input_answer_revision then
    return jsonb_build_object('status','answer_conflict',
      'answer_revision',coalesce(a.text_revision,0));
  end if;
  current_body := coalesce(a.transcript_edited,a.transcript_readable,
    a.transcript_clean,a.transcript_raw,a.snippet,'');
  chosen_body := case when input_choice = 'local' then d.body else current_body end;
  if chosen_body is null or length(chosen_body) > 100000 then
    raise exception 'Invalid draft body';
  end if;
  update public.answer_text_drafts set body = chosen_body,
    base_text_revision = input_answer_revision,
    generation = generation + 1, edit_number = edit_number + 1,
    updated_at = now() where user_id=uid and book_project_id=input_project_id and sequence_order=input_sequence_order
    returning * into d;
  return jsonb_build_object('status','saved','draft',to_jsonb(d),
    'answer_body',current_body,'answer_revision',input_answer_revision);
end; $function$;


CREATE OR REPLACE FUNCTION public.complete_book_answer_with_photos(input_project_id uuid, input_sequence_order integer, input_photo_ids uuid[], input_body text DEFAULT NULL::text, input_device_id uuid DEFAULT NULL::uuid, input_generation bigint DEFAULT NULL::bigint, input_edit_number bigint DEFAULT NULL::bigint, input_base_text_revision bigint DEFAULT NULL::bigint, input_reason text DEFAULT 'initial'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'storage'
AS $function$
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
  -- Two completion requests may arrive together after a lost response. Lock
  -- first, then inspect committed_at so the second request is read-only.
  perform 1 from public.book_answer_photo_drafts where id=any(ids)
    order by id for update;
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
    -- A photo-only finish must not silently leave an active written draft
    -- behind. The user can finish both together through save_answer_text.
    if exists(select 1 from public.answer_text_drafts text_draft
      where text_draft.user_id=uid and text_draft.book_project_id=input_project_id
        and text_draft.sequence_order=input_sequence_order
        and text_draft.state='active' and length(btrim(coalesce(text_draft.body,'')))>0) then
      raise exception 'Written draft must be included' using errcode='40001';
    end if;
    select * into a from public.answers where user_id=uid and book_project_id=input_project_id and sequence_order=input_sequence_order for update;
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
$function$;


CREATE OR REPLACE FUNCTION public.complete_book_recording_with_photos(input_attempt_id uuid, input_base_text_revision bigint, input_body text, input_transcript_raw text, input_transcript_clean text, input_transcript_readable text, input_transcript_essay text, input_selected_style text, input_segment_transcripts text[], input_allow_rewrite boolean, input_photo_ids uuid[], input_carry_body text DEFAULT NULL::text, input_carry_device_id uuid DEFAULT NULL::uuid, input_carry_generation bigint DEFAULT NULL::bigint, input_carry_edit_number bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'storage'
AS $function$
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
      where user_id=uid and book_project_id=t.book_project_id and sequence_order=t.sequence_order for update;
    if text_draft.user_id is null or text_draft.book_project_id<>t.book_project_id
      or text_draft.state<>'active' or text_draft.body is distinct from input_carry_body
      or text_draft.device_id is distinct from input_carry_device_id
      or text_draft.generation is distinct from input_carry_generation
      or text_draft.edit_number is distinct from input_carry_edit_number
      or text_draft.base_text_revision<>0
      or left(input_body,length(input_carry_body))<>input_carry_body then
      raise exception 'Text draft changed during recording' using errcode='40001'; end if;
  end if;
  -- Serialize all attempts that try to consume the same staged photos. The
  -- committed count must be read *after* the row locks are acquired.
  perform 1 from public.book_answer_photo_drafts where id=any(ids)
    order by id for update;
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
      where user_id=uid and book_project_id=t.book_project_id and sequence_order=t.sequence_order;
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
$function$;


commit;
