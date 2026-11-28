-- Preserve the trial prompt identity for new handoffs. Existing links stay attached.
update public.person_story_question_map set book_question_id=story_question_key,updated_at=now()
where story_question_key in ('TY_TRIAL_CHILDHOOD01','TY_TRIAL_CHILDHOOD02','TY_TRIAL_CHILDHOOD03')
and book_question_id<>story_question_key;

CREATE OR REPLACE FUNCTION public.claim_guest_trial_copy_internal(input_token_hash text, input_user_id uuid, input_project_id uuid, input_audio_paths jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'storage', 'pg_temp'
AS $function$
declare trial public.guest_trial_sessions%rowtype;
declare project public.book_projects%rowtype;
declare item public.guest_trial_answers%rowtype;
declare target public.user_questions%rowtype;
declare guest_question public.user_questions%rowtype;
declare answer_id uuid;
declare audio_path text;

declare n integer := 0;
declare next_seq integer;
declare copied integer := 0;
begin
 if input_token_hash !~ '^[a-f0-9]{64}$' or input_user_id is null
   or input_project_id is null or jsonb_typeof(input_audio_paths) is distinct from 'object'
 then raise exception 'Invalid claim' using errcode='22023'; end if;
 select * into trial from public.guest_trial_sessions
   where token_hash=input_token_hash for update;
 if trial.id is null or trial.origin_kind <> 'self'
 then raise exception 'Trial not found' using errcode='42501'; end if;
 if trial.status='claimed' then
   if trial.claimed_user_id is distinct from input_user_id
     or trial.claimed_project_id is distinct from input_project_id
   then raise exception 'Trial belongs to another account' using errcode='42501'; end if;
   return jsonb_build_object('status','claimed','project_id',input_project_id,'count',3);
 end if;
 if trial.status <> 'completed' or trial.expires_at <= now()
 then raise exception 'Trial is not complete or has expired' using errcode='55000'; end if;
 select * into project from public.book_projects where id=input_project_id for update;
 if project.id is null or project.owner_user_id is distinct from input_user_id
   or project.status <> 'active' or project.project_type <> 'koebook'
   or project.subject_person_id is null
   or not exists(select 1 from public.user_person_links l where l.user_id=input_user_id
     and l.person_id=project.subject_person_id and l.role='self')
 then raise exception 'Not an owned story' using errcode='42501'; end if;
 if (select count(*) from public.guest_trial_answers a where a.session_id=trial.id
   and a.transcription_state='complete' and length(btrim(a.transcript))>0
   and a.question_id in ('TY_TRIAL_CHILDHOOD01','TY_TRIAL_CHILDHOOD02','TY_TRIAL_CHILDHOOD03')) <> 3
 then raise exception 'Three completed answers required' using errcode='22023'; end if;

 select greatest(
   coalesce((select max(q.sequence_order) from public.user_questions q
     where q.book_project_id=project.id),0),
   coalesce((select max(a.sequence_order) from public.answers a
     where a.user_id=input_user_id),0)
 )+1 into next_seq;
 for item in select * from public.guest_trial_answers where session_id=trial.id
   order by question_id loop
   n := n+1;
   select * into guest_question from public.user_questions q
     where q.book_project_id=project.id and q.user_id=input_user_id
       and q.question_id=item.question_id;
   if guest_question.id is null then
     insert into public.user_questions(user_id,book_project_id,question_id,sequence_order,
       chapter,chapter_title_snapshot,question_text_snapshot,status,is_active,meta_json)
     select input_user_id,project.id,q.id,next_seq,'幼い頃','幼い頃',q.content,
       'pending',true,q.meta_json
     from public.questions q where q.id=item.question_id
     returning * into guest_question;
     if guest_question.id is null then raise exception 'Question missing'; end if;
     next_seq := next_seq+1;
   end if;
   -- Unmapped childhood stories stay usable in the finished book as well as
   -- in the story viewer. This changes only this claimed story's trial prompts.
   update public.user_questions set chapter='幼い頃',chapter_title_snapshot='幼い頃',is_active=true,meta_json=coalesce(meta_json,'{}'::jsonb)
     || '{"include_in_book_body":true}'::jsonb where id=guest_question.id;

   target := guest_question;
   if exists(select 1 from public.answers a where a.user_id=input_user_id
     and a.sequence_order=target.sequence_order)
   then raise exception 'An answer already occupies the target question' using errcode='23505'; end if;

   audio_path:=nullif(input_audio_paths->>item.question_id,'');
   if item.audio_path is not null then
     if audio_path is null or audio_path !~ ('^' || input_user_id::text || '/' ||
       project.id::text || '/guest-trial/' || item.question_id || '\.(m4a|aac|webm|ogg|mp3)$')
       or not exists(select 1 from storage.objects o where o.bucket_id='audio' and o.name=audio_path)
     then raise exception 'Copied audio is missing' using errcode='22023'; end if;
   elsif audio_path is not null then
     raise exception 'Unexpected audio' using errcode='22023';
   end if;

   insert into public.answers(user_id,book_project_id,speaker_person_id,subject_person_id,
     user_question_id,question_id,sequence_order,transcript_raw,transcript_clean,
     transcript_readable,transcript_edited,selected_style,meta_json,created_at)
   values(input_user_id,project.id,project.subject_person_id,project.subject_person_id,
     target.id,target.question_id,target.sequence_order,item.transcript,item.transcript,
     item.transcript,item.transcript,'readable',jsonb_build_object(
       'story_origin','question','user_question_id',target.id,
       'guest_trial_question_id',item.question_id,'guest_trial_version','childhood_v1'),item.saved_at)
   returning id into answer_id;
   if audio_path is not null then
     insert into public.media_assets(answer_id,user_id,family_id,book_project_id,
       person_id,asset_type,storage_path,meta_json)
     values(answer_id,input_user_id,project.family_id,project.id,
       project.subject_person_id,'audio',audio_path,'{}'::jsonb);
     copied:=copied+1;
   end if;
   update public.user_questions set status='answered',answered_at=item.saved_at
     where id=target.id;
 end loop;
 if n<>3 then raise exception 'Three answers required'; end if;
 update public.guest_trial_sessions set status='claimed',claimed_user_id=input_user_id,
   claimed_project_id=project.id,last_used_at=now() where id=trial.id;
 return jsonb_build_object('status','claimed','project_id',project.id,
   'count',n,'audio_count',copied);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.attach_person_story_to_book(input_project_id uuid, input_user_question_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'storage'
AS $function$
declare
  p public.book_projects%rowtype;
  q public.user_questions%rowtype;
  s public.family_free_stories%rowtype;
  existing_id uuid;
  new_answer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  select * into p from public.book_projects
    where id=input_project_id and status='active' for update;
  if p.id is null or p.owner_user_id<>auth.uid()
    or p.subject_person_id is null
    or p.access_status not in ('paid','gifted','legacy')
    or exists(select 1 from public.book_work_manifests w
      where w.book_project_id=p.id and w.confirmed_at is not null) then
    return jsonb_build_object('status','unavailable');
  end if;
  select * into q from public.user_questions
    where id=input_user_question_id and book_project_id=p.id
      and user_id=p.owner_user_id and is_active=true;
  if q.id is null or (coalesce(q.meta_json->>'onboarding_group','')='trial_experience'
    and q.question_id not in ('TY_TRIAL_CHILDHOOD01','TY_TRIAL_CHILDHOOD02','TY_TRIAL_CHILDHOOD03'))
    or (coalesce(q.meta_json->>'include_in_book_body','true')='false' and q.question_id not in ('TY_TRIAL_CHILDHOOD01','TY_TRIAL_CHILDHOOD02','TY_TRIAL_CHILDHOOD03')) then
    return jsonb_build_object('status','unavailable');
  end if;
  select l.answer_id into existing_id from public.person_story_book_links l
    where l.book_project_id=p.id and l.user_question_id=q.id;
  if existing_id is not null then
    return jsonb_build_object('status','linked','answer_id',existing_id);
  end if;
  select fs.* into s from public.family_free_stories fs
    join public.person_story_question_map m
      on m.story_question_key=fs.question_key and m.enabled
    where fs.person_id=p.subject_person_id
      and m.book_question_id=q.question_id
      and (nullif(btrim(fs.body),'') is not null or exists(
        select 1 from public.family_free_story_media fm where fm.story_id=fs.id))
    order by fs.created_at,fs.id limit 1 for update of fs;
  if s.id is null then return jsonb_build_object('status','no_story'); end if;
  if not public.family_free_story_can_read(s.id)
    or not public.family_free_story_can_write(s.id) then
    return jsonb_build_object('status','forbidden');
  end if;
  -- The paid claim owns the copy while checkout is finalizing this session.
  if exists(select 1 from public.guest_trial_ring_links l join public.guest_trial_sessions t on t.id=l.session_id
      where l.story_id=s.id and t.purchase_bound_project_id=p.id and t.status='completed') then
    return jsonb_build_object('status','purchase_pending');
  end if;
  if exists(select 1 from public.person_story_book_links l where l.book_project_id=p.id and l.story_id=s.id) then
    return jsonb_build_object('status','already_attached');
  end if;
  if exists(select 1 from public.family_free_story_media fm
      where fm.story_id=s.id and
        (fm.storage_bucket<>case when fm.asset_type='photo' then 'photos' else 'audio' end
         or not exists(select 1 from storage.objects o
           where o.bucket_id=fm.storage_bucket and o.name=fm.storage_path))) then
    return jsonb_build_object('status','media_pending');
  end if;
  if exists(select 1 from public.answers a where a.book_project_id=p.id
      and (a.user_question_id=q.id or
        (a.user_id=p.owner_user_id and a.sequence_order=q.sequence_order))) then
    return jsonb_build_object('status','conflict');
  end if;
  insert into public.answers(
    user_id,book_project_id,speaker_person_id,subject_person_id,
    user_question_id,question_id,sequence_order,
    transcript_clean,transcript_readable,transcript_edited,meta_json,access_override
  ) values (
    p.owner_user_id,p.id,p.subject_person_id,p.subject_person_id,
    q.id,q.question_id,q.sequence_order,
    s.body,s.body,s.body,
    case when s.question_key in ('TY_TRIAL_CHILDHOOD01','TY_TRIAL_CHILDHOOD02','TY_TRIAL_CHILDHOOD03') then jsonb_build_object('guest_trial_version','childhood_v1','guest_trial_question_id',s.question_key) else '{}'::jsonb end,
    case when s.visibility='private' then 'private_forever' else 'inherit' end
  ) returning id into new_answer_id;
  insert into public.person_story_book_links
    (book_project_id,user_question_id,story_id,answer_id)
  values (p.id,q.id,s.id,new_answer_id);
  insert into public.media_assets
    (answer_id,user_id,family_id,book_project_id,person_id,
     asset_type,storage_path,meta_json)
  select new_answer_id,p.owner_user_id,s.family_id,p.id,s.person_id,
    fm.asset_type,fm.storage_path,
    jsonb_build_object('duration_seconds',fm.duration_seconds,
      'person_story_media_id',fm.id)
  from public.family_free_story_media fm
  where fm.story_id=s.id
  on conflict (answer_id,asset_type,storage_path) do nothing;
  if s.question_key in ('TY_TRIAL_CHILDHOOD01','TY_TRIAL_CHILDHOOD02','TY_TRIAL_CHILDHOOD03') then
    update public.user_questions set chapter='幼い頃',chapter_title_snapshot='幼い頃',
      question_text_snapshot=s.question_text,meta_json=coalesce(meta_json,'{}'::jsonb) || '{"include_in_book_body":true}'::jsonb where id=q.id;
  end if;
  update public.user_questions set status='answered',
    answered_at=coalesce(answered_at,now()) where id=q.id;
  return jsonb_build_object('status','linked','answer_id',new_answer_id);
end;
$function$
;

-- Some paid editions were created without the trial prompts. Add only slots
-- needed by this person's saved stories, after the existing introduction.
create function public.prepare_childhood_story_questions(input_project_id uuid)
returns void language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  project public.book_projects%rowtype;
  story record;
  next_seq integer;
begin
  select * into project from public.book_projects where id=input_project_id
    and owner_user_id=auth.uid() and status='active' and access_status in ('paid','gifted','legacy') for update;
  if project.id is null or not exists(select 1 from public.user_person_links where
    user_id=auth.uid() and person_id=project.subject_person_id and role='self')
    or exists(select 1 from public.book_work_manifests where book_project_id=project.id and confirmed_at is not null)
    then return; end if;
  for story in select s.id,s.question_key from public.family_free_stories s
    where s.person_id=project.subject_person_id and s.question_key in
      ('TY_TRIAL_CHILDHOOD01','TY_TRIAL_CHILDHOOD02','TY_TRIAL_CHILDHOOD03')
      and public.family_free_story_can_write(s.id)
      and (nullif(trim(s.body),'') is not null or exists(select 1 from public.family_free_story_media m where m.story_id=s.id))
      and not exists(select 1 from public.person_story_book_links l where l.story_id=s.id and l.book_project_id=project.id)
      and not exists(select 1 from public.user_questions q where q.book_project_id=project.id and q.question_id=s.question_key)
    order by s.question_slot loop
    select greatest(coalesce((select max(sequence_order) from public.user_questions where user_id=auth.uid()),0),
      coalesce((select max(sequence_order) from public.answers where user_id=auth.uid()),0))+1 into next_seq;
    insert into public.user_questions(user_id,book_project_id,question_id,sequence_order,chapter,chapter_title_snapshot,question_text_snapshot,status,is_active,meta_json)
      select auth.uid(),project.id,q.id,next_seq,'幼い頃','幼い頃',q.content,'pending',true,q.meta_json from public.questions q where q.id=story.question_key;
  end loop;
end; $$;
revoke all on function public.prepare_childhood_story_questions(uuid) from public,anon;
grant execute on function public.prepare_childhood_story_questions(uuid) to authenticated;

-- Return only mirrors of stories already readable by the caller.
create function public.family_ring_mirrored_answers(input_story_ids uuid[])
returns table(answer_id uuid) language sql stable security definer set search_path=public,pg_temp as $$
  select l.answer_id from public.person_story_book_links l
  where auth.uid() is not null and l.story_id=any(input_story_ids)
    and public.family_free_story_can_read(l.story_id)
    and public.family_place_access_allowed();
$$;
revoke all on function public.family_ring_mirrored_answers(uuid[]) from public,anon;
grant execute on function public.family_ring_mirrored_answers(uuid[]) to authenticated;
