begin;
create or replace function public.commit_answer_recording(
  input_attempt_id uuid, input_base_text_revision bigint, input_body text,
  input_transcript_raw text, input_transcript_clean text,
  input_transcript_readable text, input_transcript_essay text,
  input_selected_style text, input_allow_rewrite boolean default false
) returns jsonb language plpgsql security definer set search_path=public,auth,storage as $$
declare
  uid uuid := auth.uid();
  t public.answer_recording_attempts%rowtype;
  q public.user_questions%rowtype;
  p public.book_projects%rowtype;
  a public.answers%rowtype;
  old_body text;
  path text;
  index_no integer := 0;
  prefix_a text;
  prefix_b text;
begin
  if uid is null or input_attempt_id is null or input_base_text_revision < 0 then
    raise exception 'Invalid recording request'; end if;
  select * into t from public.answer_recording_attempts
    where id=input_attempt_id and user_id=uid for update;
  if t.id is null then raise exception 'Recording attempt unavailable'; end if;
  if t.state='committed' then
    select * into a from public.answers where id=t.answer_id;
    return jsonb_build_object('status','saved','answer_id',a.id,
      'text_revision',a.text_revision,'already_committed',true);
  end if;
  select * into q from public.user_questions where user_id=uid
    and book_project_id=t.book_project_id and sequence_order=t.sequence_order
    and is_active is true;
  select * into p from public.book_projects where id=t.book_project_id;
  if q.id is null or p.id is null or p.status<>'active'
    or (public.unpaid_trial_project(t.book_project_id)
      and not public.unpaid_trial_question(t.book_project_id,q.id)) then
    raise exception 'Question unavailable' using errcode='42501'; end if;
  select * into a from public.answers where user_id=uid and sequence_order=t.sequence_order for update;
  if t.mode='initial' and a.id is not null then
    return jsonb_build_object('status','answer_conflict','answer_revision',a.text_revision);
  end if;
  if t.mode<>'initial' and (a.id is null or a.id<>t.answer_id) then
    return jsonb_build_object('status','answer_conflict');
  end if;
  if a.id is not null and (a.book_project_id is not null and a.book_project_id<>t.book_project_id
    or a.text_revision<>input_base_text_revision) then
    return jsonb_build_object('status','answer_conflict','answer_revision',a.text_revision);
  end if;
  if a.id is null and input_base_text_revision<>0 then
    return jsonb_build_object('status','answer_conflict','answer_revision',0);
  end if;
  if t.mode<>'voice_only' and (input_body is null or length(btrim(input_body))=0
    or length(input_body)>100000) then raise exception 'Answer text unavailable'; end if;
  if t.mode='append' then
    old_body := coalesce(a.transcript_edited,a.transcript_readable,
      a.transcript_clean,a.transcript_raw,a.snippet,'');
    if not input_allow_rewrite and left(input_body,length(old_body)+2) <> old_body || E'\n\n' then
      return jsonb_build_object('status','append_base_changed');
    end if;
  end if;
  prefix_a := uid::text || '/' || t.book_project_id::text || '/' || t.answer_id::text || '/';
  prefix_b := uid::text || '/' || t.answer_id::text || '/';
  foreach path in array t.storage_paths loop
    if (left(path,length(prefix_a))<>prefix_a and left(path,length(prefix_b))<>prefix_b)
      or not exists(select 1 from storage.objects o where o.bucket_id='audio' and o.name=path)
      or exists(select 1 from public.media_assets x where x.storage_path=path) then
      raise exception 'Recording file unavailable';
    end if;
  end loop;

  if a.id is null then
    insert into public.answers
      (id,user_id,book_project_id,subject_person_id,user_question_id,
       question_id,sequence_order,transcript_raw,transcript_clean,
       transcript_readable,transcript_essay,transcript_edited,
       selected_style,text_revision)
    values (t.answer_id,uid,t.book_project_id,p.subject_person_id,q.id,
      q.question_id,t.sequence_order,input_transcript_raw,input_transcript_clean,
      input_transcript_readable,input_transcript_essay,input_body,
      coalesce(input_selected_style,'readable'),1)
    returning * into a;
  elsif t.mode<>'voice_only' then
    old_body := coalesce(a.transcript_edited,a.transcript_readable,
      a.transcript_clean,a.transcript_raw,a.snippet,'');
    if a.text_revision=0 and old_body<>'' then
      insert into public.answer_text_versions(answer_id,user_id,text_revision,body,reason)
      values(a.id,uid,0,old_body,'initial') on conflict do nothing;
    end if;
    update public.answers set
      transcript_edited=input_body,
      transcript_raw=input_transcript_raw,
      transcript_clean=input_transcript_clean,
      transcript_readable=input_transcript_readable,
      transcript_essay=input_transcript_essay,
      selected_style=coalesce(input_selected_style,selected_style),
      text_revision=text_revision+1,
      book_project_id=coalesce(book_project_id,t.book_project_id),
      user_question_id=coalesce(user_question_id,q.id)
      where id=a.id returning * into a;
  end if;

  if t.mode<>'voice_only' then
    insert into public.answer_text_versions(answer_id,user_id,text_revision,body,reason)
    values(a.id,uid,a.text_revision,input_body,
      case when t.mode='initial' then 'initial' else t.mode end);
  end if;

  if t.mode='replace' then
    perform public.archive_current_answer_audio(a.id,uid);
  end if;

  foreach path in array t.storage_paths loop
    index_no := index_no+1;
    insert into public.media_assets
      (answer_id,user_id,family_id,book_project_id,person_id,
       asset_type,storage_path,meta_json)
    values (a.id,uid,p.family_id,t.book_project_id,p.subject_person_id,
      'audio',path,jsonb_build_object('part',index_no,
        'audio_purpose',case when t.mode='initial' then 'answer' else t.mode end,
        'transcript',coalesce(input_transcript_raw,''),'attempt_id',t.id));
  end loop;
  update public.user_questions set answered_at=coalesce(answered_at,now()),
    status='answered' where id=q.id;
  update public.answer_recording_attempts set state='committed',committed_at=now()
    where id=t.id;
  return jsonb_build_object('status','saved','answer_id',a.id,
    'text_revision',a.text_revision,'already_committed',false);
end; $$;
revoke all on function public.commit_answer_recording(uuid,bigint,text,text,text,text,text,text,boolean)
  from public,anon,authenticated;
grant execute on function public.commit_answer_recording(uuid,bigint,text,text,text,text,text,text,boolean)
  to authenticated;

commit;
