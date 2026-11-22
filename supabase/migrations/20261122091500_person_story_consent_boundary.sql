-- A BOOK role alone never grants access to a keyed, mutable Person story.
-- Existing BOOK permissions and confirmed snapshots are intentionally untouched.
begin;

create table public.person_story_co_manager_consents (
  book_project_id uuid not null references public.book_projects(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  co_manager_user_id uuid not null references auth.users(id) on delete cascade,
  consented_by_user_id uuid not null references auth.users(id),
  consent_basis text not null check (consent_basis in ('subject','proxy_attestation')),
  recorded_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (book_project_id, co_manager_user_id)
);
create index person_story_consents_person_idx
  on public.person_story_co_manager_consents(person_id, co_manager_user_id)
  where revoked_at is null;
alter table public.person_story_co_manager_consents enable row level security;
revoke all on public.person_story_co_manager_consents from public, anon, authenticated;

create function public.set_person_story_co_manager_consent(
  input_project_id uuid, input_co_manager_user_id uuid, input_allow boolean
) returns boolean language plpgsql security definer
set search_path=public,auth as $$
declare
  actor uuid := auth.uid();
  subject_id uuid;
  owner_id uuid;
  subject_has_account boolean;
  is_subject boolean;
begin
  if actor is null or input_project_id is null or input_co_manager_user_id is null
    or input_allow is null then
    raise exception 'Consent request is incomplete' using errcode='22023';
  end if;
  select p.subject_person_id, p.owner_user_id into subject_id, owner_id
  from public.book_projects p
  where p.id=input_project_id and p.status='active';
  if subject_id is null then
    raise exception 'Person is not linked to this BOOK' using errcode='42501';
  end if;
  select exists(select 1 from public.user_person_links l
    where l.person_id=subject_id and l.role='self'),
    exists(select 1 from public.user_person_links l
    where l.person_id=subject_id and l.user_id=actor and l.role='self')
  into subject_has_account, is_subject;
  if (subject_has_account and not is_subject)
    or (not subject_has_account and actor <> owner_id) then
    raise exception 'Subject consent is required' using errcode='42501';
  end if;
  if not exists(select 1 from public.project_supporters ps
    where ps.book_project_id=input_project_id
      and ps.supporter_user_id=input_co_manager_user_id
      and ps.status='active'
      and ps.meta_json->>'support_role'='co_manager') then
    raise exception 'Active co-manager role is required' using errcode='42501';
  end if;
  if input_allow then
    insert into public.person_story_co_manager_consents
      (book_project_id,person_id,co_manager_user_id,consented_by_user_id,
       consent_basis,recorded_at,revoked_at)
    values (input_project_id,subject_id,input_co_manager_user_id,actor,
      case when is_subject then 'subject' else 'proxy_attestation' end,now(),null)
    on conflict (book_project_id,co_manager_user_id) do update set
      person_id=excluded.person_id,
      consented_by_user_id=excluded.consented_by_user_id,
      consent_basis=excluded.consent_basis,
      recorded_at=excluded.recorded_at,
      revoked_at=null;
  else
    update public.person_story_co_manager_consents
      set revoked_at=now()
    where book_project_id=input_project_id
      and person_id=subject_id
      and co_manager_user_id=input_co_manager_user_id;
  end if;
  return true;
end;
$$;
revoke all on function public.set_person_story_co_manager_consent(uuid,uuid,boolean)
  from public,anon;
grant execute on function public.set_person_story_co_manager_consent(uuid,uuid,boolean)
  to authenticated;

create function public.person_story_co_manager_allowed(input_person_id uuid)
returns boolean language sql volatile security definer
set search_path=public,auth as $$
  select auth.uid() is not null and exists(
    select 1 from public.person_story_co_manager_consents c
    join public.book_projects p on p.id=c.book_project_id
      and p.subject_person_id=c.person_id and p.status='active'
    join public.project_supporters ps on ps.book_project_id=c.book_project_id
      and ps.supporter_user_id=c.co_manager_user_id
      and ps.status='active'
      and ps.meta_json->>'support_role'='co_manager'
    where c.person_id=input_person_id
      and c.co_manager_user_id=auth.uid()
      and c.revoked_at is null
      and c.recorded_at>=ps.updated_at
  );
$$;
revoke all on function public.person_story_co_manager_allowed(uuid)
  from public,anon;
grant execute on function public.person_story_co_manager_allowed(uuid)
  to authenticated;

create or replace function public.family_free_story_can_read(input_story_id uuid)
returns boolean language sql volatile security definer set search_path=public,auth as $$
  select auth.uid() is not null and exists (
    select 1 from public.family_free_stories s
    join public.families f on f.id=s.family_id
    where s.id=input_story_id
      and exists(select 1 from public.persons p
        where p.id=s.person_id and p.family_id=s.family_id)
      and (
        (s.visibility='private' and exists (
          select 1 from public.user_person_links l
          where l.person_id=s.person_id and l.user_id=auth.uid() and l.role='self'))
        or (s.visibility='family' and f.owner_user_id=auth.uid())
        or public.person_story_co_manager_allowed(s.person_id)
      )
  );
$$;

create or replace function public.family_free_story_can_write(input_story_id uuid)
returns boolean language sql volatile security definer set search_path=public,auth as $$
  select auth.uid() is not null and exists (
    select 1 from public.family_free_stories s
    join public.families f on f.id=s.family_id
    where s.id=input_story_id
      and exists(select 1 from public.persons p
        where p.id=s.person_id and p.family_id=s.family_id)
      and (
        (s.created_by=auth.uid() and f.owner_user_id=auth.uid())
        or public.person_story_co_manager_allowed(s.person_id)
      )
  );
$$;

create function public.guard_person_story_identity()
returns trigger language plpgsql set search_path=public as $$
begin
  if (new.id,new.family_id,new.person_id,new.question_slot,new.question_key,new.created_by)
    is distinct from
     (old.id,old.family_id,old.person_id,old.question_slot,old.question_key,old.created_by) then
    raise exception 'Story identity cannot be changed' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger guard_person_story_identity
  before update on public.family_free_stories
  for each row execute function public.guard_person_story_identity();

alter policy family_free_stories_update on public.family_free_stories
  with check (
    public.family_free_story_can_write(id)
    and (
      visibility='family'
      or exists (select 1 from public.user_person_links l
        where l.person_id=family_free_stories.person_id
          and l.user_id=(select auth.uid()) and l.role='self')
      or public.person_story_co_manager_allowed(family_free_stories.person_id)
    )
  );

commit;
