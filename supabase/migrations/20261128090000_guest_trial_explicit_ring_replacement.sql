-- A completed anonymous trial may replace another free trial only after the
-- verified subject explicitly confirms. Existing BOOK-linked stories remain
-- protected because their original media is append-only.
create function public.replace_guest_trial_ring_stories(
  input_token_hash text, input_person_id uuid
) returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare
  actor uuid := auth.uid();
  trial public.guest_trial_sessions%rowtype;
  bound public.guest_trial_ring_claims%rowtype;
  existing_story public.family_free_stories%rowtype;
  old_session record;
  old_media record;
  family_uuid uuid;
  slot_no smallint;
  retired_sessions uuid[] := '{}'::uuid[];
  prior_status text;
  retired_media jsonb := '[]'::jsonb;
  result jsonb;
begin
  if actor is null or not public.family_place_access_allowed()
    or input_token_hash !~ '^[a-f0-9]{64}$' or input_person_id is null then
    raise exception 'Family app access required' using errcode='42501';
  end if;
  select * into trial from public.guest_trial_sessions
    where token_hash=input_token_hash for update;
  if trial.id is null or trial.origin_kind <> 'self'
    or trial.expires_at <= now()
    or trial.status not in ('active','completed','claimed')
    or (trial.status='claimed' and trial.claimed_user_id is distinct from actor) then
    raise exception 'Trial unavailable' using errcode='42501';
  end if;
  select p.family_id into family_uuid from public.persons p
    join public.families f on f.id=p.family_id
    join public.user_person_links l on l.person_id=p.id
    where p.id=input_person_id and f.owner_user_id=actor
      and l.user_id=actor and l.role='self';
  if family_uuid is null then
    raise exception 'This person is not your self profile' using errcode='42501';
  end if;
  select * into bound from public.guest_trial_ring_claims
    where session_id=trial.id for update;
  if bound.session_id is not null and
    (bound.user_id<>actor or bound.person_id<>input_person_id) then
    raise exception 'Trial already belongs to another person' using errcode='42501';
  end if;
  if exists(select 1 from public.guest_trial_ring_links l
      where l.session_id=trial.id) then
    raise exception 'This trial is already saved' using errcode='23505';
  end if;
  for slot_no in 1..3 loop
    if not exists(select 1 from public.guest_trial_answers a
      where a.session_id=trial.id
        and a.question_id='TY_TRIAL_CHILDHOOD0' || slot_no::text
        and a.transcription_state='complete'
        and length(btrim(a.transcript))>0) then
      raise exception 'Three complete answers required' using errcode='23514';
    end if;
  end loop;

  -- Lock previous capabilities before their stories. A retired session can
  -- never reapply its old text after this transaction commits.
  for old_session in
    select distinct s.id from public.guest_trial_sessions s
    join public.guest_trial_ring_links l on l.session_id=s.id
    join public.family_free_stories fs on fs.id=l.story_id
    where fs.person_id=input_person_id and fs.question_slot between 1 and 3
      and s.id<>trial.id order by s.id
  loop
    select s.status into prior_status from public.guest_trial_sessions s
      where s.id=old_session.id for update;
    if prior_status='claimed' then
      raise exception 'A purchased trial cannot be replaced here' using errcode='55000';
    end if;
    retired_sessions:=array_append(retired_sessions,old_session.id);
  end loop;
  for existing_story in
    select * from public.family_free_stories s
    where s.person_id=input_person_id and s.question_slot between 1 and 3
    order by s.question_slot for update
  loop
    if exists(select 1 from public.person_story_book_links l
      where l.story_id=existing_story.id) then
      raise exception 'A BOOK-linked story cannot be replaced here' using errcode='55000';
    end if;
    for old_media in select storage_bucket,storage_path
      from public.family_free_story_media
      where story_id=existing_story.id
    loop
      retired_media:=retired_media || jsonb_build_array(jsonb_build_object(
        'bucket',old_media.storage_bucket,'path',old_media.storage_path));
    end loop;
    delete from public.family_free_story_media
      where story_id=existing_story.id;
    delete from public.guest_trial_ring_links
      where story_id=existing_story.id and session_id<>trial.id;
    update public.family_free_stories set
      body='',transcript_raw='',transcript_readable='',transcript_essay='',
      visibility='private',
      question_key='TY_TRIAL_CHILDHOOD0' || existing_story.question_slot::text,
      question_text=case existing_story.question_slot
        when 1 then '幼い頃、どんなところに住んでいましたか？'
        when 2 then 'その頃、よく一緒にいた人を一人思い浮かべてください。どんな人でしたか？'
        else 'その頃、どんな遊びが好きでしたか？' end,
      revision=revision+1,updated_at=now()
      where id=existing_story.id;
  end loop;
  update public.guest_trial_sessions set status='expired',last_used_at=now()
    where id=any(retired_sessions) and status in ('active','completed');
  result:=public.save_guest_trial_to_ring_internal(
    input_token_hash,input_person_id,3::smallint);
  return result || jsonb_build_object('retiredMedia',retired_media);
end;
$$;
revoke all on function public.replace_guest_trial_ring_stories(text,uuid)
  from public,anon;
grant execute on function public.replace_guest_trial_ring_stories(text,uuid)
  to authenticated;
