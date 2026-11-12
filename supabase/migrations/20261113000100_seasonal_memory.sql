-- A seasonal memory belongs to a story, never to a frozen BOOK snapshot.
-- New tables and a private bucket only; existing answers, orders and publications
-- are neither rewritten nor copied by this migration.
begin;

create table public.seasonal_memory_records (
  id uuid primary key default gen_random_uuid(),
  book_project_id uuid not null references public.book_projects(id),
  season_start date not null,
  kind text not null check (kind in ('daily','life')),
  theme_code text,
  question_id uuid references public.user_questions(id),
  question_text text,
  title text not null default '',
  body text not null default '',
  transcript_raw text not null default '',
  transcript_clean text not null default '',
  transcript_readable text not null default '',
  transcript_essay text not null default '',
  tone text not null default 'readable' check (tone in ('clean','readable','essay')),
  event_period text,
  status text not null default 'draft' check (status in ('draft','completed','expired')),
  locked boolean not null default false,
  revision integer not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(book_project_id,season_start),
  check (extract(month from season_start)::integer in (1,4,7,10)
    and extract(day from season_start)::integer=1),
  check (kind='daily' or (theme_code is not null and question_text is not null)),
  check (status<>'completed' or completed_at is not null)
);
create index seasonal_memory_records_project_status_idx
  on public.seasonal_memory_records(book_project_id,status,season_start desc);

create table public.seasonal_memory_media (
  id uuid primary key,
  record_id uuid not null references public.seasonal_memory_records(id) on delete cascade,
  kind text not null check (kind in ('photo','audio')),
  storage_path text not null unique,
  mime_type text not null,
  byte_size integer not null check (byte_size between 1 and 25000000),
  sort_order integer not null default 0,
  duration_seconds integer check (duration_seconds > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index seasonal_memory_media_record_idx
  on public.seasonal_memory_media(record_id,kind,sort_order,created_at);

create or replace function public.seasonal_memory_is_self(input_project_id uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select auth.uid() is not null and exists (
    select 1 from public.book_projects p
    join public.user_person_links l on l.person_id=p.subject_person_id
    where p.id=input_project_id and l.user_id=auth.uid() and l.role='self');
$$;

create or replace function public.seasonal_memory_published(input_project_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.voice_publications p
    where p.book_project_id=input_project_id and p.status='published');
$$;

create or replace function public.seasonal_memory_can_edit(input_project_id uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select auth.uid() is not null and public.seasonal_memory_published(input_project_id)
    and exists(select 1 from public.book_projects p
      where p.id=input_project_id and p.status='active')
    and (public.seasonal_memory_is_self(input_project_id)
      or exists(select 1 from public.book_projects p
        where p.id=input_project_id and p.owner_user_id=auth.uid())
      or exists(select 1 from public.project_supporters s
        where s.book_project_id=input_project_id and s.supporter_user_id=auth.uid()
          and s.status='active' and s.can_operate_recording));
$$;

create or replace function public.seasonal_memory_can_view(input_record_id uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select auth.uid() is not null and exists(
    select 1 from public.seasonal_memory_records r
    where r.id=input_record_id and public.seasonal_memory_published(r.book_project_id)
      and (not r.locked or public.seasonal_memory_is_self(r.book_project_id))
      and (public.seasonal_memory_is_self(r.book_project_id)
        or exists(select 1 from public.book_projects p
          where p.id=r.book_project_id and p.owner_user_id=auth.uid())
        or public.seasonal_memory_can_edit(r.book_project_id)
        or (r.status='completed' and public.shared_story_recipient_can_view(r.book_project_id)))
      and (r.status='completed' or public.seasonal_memory_can_edit(r.book_project_id)));
$$;

create or replace function public.seasonal_memory_open(input_record_id uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists(select 1 from public.seasonal_memory_records r
    where r.id=input_record_id and r.status='draft'
      and (now() at time zone 'Asia/Tokyo')::date < (r.season_start + interval '4 months')::date
      and public.seasonal_memory_can_edit(r.book_project_id));
$$;

alter table public.seasonal_memory_records enable row level security;
alter table public.seasonal_memory_media enable row level security;
create policy seasonal_records_read on public.seasonal_memory_records
  for select to authenticated using(public.seasonal_memory_can_view(id));
create policy seasonal_media_read on public.seasonal_memory_media
  for select to authenticated using(public.seasonal_memory_can_view(record_id));
revoke all on public.seasonal_memory_records,public.seasonal_memory_media from public,anon,authenticated;
grant select on public.seasonal_memory_records,public.seasonal_memory_media to authenticated;
grant all on public.seasonal_memory_records,public.seasonal_memory_media to service_role;

-- The caller can only create the current or still-open previous quarter.
create function public.start_seasonal_memory(
  input_project_id uuid,input_season_start date,input_kind text,
  input_theme_code text default null,input_question_id uuid default null,
  input_question_text text default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare r public.seasonal_memory_records%rowtype;
  today_jst date:=(now() at time zone 'Asia/Tokyo')::date;
  current_start date:=date_trunc('quarter',now() at time zone 'Asia/Tokyo')::date;
begin
  if not public.seasonal_memory_can_edit(input_project_id) then
    raise exception 'Forbidden' using errcode='42501'; end if;
  if input_season_start not in (current_start,(current_start-interval '3 months')::date)
    or today_jst >= (input_season_start+interval '4 months')::date then
    raise exception 'This season is closed' using errcode='22023'; end if;
  if input_kind not in ('daily','life') or
    (input_kind='life' and (input_theme_code is null or input_question_text is null
      or length(trim(input_question_text))=0 or length(input_question_text)>1000)) then
    raise exception 'Invalid memory type' using errcode='22023'; end if;
  if input_kind='life' and input_question_id is not null and not exists(
    select 1 from public.user_questions q where q.id=input_question_id
      and q.book_project_id=input_project_id) then
    raise exception 'Invalid question' using errcode='22023'; end if;
  insert into public.seasonal_memory_records(
    book_project_id,season_start,kind,theme_code,question_id,question_text,created_by)
  values(input_project_id,input_season_start,input_kind,input_theme_code,
    input_question_id,input_question_text,auth.uid())
  on conflict(book_project_id,season_start) do nothing;
  select * into r from public.seasonal_memory_records
    where book_project_id=input_project_id and season_start=input_season_start;
  if not public.seasonal_memory_can_view(r.id) then
    raise exception 'Forbidden' using errcode='42501'; end if;
  return to_jsonb(r);
end; $$;

create function public.save_seasonal_memory(
  input_record_id uuid,input_expected_revision integer,input_title text,input_body text,
  input_transcript_raw text,input_transcript_clean text,
  input_transcript_readable text,input_transcript_essay text,
  input_tone text,input_event_period text default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare r public.seasonal_memory_records%rowtype;
begin
  select * into r from public.seasonal_memory_records where id=input_record_id for update;
  if r.id is null or not public.seasonal_memory_open(r.id) then
    raise exception 'This memory cannot be edited' using errcode='42501'; end if;
  if r.revision<>input_expected_revision then
    raise exception 'This memory changed; reload before saving' using errcode='40001'; end if;
  if length(coalesce(input_title,''))>200 or length(coalesce(input_body,''))>50000
    or length(coalesce(input_transcript_raw,''))>50000
    or length(coalesce(input_transcript_clean,''))>50000
    or length(coalesce(input_transcript_readable,''))>50000
    or length(coalesce(input_transcript_essay,''))>50000
    or length(coalesce(input_event_period,''))>100
    or input_tone not in ('clean','readable','essay') then
    raise exception 'Invalid memory content' using errcode='22023'; end if;
  update public.seasonal_memory_records set
    title=coalesce(input_title,''),body=coalesce(input_body,''),
    transcript_raw=coalesce(input_transcript_raw,''),
    transcript_clean=coalesce(input_transcript_clean,''),
    transcript_readable=coalesce(input_transcript_readable,''),
    transcript_essay=coalesce(input_transcript_essay,''),
    tone=input_tone,event_period=input_event_period,
    revision=revision+1,updated_at=now()
  where id=r.id returning * into r;
  return to_jsonb(r);
end; $$;

create function public.register_seasonal_memory_media(
  input_record_id uuid,input_media_id uuid,input_kind text,input_path text,
  input_mime_type text,input_byte_size integer,input_duration_seconds integer default null
) returns jsonb language plpgsql security definer set search_path=public,auth,storage as $$
declare r public.seasonal_memory_records%rowtype; m public.seasonal_memory_media%rowtype;
  suffix text;
begin
  select * into r from public.seasonal_memory_records where id=input_record_id for update;
  if r.id is null or not public.seasonal_memory_open(r.id) then
    raise exception 'This memory cannot be edited' using errcode='42501'; end if;
  suffix:=split_part(input_path,'.',2);
  if input_path not like r.id::text||'/'||input_media_id::text||'.%'
    or input_path <> r.id::text||'/'||input_media_id::text||'.'||suffix
    or (input_kind='photo' and (suffix not in ('jpg','jpeg','png','webp')
      or input_mime_type not in ('image/jpeg','image/png','image/webp')))
    or (input_kind='audio' and (suffix not in ('mp4','webm','m4a')
      or input_mime_type not in ('audio/mp4','audio/webm','audio/x-m4a')))
    or input_kind not in ('photo','audio') or input_byte_size not between 1 and 25000000
    or (input_kind='audio' and
      (input_duration_seconds is null or input_duration_seconds < 1)) then
    raise exception 'Invalid media' using errcode='22023'; end if;
  if not exists(select 1 from storage.objects o
    where o.bucket_id='seasonal-memory' and o.name=input_path
      and (o.metadata->>'size')::integer=input_byte_size) then
    raise exception 'Uploaded media was not found' using errcode='22023'; end if;
  if input_kind='photo' and (select count(*) from public.seasonal_memory_media
    where record_id=r.id and kind='photo')>=10 then
    raise exception 'Too many photos' using errcode='22023'; end if;
  insert into public.seasonal_memory_media(id,record_id,kind,storage_path,mime_type,
    byte_size,sort_order,duration_seconds,created_by)
  values(input_media_id,r.id,input_kind,input_path,input_mime_type,input_byte_size,
    coalesce((select max(sort_order)+1 from public.seasonal_memory_media
      where record_id=r.id and kind=input_kind),0),input_duration_seconds,auth.uid())
  on conflict(id) do nothing returning * into m;
  if m.id is null then
    select * into m from public.seasonal_memory_media where id=input_media_id;
    if m.record_id<>r.id or m.storage_path<>input_path then
      raise exception 'Media ID already used' using errcode='22023'; end if;
  else
    update public.seasonal_memory_records set revision=revision+1,updated_at=now()
      where id=r.id;
  end if;
  return to_jsonb(m);
end; $$;

create function public.remove_seasonal_memory_media(input_media_id uuid)
returns text language plpgsql security definer set search_path=public,auth as $$
declare m public.seasonal_memory_media%rowtype; r public.seasonal_memory_records%rowtype;
begin
  select * into m from public.seasonal_memory_media where id=input_media_id;
  if m.id is null then return null; end if;
  select * into r from public.seasonal_memory_records where id=m.record_id for update;
  if not public.seasonal_memory_open(r.id) then
    raise exception 'This memory cannot be edited' using errcode='42501'; end if;
  delete from public.seasonal_memory_media where id=m.id;
  update public.seasonal_memory_records set revision=revision+1,updated_at=now() where id=r.id;
  return m.storage_path;
end; $$;

create function public.reorder_seasonal_memory_photos(
  input_record_id uuid,input_photo_ids uuid[]
) returns void language plpgsql security definer set search_path=public,auth as $$
declare r public.seasonal_memory_records%rowtype;
begin
  select * into r from public.seasonal_memory_records where id=input_record_id for update;
  if r.id is null or not public.seasonal_memory_open(r.id) then
    raise exception 'This memory cannot be edited' using errcode='42501'; end if;
  if input_photo_ids is null
    or cardinality(input_photo_ids)<>(select count(*) from public.seasonal_memory_media
      where record_id=r.id and kind='photo')
    or cardinality(input_photo_ids)<>(select count(distinct x) from unnest(input_photo_ids) x)
    or exists(select 1 from unnest(input_photo_ids) x where not exists(
      select 1 from public.seasonal_memory_media m where m.id=x
        and m.record_id=r.id and m.kind='photo')) then
    raise exception 'Invalid photo order' using errcode='22023'; end if;
  update public.seasonal_memory_media m set sort_order=array_position(input_photo_ids,m.id)-1
    where m.record_id=r.id and m.kind='photo';
  update public.seasonal_memory_records set revision=revision+1,updated_at=now() where id=r.id;
end; $$;

create function public.finish_seasonal_memory(input_record_id uuid,input_expected_revision integer)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare r public.seasonal_memory_records%rowtype;
begin
  select * into r from public.seasonal_memory_records where id=input_record_id for update;
  if r.id is null or not public.seasonal_memory_open(r.id) then
    raise exception 'This memory cannot be finished' using errcode='42501'; end if;
  if r.revision<>input_expected_revision then
    raise exception 'This memory changed; reload before finishing' using errcode='40001'; end if;
  if length(trim(r.body))=0 and length(trim(r.transcript_raw))=0
    and not exists(select 1 from public.seasonal_memory_media m where m.record_id=r.id) then
    raise exception 'Add a memory before finishing' using errcode='22023'; end if;
  update public.seasonal_memory_records set status='completed',completed_at=now(),
    revision=revision+1,updated_at=now() where id=r.id returning * into r;
  return to_jsonb(r);
end; $$;

create function public.set_seasonal_memory_lock(input_record_id uuid,input_locked boolean)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare r public.seasonal_memory_records%rowtype;
begin
  select * into r from public.seasonal_memory_records where id=input_record_id for update;
  if r.id is null or r.status<>'completed' or input_locked is null
    or not public.seasonal_memory_is_self(r.book_project_id) then
    raise exception 'Only the subject can change the lock' using errcode='42501'; end if;
  update public.seasonal_memory_records set locked=input_locked,updated_at=now()
    where id=r.id returning * into r;
  return to_jsonb(r);
end; $$;

-- Idempotent daily sweep. It changes only independent seasonal records.
create function public.close_expired_seasonal_memories(input_today_jst date default null)
returns integer language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
  if current_user not in ('postgres','service_role') then
    raise exception 'Forbidden' using errcode='42501'; end if;
  with expired as (
    update public.seasonal_memory_records r set
      status=case when length(trim(r.body))>0 or length(trim(r.transcript_raw))>0
        or exists(select 1 from public.seasonal_memory_media m where m.record_id=r.id)
        then 'completed' else 'expired' end,
      completed_at=case when length(trim(r.body))>0 or length(trim(r.transcript_raw))>0
        or exists(select 1 from public.seasonal_memory_media m where m.record_id=r.id)
        then now() else null end,
      revision=r.revision+1,updated_at=now()
    where r.status='draft' and
      coalesce(input_today_jst,(now() at time zone 'Asia/Tokyo')::date)
        >=(r.season_start+interval '4 months')::date
    returning r.id)
  select count(*) into changed from expired;
  return changed;
end; $$;

revoke all on function public.seasonal_memory_is_self(uuid),
  public.seasonal_memory_published(uuid),public.seasonal_memory_can_edit(uuid),
  public.seasonal_memory_can_view(uuid),public.seasonal_memory_open(uuid),
  public.start_seasonal_memory(uuid,date,text,text,uuid,text),
  public.save_seasonal_memory(uuid,integer,text,text,text,text,text,text,text,text),
  public.register_seasonal_memory_media(uuid,uuid,text,text,text,integer,integer),
  public.remove_seasonal_memory_media(uuid),
  public.reorder_seasonal_memory_photos(uuid,uuid[]),
  public.finish_seasonal_memory(uuid,integer),
  public.set_seasonal_memory_lock(uuid,boolean),
  public.close_expired_seasonal_memories(date) from public,anon;
grant execute on function public.seasonal_memory_is_self(uuid),
  public.seasonal_memory_published(uuid),public.seasonal_memory_can_edit(uuid),
  public.seasonal_memory_can_view(uuid),public.seasonal_memory_open(uuid),
  public.start_seasonal_memory(uuid,date,text,text,uuid,text),
  public.save_seasonal_memory(uuid,integer,text,text,text,text,text,text,text,text),
  public.register_seasonal_memory_media(uuid,uuid,text,text,text,integer,integer),
  public.remove_seasonal_memory_media(uuid),
  public.reorder_seasonal_memory_photos(uuid,uuid[]),
  public.finish_seasonal_memory(uuid,integer),
  public.set_seasonal_memory_lock(uuid,boolean) to authenticated;
revoke all on function public.close_expired_seasonal_memories(date) from authenticated;
grant execute on function public.close_expired_seasonal_memories(date) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('seasonal-memory','seasonal-memory',false,25000000,
  array['image/jpeg','image/png','image/webp','audio/mp4','audio/webm','audio/x-m4a'])
on conflict(id) do nothing;

create function public.seasonal_memory_path_record(input_path text)
returns uuid language plpgsql immutable set search_path=public as $$
begin
  if input_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|mp4|m4a|webm)$' then
    return null; end if;
  return split_part(input_path,'/',1)::uuid;
end; $$;
create policy seasonal_storage_upload on storage.objects for insert to authenticated
  with check(bucket_id='seasonal-memory' and
    public.seasonal_memory_open(public.seasonal_memory_path_record(name)));
create policy seasonal_storage_upload_guard on storage.objects as restrictive
  for insert to anon,authenticated with check(bucket_id<>'seasonal-memory' or
    public.seasonal_memory_open(public.seasonal_memory_path_record(name)));
-- Media is streamed through an authenticated Edge Function on every read.
-- Direct SELECT would allow signed URLs to survive a later lock change.
create policy seasonal_storage_read on storage.objects for select to authenticated
  using(false);
create policy seasonal_storage_delete on storage.objects for delete to authenticated
  using(false);
-- These guards override any broad permissive Storage policy.
create policy seasonal_storage_read_guard on storage.objects as restrictive
  for select to anon,authenticated using(bucket_id<>'seasonal-memory');
create policy seasonal_storage_mutation_guard on storage.objects as restrictive
  for update to anon,authenticated using(bucket_id<>'seasonal-memory')
  with check(bucket_id<>'seasonal-memory');
create policy seasonal_storage_delete_guard on storage.objects as restrictive
  for delete to anon,authenticated using(bucket_id<>'seasonal-memory');
revoke all on function public.seasonal_memory_path_record(text) from public,anon;
grant execute on function public.seasonal_memory_path_record(text) to authenticated;

-- 00:15 JST, after a grace month ends. Existing schedule names are untouched.
select cron.schedule('seasonal-memory-close','15 15 * * *',
  'select public.close_expired_seasonal_memories()');
commit;
