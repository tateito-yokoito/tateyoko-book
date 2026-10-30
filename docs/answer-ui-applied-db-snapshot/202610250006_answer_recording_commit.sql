begin;

create table if not exists public.answer_recording_attempts (
  id uuid primary key,
  user_id uuid not null,
  book_project_id uuid not null references public.book_projects(id),
  sequence_order integer not null,
  answer_id uuid not null,
  mode text not null check (mode in ('initial','replace','append','voice_only')),
  storage_paths text[] not null,
  state text not null default 'planned' check (state in ('planned','committed')),
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  check (cardinality(storage_paths) between 1 and 5)
);
create index if not exists answer_recording_attempts_owner_idx
  on public.answer_recording_attempts(user_id,book_project_id,sequence_order,created_at desc);
alter table public.answer_recording_attempts enable row level security;
revoke all on public.answer_recording_attempts from public,anon,authenticated;
grant select,insert on public.answer_recording_attempts to authenticated;
grant all on public.answer_recording_attempts to service_role;
create policy answer_recording_attempts_owner_read on public.answer_recording_attempts
  for select to authenticated using ((select auth.uid())=user_id);
create policy answer_recording_attempts_owner_insert on public.answer_recording_attempts
  for insert to authenticated with check (
    (select auth.uid())=user_id and state='planned' and committed_at is null
    and exists (select 1 from public.user_questions q where q.user_id=answer_recording_attempts.user_id
      and q.book_project_id=answer_recording_attempts.book_project_id
      and q.sequence_order=answer_recording_attempts.sequence_order)
  );

create table if not exists public.answer_audio_archive (
  id uuid primary key default gen_random_uuid(),
  source_media_id uuid not null unique,
  answer_id uuid not null references public.answers(id) on delete cascade,
  user_id uuid not null,
  storage_path text not null,
  meta_json jsonb not null default '{}'::jsonb,
  original_created_at timestamptz,
  archived_at timestamptz not null default now()
);
create index if not exists answer_audio_archive_owner_idx
  on public.answer_audio_archive(user_id,answer_id,archived_at desc);
alter table public.answer_audio_archive enable row level security;
revoke all on public.answer_audio_archive from public,anon,authenticated;
grant select on public.answer_audio_archive to authenticated;
grant all on public.answer_audio_archive to service_role;
create policy answer_audio_archive_owner_read on public.answer_audio_archive
  for select to authenticated using ((select auth.uid())=user_id);
commit;
