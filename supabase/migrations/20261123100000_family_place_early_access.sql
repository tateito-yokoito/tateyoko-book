-- Limited family-app release. The list is deliberately empty until an
-- administrator adds existing auth.users IDs after the release is approved.
-- Existing BOOK authentication, families and persons policies are unchanged.
begin;

create table public.family_place_early_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id)
);
alter table public.family_place_early_access enable row level security;
revoke all on public.family_place_early_access from public, anon, authenticated;

create function public.family_place_access_allowed()
returns boolean language sql stable security definer
set search_path = public, auth as $$
  select auth.uid() is not null and exists (
    select 1 from public.family_place_early_access a where a.user_id = auth.uid()
  );
$$;
revoke all on function public.family_place_access_allowed() from public, anon;
grant execute on function public.family_place_access_allowed() to authenticated;

-- RLS on the new family-only tables applies to direct REST access as well as
-- to the React entry. It does not alter shared BOOK tables or completed books.
create policy family_place_early_access_guard on public.family_person_profile_facts
  as restrictive for all to authenticated
  using ((select public.family_place_access_allowed()))
  with check ((select public.family_place_access_allowed()));
create policy family_place_early_access_guard on public.family_free_stories
  as restrictive for all to authenticated
  using ((select public.family_place_access_allowed()))
  with check ((select public.family_place_access_allowed()));
create policy family_place_early_access_guard on public.family_free_story_media
  as restrictive for all to authenticated
  using ((select public.family_place_access_allowed()))
  with check ((select public.family_place_access_allowed()));
create policy family_place_early_access_guard on public.family_person_relations
  as restrictive for all to authenticated
  using ((select public.family_place_access_allowed()))
  with check ((select public.family_place_access_allowed()));
create policy family_place_early_access_guard on public.family_relation_suggestions
  as restrictive for all to authenticated
  using ((select public.family_place_access_allowed()))
  with check ((select public.family_place_access_allowed()));

-- The restrictive guard is a no-op for every pre-existing BOOK bucket.
create policy family_place_early_access_storage_guard on storage.objects
  as restrictive for all to authenticated
  using (bucket_id not in ('family-free-media', 'family-person-portraits')
    or (select public.family_place_access_allowed()))
  with check (bucket_id not in ('family-free-media', 'family-person-portraits')
    or (select public.family_place_access_allowed()));

-- These SECURITY DEFINER helpers are also called by the transcription Edge
-- functions. Explicitly check access here because a definer bypasses RLS.
create or replace function public.family_free_story_can_read(input_story_id uuid)
returns boolean language sql volatile security definer set search_path=public,auth as $$
  select public.family_place_access_allowed() and exists (
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
  select public.family_place_access_allowed() and exists (
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

-- This is the only family-app RPC that creates a family at first sign-in.
-- A denied account cannot create a family even by calling PostgREST directly.
create or replace function public.ensure_family_place_home(input_family_name text default null)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare actor uuid := auth.uid(); result uuid;
begin
  if not public.family_place_access_allowed() then
    raise exception 'Family place access is not granted' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtext(actor::text));
  select id into result from public.families
    where owner_user_id=actor order by created_at,id limit 1;
  if result is null then
    insert into public.families(owner_user_id,name)
    values(actor,coalesce(nullif(trim(input_family_name),''),'家族の場所'))
    returning id into result;
  end if;
  return result;
end;
$$;

-- All newer tree-person creation RPCs call this core creator. Guarding it
-- also covers legacy direct calls without changing their parameter shape.
create or replace function public.create_family_place_person(
  input_family_id uuid,input_display_name text,input_is_self boolean default false
) returns uuid language plpgsql security definer set search_path=public,auth as $$
declare actor uuid := auth.uid(); result uuid;
begin
  if not public.family_place_access_allowed()
    or not exists(select 1 from public.families
      where id=input_family_id and owner_user_id=actor) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if char_length(trim(coalesce(input_display_name,''))) not between 1 and 100 then
    raise exception 'Name is required';
  end if;
  if coalesce(input_is_self,false) then
    perform pg_advisory_xact_lock(hashtext(actor::text));
    select l.person_id into result from public.user_person_links l
      where l.user_id=actor and l.role='self' order by l.created_at,l.id limit 1;
    if result is not null then return result; end if;
  end if;
  insert into public.persons(family_id,display_name)
    values(input_family_id,trim(input_display_name)) returning id into result;
  if coalesce(input_is_self,false) then
    insert into public.user_person_links(user_id,person_id,role)
      values(actor,result,'self');
  end if;
  return result;
end;
$$;

commit;
