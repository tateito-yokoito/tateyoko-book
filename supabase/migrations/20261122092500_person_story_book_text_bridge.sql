-- First bridge: one person story / one active BOOK question / text only.
-- BOOK answers are a transactionally maintained production projection.
-- Existing answers, media and completed editions are never adopted here.
begin;

create table public.person_story_question_map (
  story_question_key text primary key,
  book_question_id text not null references public.questions(id),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.person_story_question_map(story_question_key,book_question_id)
values ('TY_TRIAL_CHILDHOOD01','TY_TRIAL_CHILDHOOD01');
alter table public.person_story_question_map enable row level security;
create policy person_story_question_map_read on public.person_story_question_map
  for select to authenticated using (true);
grant select on public.person_story_question_map to authenticated;

create table public.person_story_book_links (
  book_project_id uuid not null references public.book_projects(id) on delete cascade,
  user_question_id uuid not null references public.user_questions(id) on delete cascade,
  story_id uuid not null references public.family_free_stories(id) on delete restrict,
  answer_id uuid not null unique references public.answers(id) on delete restrict,
  linked_at timestamptz not null default now(),
  primary key (book_project_id,user_question_id),
  unique (book_project_id,story_id)
);
create index person_story_book_links_story_idx
  on public.person_story_book_links(story_id);
alter table public.person_story_book_links enable row level security;
revoke all on public.person_story_book_links from public,anon,authenticated;

create function public.attach_person_story_to_book(
  input_project_id uuid,input_user_question_id uuid
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
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
  if q.id is null then return jsonb_build_object('status','unavailable'); end if;
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
      and nullif(btrim(fs.body),'') is not null
    order by fs.created_at,fs.id limit 1 for update of fs;
  if s.id is null then return jsonb_build_object('status','no_story'); end if;
  if not public.family_free_story_can_read(s.id)
    or not public.family_free_story_can_write(s.id) then
    return jsonb_build_object('status','forbidden');
  end if;
  if exists(select 1 from public.family_free_story_media where story_id=s.id) then
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
    transcript_clean,transcript_readable,transcript_edited,access_override
  ) values (
    p.owner_user_id,p.id,p.subject_person_id,p.subject_person_id,
    q.id,q.question_id,q.sequence_order,
    s.body,s.body,s.body,
    case when s.visibility='private' then 'private_forever' else 'inherit' end
  ) returning id into new_answer_id;
  insert into public.person_story_book_links
    (book_project_id,user_question_id,story_id,answer_id)
  values (p.id,q.id,s.id,new_answer_id);
  update public.user_questions set status='answered',
    answered_at=coalesce(answered_at,now()) where id=q.id;
  return jsonb_build_object('status','linked','answer_id',new_answer_id);
end;
$$;
revoke all on function public.attach_person_story_to_book(uuid,uuid)
  from public,anon;
grant execute on function public.attach_person_story_to_book(uuid,uuid)
  to authenticated;

-- The existing permissive BOOK policies remain unchanged for unlinked answers.
-- A linked private story must pass the person-story read boundary too.
create function public.person_story_linked_answer_readable(input_answer_id uuid)
returns boolean language sql volatile security definer set search_path=public,auth as $$
  select not exists (
    select 1 from public.person_story_book_links l
    join public.family_free_stories s on s.id=l.story_id
    where l.answer_id=input_answer_id and s.visibility='private'
      and not public.family_free_story_can_read(s.id)
  );
$$;
revoke all on function public.person_story_linked_answer_readable(uuid)
  from public,anon;
grant execute on function public.person_story_linked_answer_readable(uuid)
  to authenticated;
create policy person_story_linked_answer_select_guard on public.answers
  as restrictive for select to authenticated
  using (public.person_story_linked_answer_readable(id));
create policy person_story_linked_answer_update_guard on public.answers
  as restrictive for update to authenticated
  using (public.person_story_linked_answer_readable(id))
  with check (public.person_story_linked_answer_readable(id));

create function public.sync_person_story_to_book_answer()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if pg_trigger_depth()>1 or
    (new.body,new.visibility) is not distinct from (old.body,old.visibility) then
    return new;
  end if;
  update public.answers a set
    transcript_clean=new.body,transcript_readable=new.body,
    transcript_edited=new.body,
    access_override=case when new.visibility='private'
      then 'private_forever' else 'inherit' end
  from public.person_story_book_links l
  where l.story_id=new.id and l.answer_id=a.id
    and not exists(select 1 from public.book_work_manifests w
      where w.book_project_id=l.book_project_id and w.confirmed_at is not null);
  return new;
end;
$$;
revoke all on function public.sync_person_story_to_book_answer()
  from public,anon,authenticated;
create trigger sync_person_story_to_book_answer
  after update of body,visibility on public.family_free_stories
  for each row execute function public.sync_person_story_to_book_answer();

create function public.sync_book_answer_to_person_story()
returns trigger language plpgsql security definer set search_path=public,auth as $$
declare
  linked_story public.family_free_stories%rowtype;
  next_visibility text;
  next_body text;
begin
  if pg_trigger_depth()>1 or
    (new.transcript_edited,new.transcript_readable,new.access_override)
      is not distinct from
    (old.transcript_edited,old.transcript_readable,old.access_override) then
    return new;
  end if;
  select s.* into linked_story
  from public.person_story_book_links l
  join public.family_free_stories s on s.id=l.story_id
  where l.answer_id=new.id for update of s;
  if linked_story.id is null then return new; end if;
  if linked_story.visibility='private'
    and not public.family_free_story_can_write(linked_story.id) then
    raise exception 'This keyed story is not available' using errcode='42501';
  end if;
  next_visibility=case when new.access_override='private_forever'
    then 'private' else 'family' end;
  if next_visibility<>linked_story.visibility
    and not (
      exists(select 1 from public.user_person_links upl
        where upl.person_id=linked_story.person_id
          and upl.user_id=auth.uid() and upl.role='self')
      or public.person_story_co_manager_allowed(linked_story.person_id)
    ) then
    raise exception 'Consent is required to change this key' using errcode='42501';
  end if;
  next_body=coalesce(new.transcript_edited,new.transcript_readable,'');
  if (next_body,next_visibility) is distinct from
    (linked_story.body,linked_story.visibility) then
    update public.family_free_stories set body=next_body,
      visibility=next_visibility,revision=revision+1,updated_at=now()
    where id=linked_story.id;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_book_answer_to_person_story()
  from public,anon,authenticated;
create trigger sync_book_answer_to_person_story
  after update of transcript_edited,transcript_readable,access_override
  on public.answers for each row
  execute function public.sync_book_answer_to_person_story();

commit;
