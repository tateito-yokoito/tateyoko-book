-- An explicit save binds one anonymous three-question session to one verified
-- account and one self person. No guest capability grants family read access.
create table public.guest_trial_ring_claims (
  session_id uuid primary key references public.guest_trial_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  person_id uuid not null references public.persons(id),
  created_at timestamptz not null default now()
);
create table public.guest_trial_ring_links (
  session_id uuid not null references public.guest_trial_ring_claims(session_id) on delete cascade,
  question_id text not null,
  story_id uuid not null unique references public.family_free_stories(id) on delete restrict,
  last_transcript text not null,
  primary key (session_id, question_id)
);
alter table public.guest_trial_ring_claims enable row level security;
alter table public.guest_trial_ring_links enable row level security;
revoke all on public.guest_trial_ring_claims from public, anon, authenticated;
revoke all on public.guest_trial_ring_links from public, anon, authenticated;
grant select, insert, update on public.guest_trial_ring_claims to service_role;
grant select, insert, update on public.guest_trial_ring_links to service_role;

create function public.save_guest_trial_to_ring(
  input_token_hash text, input_person_id uuid, input_through_slot smallint
) returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare
  actor uuid := auth.uid();
  trial public.guest_trial_sessions%rowtype;
  bound public.guest_trial_ring_claims%rowtype;
  item public.guest_trial_answers%rowtype;
  linked public.guest_trial_ring_links%rowtype;
  story public.family_free_stories%rowtype;
  slot_no smallint;
  family_uuid uuid;
  result jsonb := '[]'::jsonb;
begin
  if actor is null or not public.family_place_access_allowed()
    or input_token_hash !~ '^[a-f0-9]{64}$'
    or input_person_id is null or input_through_slot not between 1 and 3 then
    raise exception 'Invalid trial save' using errcode='42501';
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
  if bound.session_id is null then
    insert into public.guest_trial_ring_claims(session_id,user_id,person_id)
      values(trial.id,actor,input_person_id);
  end if;
  for slot_no in 1..input_through_slot loop
    select * into item from public.guest_trial_answers a
      where a.session_id=trial.id
        and a.question_id='TY_TRIAL_CHILDHOOD0' || slot_no::text
        and a.transcription_state='complete'
        and length(btrim(a.transcript))>0;
    if item.session_id is null then continue; end if;
    select * into linked from public.guest_trial_ring_links l
      where l.session_id=trial.id and l.question_id=item.question_id for update;
    if linked.story_id is null then
      select * into story from public.family_free_stories s
        where s.person_id=input_person_id and s.question_slot=slot_no for update;
      if story.id is not null and
        (length(btrim(story.body))>0 or exists(select 1 from public.family_free_story_media m
          where m.story_id=story.id)) then
        raise exception 'This question already has a saved story' using errcode='23505';
      end if;
      if story.id is null then
        insert into public.family_free_stories(family_id,person_id,question_slot,
          question_key,question_text,body,transcript_raw,transcript_readable,
          transcript_essay,visibility,created_by)
        values(family_uuid,input_person_id,slot_no,item.question_id,
          case slot_no
            when 1 then '幼い頃、どんなところに住んでいましたか？'
            when 2 then 'その頃、よく一緒にいた人を一人思い浮かべてください。どんな人でしたか？'
            else 'その頃、どんな遊びが好きでしたか？' end,
          item.transcript,item.transcript,item.transcript,item.transcript,'private',actor)
        returning * into story;
      else
        update public.family_free_stories set body=item.transcript,
          transcript_raw=item.transcript,transcript_readable=item.transcript,
          transcript_essay=item.transcript,revision=revision+1,updated_at=now()
          where id=story.id returning * into story;
      end if;
      insert into public.guest_trial_ring_links(session_id,question_id,story_id,last_transcript)
        values(trial.id,item.question_id,story.id,item.transcript);
    else
      select * into story from public.family_free_stories
        where id=linked.story_id for update;
      if story.id is null or story.person_id<>input_person_id then
        raise exception 'Saved story is unavailable' using errcode='42501';
      end if;
      if story.body is distinct from item.transcript then
        if story.body is distinct from linked.last_transcript then
          raise exception 'The saved story was edited elsewhere' using errcode='23505';
        end if;
        update public.family_free_stories set body=item.transcript,
          transcript_raw=item.transcript,transcript_readable=item.transcript,
          transcript_essay=item.transcript,revision=revision+1,updated_at=now()
          where id=story.id returning * into story;
        update public.guest_trial_ring_links set last_transcript=item.transcript
          where session_id=trial.id and question_id=item.question_id;
      end if;
    end if;
    result:=result || jsonb_build_array(jsonb_build_object(
      'questionId',item.question_id,'storyId',story.id,
      'hasAudio',item.audio_path is not null,'audioMime',item.audio_mime));
  end loop;
  return jsonb_build_object('personId',input_person_id,'stories',result);
end;
$$;
revoke all on function public.save_guest_trial_to_ring(text,uuid,smallint)
  from public,anon;
grant execute on function public.save_guest_trial_to_ring(text,uuid,smallint)
  to authenticated;

-- Existing BOOK claim creates the answer without replacing another answer.
-- Afterwards this function connects that answer to its already saved person
-- story, so subsequent edits use the established bidirectional bridge.
create function public.link_guest_trial_ring_book(
  input_token_hash text, input_project_id uuid
) returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare
  actor uuid:=auth.uid();
  trial public.guest_trial_sessions%rowtype;
  binding public.guest_trial_ring_claims%rowtype;
  project public.book_projects%rowtype;
  item record;
  matched public.answers%rowtype;
  linked_count integer:=0;
begin
  if actor is null or input_token_hash !~ '^[a-f0-9]{64}$' or input_project_id is null then
    raise exception 'Invalid link' using errcode='42501';
  end if;
  select * into trial from public.guest_trial_sessions
    where token_hash=input_token_hash for update;
  select * into binding from public.guest_trial_ring_claims
    where session_id=trial.id;
  select * into project from public.book_projects where id=input_project_id;
  if trial.id is null or trial.status<>'claimed'
    or trial.claimed_user_id<>actor or trial.claimed_project_id<>input_project_id
    or project.owner_user_id<>actor or project.status<>'active'
    or project.access_status not in ('paid','gifted','legacy') then
    raise exception 'Trial and BOOK do not belong to the same person' using errcode='42501';
  end if;
  if binding.session_id is null then return jsonb_build_object('linked',0); end if;
  if binding.user_id<>actor or binding.person_id<>project.subject_person_id then
    raise exception 'The saved story belongs to another person' using errcode='42501';
  end if;
  for item in select l.question_id,l.story_id from public.guest_trial_ring_links l
    where l.session_id=trial.id loop
    select * into matched from public.answers a
      where a.book_project_id=project.id and a.user_id=actor
        and a.subject_person_id=binding.person_id
        and a.meta_json->>'guest_trial_question_id'=item.question_id
      order by a.created_at limit 1;
    if matched.id is null then continue; end if;
    if matched.user_question_id is null then
      raise exception 'The BOOK answer has no question link' using errcode='23505';
    end if;
    if exists(select 1 from public.person_story_book_links l
      where (l.book_project_id=project.id and l.user_question_id=matched.user_question_id
          and (l.story_id<>item.story_id or l.answer_id<>matched.id))
        or (l.book_project_id=project.id and l.story_id=item.story_id
          and l.answer_id<>matched.id)) then
      raise exception 'A different story already occupies this BOOK answer' using errcode='23505';
    end if;
    insert into public.person_story_book_links
      (book_project_id,user_question_id,story_id,answer_id)
    values(project.id,matched.user_question_id,item.story_id,matched.id)
    on conflict do nothing;
    update public.answers set access_override='private_forever'
      where id=matched.id and access_override is distinct from 'private_forever';
    linked_count:=linked_count+1;
  end loop;
  return jsonb_build_object('linked',linked_count);
end;
$$;
revoke all on function public.link_guest_trial_ring_book(text,uuid)
  from public,anon;
grant execute on function public.link_guest_trial_ring_book(text,uuid)
  to authenticated;
