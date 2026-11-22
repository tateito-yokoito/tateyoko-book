-- New person-story media uses the existing BOOK buckets. Older free-media
-- objects remain readable in their original bucket and are never migrated.
begin;

alter table public.family_free_story_media
  add column storage_bucket text not null default 'family-free-media'
  check (storage_bucket in ('family-free-media','photos','audio'));
alter table public.family_free_story_media
  add constraint family_story_media_bucket_kind check (
    (storage_bucket='photos' and asset_type='photo') or
    (storage_bucket='audio' and asset_type='audio') or
    storage_bucket='family-free-media');

create function public.family_free_media_object_exists(
  input_story_id uuid,input_path text,input_bucket text
) returns boolean language sql volatile security definer
set search_path=public,storage,auth as $$
  select input_bucket in ('family-free-media','photos','audio')
    and public.family_free_story_can_write(input_story_id)
    and input_path like auth.uid()::text || '/' || input_story_id::text || '/%'
    and exists(select 1 from storage.objects o
      where o.bucket_id=input_bucket and o.name=input_path);
$$;
revoke all on function public.family_free_media_object_exists(uuid,text,text) from public,anon;
grant execute on function public.family_free_media_object_exists(uuid,text,text)
  to authenticated;

drop policy family_free_story_media_insert on public.family_free_story_media;
create policy family_free_story_media_insert on public.family_free_story_media
  for insert to authenticated with check (
    uploaded_by=(select auth.uid())
    and public.family_free_story_can_write(story_id)
    and public.family_free_media_object_exists(story_id,storage_path,storage_bucket));

-- The owner path upload policies already cover these private BOOK buckets.
-- This SELECT grant is needed for consented co-managers; the restrictive
-- boundary below applies even when another permissive BOOK policy matches.
create policy family_story_standard_media_read on storage.objects
  for select to authenticated using (
    (bucket_id='photos' or bucket_id='audio') and exists(
      select 1 from public.family_free_story_media m
      where m.storage_bucket=bucket_id and m.storage_path=name
        and public.family_free_story_can_read(m.story_id)));

create or replace function public.person_story_linked_storage_allowed(
  input_bucket text,input_path text
) returns boolean language sql volatile security definer
set search_path=public,storage,auth as $$
  select not exists (
    select 1 from public.family_free_story_media fm
    where fm.storage_bucket=input_bucket and fm.storage_path=input_path
      and not public.family_free_story_can_read(fm.story_id)
  ) and not exists (
    select 1 from public.media_assets m
    where input_bucket in ('audio','photos','videos')
      and m.storage_path=input_path
      and not public.person_story_linked_answer_readable(m.answer_id)
  ) and not exists (
    select 1 from public.video_stories v
    where input_bucket='videos'
      and input_path in (v.video_storage_path,v.audio_storage_path,v.poster_storage_path)
      and not public.person_story_linked_answer_readable(v.source_answer_id)
  ) and not exists (
    select 1 from public.answer_audio_archive archive
    where input_bucket='audio' and archive.storage_path=input_path
      and not public.person_story_linked_answer_readable(archive.answer_id)
  );
$$;

-- An attached original is append-only until replacement can be committed
-- atomically with all projections. This also protects bytes against direct
-- Storage API deletion and prevents dangling free-story metadata.
create function public.guard_linked_person_story_media()
returns trigger language plpgsql security definer set search_path=public as $$
declare story uuid;
begin
  if tg_table_name='family_free_story_media' then
    story:=old.story_id;
  else
    if tg_op='UPDATE' and
      (new.answer_id,new.asset_type,new.storage_path) is not distinct from
      (old.answer_id,old.asset_type,old.storage_path) then return new; end if;
    select l.story_id into story from public.person_story_book_links l
      where l.answer_id=old.answer_id;
  end if;
  if story is not null and exists(
    select 1 from public.person_story_book_links l where l.story_id=story) then
    raise exception 'Linked story media cannot be replaced or deleted yet'
      using errcode='55000';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_linked_person_story_media() from public,anon,authenticated;
create trigger guard_linked_family_story_media
  before update or delete on public.family_free_story_media
  for each row execute function public.guard_linked_person_story_media();
create trigger guard_linked_book_story_media
  before update or delete on public.media_assets
  for each row execute function public.guard_linked_person_story_media();

create function public.guard_linked_person_story_object()
returns trigger language plpgsql security definer set search_path=public,storage as $$
begin
  if exists(select 1 from public.family_free_story_media fm
      join public.person_story_book_links l on l.story_id=fm.story_id
      where fm.storage_bucket=old.bucket_id and fm.storage_path=old.name) then
    raise exception 'Linked story media cannot be replaced or deleted yet'
      using errcode='55000';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_linked_person_story_object() from public,anon,authenticated;
create trigger guard_linked_person_story_object
  before update or delete on storage.objects
  for each row execute function public.guard_linked_person_story_object();

-- One mutable original, with BOOK media rows as output projections. File
-- paths are shared only while append-only. Existing published editions stay
-- on their immutable snapshots and never receive later additions.
create function public.project_person_story_media_to_book()
returns trigger language plpgsql security definer set search_path=public,storage as $$
begin
  if pg_trigger_depth()>1 or new.storage_bucket='family-free-media' then return new; end if;
  insert into public.media_assets
    (answer_id,user_id,family_id,book_project_id,person_id,
     asset_type,storage_path,meta_json)
  select a.id,a.user_id,s.family_id,l.book_project_id,s.person_id,
    new.asset_type,new.storage_path,
    jsonb_build_object('duration_seconds',new.duration_seconds,
      'person_story_media_id',new.id)
  from public.person_story_book_links l
  join public.family_free_stories s on s.id=l.story_id
  join public.answers a on a.id=l.answer_id
  where l.story_id=new.story_id
    and not exists(select 1 from public.book_work_manifests w
      where w.book_project_id=l.book_project_id and w.confirmed_at is not null)
  on conflict (answer_id,asset_type,storage_path) do nothing;
  return new;
end;
$$;
revoke all on function public.project_person_story_media_to_book() from public,anon,authenticated;
create trigger project_person_story_media_to_book
  after insert on public.family_free_story_media
  for each row execute function public.project_person_story_media_to_book();

create function public.project_book_media_to_person_story()
returns trigger language plpgsql security definer set search_path=public,storage,auth as $$
declare linked_story uuid; expected_bucket text;
begin
  if pg_trigger_depth()>1 or new.asset_type not in ('photo','audio') then return new; end if;
  select l.story_id into linked_story from public.person_story_book_links l
    where l.answer_id=new.answer_id;
  if linked_story is null then return new; end if;
  if not public.family_free_story_can_write(linked_story) then
    raise exception 'This story is not editable' using errcode='42501';
  end if;
  expected_bucket:=case when new.asset_type='photo' then 'photos' else 'audio' end;
  if not exists(select 1 from storage.objects o
      where o.bucket_id=expected_bucket and o.name=new.storage_path) then
    raise exception 'Media object is not stored' using errcode='23514';
  end if;
  insert into public.family_free_story_media
    (story_id,asset_type,storage_bucket,storage_path,uploaded_by,duration_seconds)
  values (linked_story,new.asset_type,expected_bucket,new.storage_path,
    new.user_id,nullif(new.meta_json->>'duration_seconds','')::integer)
  on conflict (storage_path) do nothing;
  return new;
end;
$$;
revoke all on function public.project_book_media_to_person_story() from public,anon,authenticated;
create trigger project_book_media_to_person_story
  after insert on public.media_assets
  for each row execute function public.project_book_media_to_person_story();

create function public.is_person_story_linked_answer(input_answer_id uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select auth.uid() is not null and exists(
    select 1 from public.person_story_book_links l
    join public.answers a on a.id=l.answer_id
    where l.answer_id=input_answer_id and a.user_id=auth.uid());
$$;
revoke all on function public.is_person_story_linked_answer(uuid) from public,anon;
grant execute on function public.is_person_story_linked_answer(uuid) to authenticated;

commit;
