-- Person-centred free app. BOOK tables and existing answers remain unchanged.
begin;

create table public.family_person_profile_facts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  fact_type text not null check (fact_type in ('birth','death','education','employment','marriage','residence')),
  label text not null,
  event_year integer check (event_year between 1800 and 2200),
  event_month integer check (event_month between 1 and 12),
  event_day integer check (event_day between 1 and 31),
  detail text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_person_profile_facts_date_precision check (
    event_day is null or event_month is not null),
  constraint family_person_profile_facts_label_length check (char_length(label) between 1 and 120)
);
create index family_person_profile_facts_person_date_idx
  on public.family_person_profile_facts(person_id,event_year,event_month,event_day);

-- The free entrance creates a family only. It never creates a BOOK project or
-- assigns a question set. Lock per account to keep OTP reloads idempotent.
create or replace function public.ensure_family_place_home(input_family_name text default null)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare actor uuid := auth.uid(); result uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
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
revoke all on function public.ensure_family_place_home(text) from public,anon;
grant execute on function public.ensure_family_place_home(text) to authenticated;

create or replace function public.create_family_place_person(
  input_family_id uuid,input_display_name text,input_is_self boolean default false
) returns uuid language plpgsql security definer set search_path=public,auth as $$
declare actor uuid := auth.uid(); result uuid;
begin
  if actor is null or not exists(select 1 from public.families
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
revoke all on function public.create_family_place_person(uuid,text,boolean) from public,anon;
grant execute on function public.create_family_place_person(uuid,text,boolean) to authenticated;

create table public.family_free_stories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  question_slot smallint not null check (question_slot between 1 and 3),
  question_key text not null,
  question_text text not null,
  body text not null default '',
  transcript_raw text not null default '',
  transcript_readable text not null default '',
  transcript_essay text not null default '',
  visibility text not null check (visibility in ('private','family')),
  created_by uuid not null references auth.users(id),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(person_id,question_slot),
  constraint family_free_stories_question_length check (char_length(question_text) between 1 and 500)
);
create index family_free_stories_family_person_idx
  on public.family_free_stories(family_id,person_id,created_at desc);

create table public.family_free_story_media (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.family_free_stories(id) on delete cascade,
  asset_type text not null check (asset_type in ('photo','audio')),
  storage_path text not null unique,
  uploaded_by uuid not null references auth.users(id),
  duration_seconds integer check (duration_seconds between 0 and 3600),
  created_at timestamptz not null default now()
);
create index family_free_story_media_story_idx on public.family_free_story_media(story_id);

create or replace function public.family_free_story_can_read(input_story_id uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
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
      )
  );
$$;
create or replace function public.family_free_story_can_write(input_story_id uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select auth.uid() is not null and exists (
    select 1 from public.family_free_stories s
    join public.families f on f.id=s.family_id
    where s.id=input_story_id and s.created_by=auth.uid()
      and f.owner_user_id=auth.uid()
      and exists(select 1 from public.persons p
        where p.id=s.person_id and p.family_id=s.family_id)
  );
$$;
revoke all on function public.family_free_story_can_read(uuid) from public,anon;
revoke all on function public.family_free_story_can_write(uuid) from public,anon;
grant execute on function public.family_free_story_can_read(uuid) to authenticated,service_role;
grant execute on function public.family_free_story_can_write(uuid) to authenticated,service_role;

create or replace function public.family_free_media_object_exists(input_story_id uuid,input_path text)
returns boolean language sql stable security definer set search_path=storage,public,auth as $$
  select public.family_free_story_can_write(input_story_id)
    and input_path like auth.uid()::text || '/' || input_story_id::text || '/%'
    and exists(select 1 from storage.objects o
    where o.bucket_id='family-free-media' and o.name=input_path);
$$;
revoke all on function public.family_free_media_object_exists(uuid,text) from public,anon;
grant execute on function public.family_free_media_object_exists(uuid,text) to authenticated,service_role;

alter table public.family_person_profile_facts enable row level security;
alter table public.family_free_stories enable row level security;
alter table public.family_free_story_media enable row level security;
create policy family_profile_facts_owner_all on public.family_person_profile_facts
  for all to authenticated
  using (exists(select 1 from public.families f join public.persons p
    on p.family_id=f.id where f.id=family_id and p.id=person_id
      and f.owner_user_id=(select auth.uid())))
  with check (exists(select 1 from public.families f join public.persons p
    on p.family_id=f.id where f.id=family_id and p.id=person_id
      and f.owner_user_id=(select auth.uid()))
    and created_by=(select auth.uid()));
create policy family_free_stories_read on public.family_free_stories
  for select to authenticated using (public.family_free_story_can_read(id));
create policy family_free_stories_insert on public.family_free_stories
  for insert to authenticated with check (
    created_by=(select auth.uid())
    and exists(select 1 from public.families f join public.persons p
      on p.family_id=f.id where f.id=family_id and p.id=person_id
        and f.owner_user_id=(select auth.uid()))
    and (visibility='family' or exists (
      select 1 from public.user_person_links l
      where l.person_id=person_id and l.user_id=(select auth.uid()) and l.role='self'))
  );
create policy family_free_stories_update on public.family_free_stories
  for update to authenticated using (public.family_free_story_can_write(id))
  with check (public.family_free_story_can_write(id)
    and (visibility='family' or exists (
      select 1 from public.user_person_links l
      where l.person_id=person_id and l.user_id=(select auth.uid()) and l.role='self')));
create policy family_free_story_media_read on public.family_free_story_media
  for select to authenticated using (public.family_free_story_can_read(story_id));
create policy family_free_story_media_insert on public.family_free_story_media
  for insert to authenticated with check (
    uploaded_by=(select auth.uid())
    and public.family_free_story_can_write(story_id)
    and storage_path like (select auth.uid())::text || '/' || story_id::text || '/%'
    and public.family_free_media_object_exists(story_id,storage_path));
create policy family_free_story_media_delete on public.family_free_story_media
  for delete to authenticated using (
    uploaded_by=(select auth.uid()) and public.family_free_story_can_write(story_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('family-free-media','family-free-media',false,25000000,
  array['image/jpeg','image/png','image/webp','audio/mp4','audio/webm','audio/mpeg'])
on conflict(id) do nothing;

-- Object path: uploader UUID / story UUID / random filename.
create policy family_free_media_upload on storage.objects for insert to authenticated
  with check (bucket_id='family-free-media'
    and split_part(name,'/',1)=(select auth.uid())::text
    and public.family_free_story_can_write(
      nullif(split_part(name,'/',2),'')::uuid));
create policy family_free_media_read on storage.objects for select to authenticated
  using (bucket_id='family-free-media' and exists(
    select 1 from public.family_free_story_media m
    where m.storage_path=name and public.family_free_story_can_read(m.story_id)));
create policy family_free_media_delete on storage.objects for delete to authenticated
  using (bucket_id='family-free-media'
    and split_part(name,'/',1)=(select auth.uid())::text
    and public.family_free_story_can_write(
      nullif(split_part(name,'/',2),'')::uuid));

grant select,insert,update,delete on public.family_person_profile_facts to authenticated;
grant select,insert,update on public.family_free_stories to authenticated;
grant select,insert,delete on public.family_free_story_media to authenticated;

commit;
