begin;

-- A book can keep up to two short, optional video messages. The editable
-- source is private; publish-voice-edition makes an immutable copy later.
create table if not exists public.video_stories (
  id uuid primary key default gen_random_uuid(),
  book_project_id uuid not null
    references public.book_projects(id)
    on delete cascade,
  subject_person_id uuid
    references public.persons(id)
    on delete set null,
  created_by_user_id uuid not null
    references auth.users(id)
    on delete restrict,
  slot_order integer not null,
  prompt_kind text not null default 'free',
  prompt_text text not null default '',
  title text not null default '',
  source_answer_id uuid
    references public.answers(id)
    on delete set null,
  video_storage_path text not null unique,
  audio_storage_path text,
  poster_storage_path text,
  duration_seconds numeric not null default 0,
  mime_type text not null default '',
  file_size_bytes bigint,
  status text not null default 'processing',
  transcript_text text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_stories_project_slot_unique
    unique (book_project_id, slot_order),
  constraint video_stories_slot_order_check
    check (slot_order between 1 and 2),
  constraint video_stories_prompt_kind_check
    check (prompt_kind in ('current_self', 'memory', 'message', 'existing_question', 'free', 'custom')),
  constraint video_stories_duration_check
    check (duration_seconds >= 0 and duration_seconds <= 305),
  constraint video_stories_file_size_check
    check (file_size_bytes is null or file_size_bytes >= 0),
  constraint video_stories_status_check
    check (status in ('processing', 'ready', 'failed')),
  constraint video_stories_metadata_check
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists video_stories_project_order_idx
  on public.video_stories(book_project_id, slot_order);

drop trigger if exists video_stories_updated_at on public.video_stories;
create trigger video_stories_updated_at
before update on public.video_stories
for each row execute function public.set_tateyoko_updated_at();

create or replace function public.can_manage_video_stories(input_book_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.book_projects project
    where project.id = input_book_project_id
      and project.status = 'active'
      and (
        project.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.project_supporters supporter
          where supporter.book_project_id = project.id
            and supporter.supporter_user_id = auth.uid()
            and supporter.status = 'active'
            and supporter.can_operate_recording = true
        )
        or exists (
          select 1
          from public.admin_users admin_user
          where admin_user.user_id = auth.uid()
            and admin_user.is_active = true
        )
      )
  );
$$;

revoke all on function public.can_manage_video_stories(uuid) from public;
grant execute on function public.can_manage_video_stories(uuid) to authenticated;

create or replace function public.enforce_video_story_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  existing_count integer;
begin
  -- Serialize inserts for one project so concurrent uploads cannot create a
  -- third item between the count and insert.
  perform 1
  from public.book_projects
  where id = new.book_project_id
  for update;

  select count(*) into existing_count
  from public.video_stories story
  where story.book_project_id = new.book_project_id;

  if existing_count >= 2 then
    raise exception 'A book can contain at most two videos';
  end if;

  return new;
end;
$$;

drop trigger if exists video_stories_limit on public.video_stories;
create trigger video_stories_limit
before insert on public.video_stories
for each row execute function public.enforce_video_story_limit();

alter table public.video_stories enable row level security;

drop policy if exists video_stories_manager_select on public.video_stories;
create policy video_stories_manager_select
on public.video_stories for select to authenticated
using (public.can_manage_video_stories(book_project_id));

drop policy if exists video_stories_manager_insert on public.video_stories;
create policy video_stories_manager_insert
on public.video_stories for insert to authenticated
with check (
  created_by_user_id = auth.uid()
  and public.can_manage_video_stories(book_project_id)
);

drop policy if exists video_stories_manager_update on public.video_stories;
create policy video_stories_manager_update
on public.video_stories for update to authenticated
using (public.can_manage_video_stories(book_project_id))
with check (public.can_manage_video_stories(book_project_id));

drop policy if exists video_stories_manager_delete on public.video_stories;
create policy video_stories_manager_delete
on public.video_stories for delete to authenticated
using (public.can_manage_video_stories(book_project_id));

revoke all on public.video_stories from anon, authenticated;
grant select, insert, update, delete on public.video_stories to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'videos',
  'videos',
  false,
  125829120,
  array[
    'video/mp4',
    'video/webm',
    'audio/mp4',
    'audio/webm',
    'audio/ogg',
    'image/jpeg'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists video_story_storage_insert on storage.objects;
create policy video_story_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists video_story_storage_select on storage.objects;
create policy video_story_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'videos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.video_stories story
      where name in (
        story.video_storage_path,
        story.audio_storage_path,
        story.poster_storage_path
      )
        and public.can_manage_video_stories(story.book_project_id)
    )
  )
);

drop policy if exists video_story_storage_update on storage.objects;
create policy video_story_storage_update
on storage.objects for update to authenticated
using (
  bucket_id = 'videos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists video_story_storage_delete on storage.objects;
create policy video_story_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'videos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.video_stories story
      where name in (
        story.video_storage_path,
        story.audio_storage_path,
        story.poster_storage_path
      )
        and public.can_manage_video_stories(story.book_project_id)
    )
  )
);

alter table public.voice_publications
  add column if not exists video_assets jsonb not null default '[]'::jsonb;

alter table public.voice_publications
  drop constraint if exists voice_publications_video_assets_check;
alter table public.voice_publications
  add constraint voice_publications_video_assets_check
  check (jsonb_typeof(video_assets) = 'array');

comment on table public.video_stories is
  '一冊につき最大2本の、任意で残す短いビデオ。最大5分。';

comment on column public.voice_publications.video_assets is
  '発行時点で固定コピーしたビデオ、音声のみ版、表紙画像の一覧。';

commit;
