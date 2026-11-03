-- A guest trial is not a Supabase anonymous-auth user. It has no access to
-- existing authenticated RPCs, projects, media, checkout or family records.
-- Only the dedicated Edge handler may use the service role to read/write it.
create table public.guest_trial_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  origin_kind text not null check (origin_kind in ('self', 'gift')),
  gift_link_id uuid references public.gift_three_question_links(id),
  creator_ip_hash text not null check (creator_ip_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'active'
    check (status in ('active', 'completed', 'claimed', 'expired')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 days'),
  claimed_user_id uuid references auth.users(id),
  claimed_project_id uuid references public.book_projects(id),
  check ((claimed_user_id is null) = (claimed_project_id is null)),
  check (origin_kind = 'gift' or gift_link_id is null)
);
create index guest_trial_sessions_ip_rate_idx
  on public.guest_trial_sessions(creator_ip_hash, created_at desc);
create index guest_trial_sessions_expiry_idx
  on public.guest_trial_sessions(expires_at) where status in ('active', 'completed');
alter table public.guest_trial_sessions enable row level security;
revoke all on public.guest_trial_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.guest_trial_sessions to service_role;

create table public.guest_trial_answers (
  session_id uuid not null references public.guest_trial_sessions(id) on delete cascade,
  question_id text not null check (question_id in (
    'TY_TRIAL_CHILDHOOD01', 'TY_TRIAL_CHILDHOOD02', 'TY_TRIAL_CHILDHOOD03'
  )),
  audio_path text unique,
  audio_mime text check (audio_mime in (
    'audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/mpeg'
  )),
  audio_bytes integer check (audio_bytes between 1 and 12582912),
  transcript text not null default '' check (length(transcript) <= 100000),
  transcription_state text not null default 'pending'
    check (transcription_state in ('pending', 'complete', 'failed')),
  transcription_attempts integer not null default 0
    check (transcription_attempts between 0 and 3),
  saved_at timestamptz not null default now(),
  primary key (session_id, question_id),
  check ((audio_path is null and audio_mime is null and audio_bytes is null
    and transcription_state = 'complete' and length(trim(transcript)) > 0)
    or (audio_path is not null and audio_mime is not null and audio_bytes is not null
      and audio_path like 'guest-trial/' || session_id::text || '/%'))
);
alter table public.guest_trial_answers enable row level security;
revoke all on public.guest_trial_answers from public, anon, authenticated;
grant select, insert, update, delete on public.guest_trial_answers to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('guest-trial-audio', 'guest-trial-audio', false, 12582912,
  array['audio/mp4','audio/aac','audio/webm','audio/ogg','audio/mpeg'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- Restrictive policies prevent other broad storage policies from exposing
-- guest audio to a signed-in account or an anonymous API key.
create policy guest_trial_audio_no_client_select on storage.objects as restrictive
  for select to anon, authenticated using (bucket_id <> 'guest-trial-audio');
create policy guest_trial_audio_no_client_insert on storage.objects as restrictive
  for insert to anon, authenticated with check (bucket_id <> 'guest-trial-audio');
create policy guest_trial_audio_no_client_update on storage.objects as restrictive
  for update to anon, authenticated using (bucket_id <> 'guest-trial-audio')
  with check (bucket_id <> 'guest-trial-audio');
create policy guest_trial_audio_no_client_delete on storage.objects as restrictive
  for delete to anon, authenticated using (bucket_id <> 'guest-trial-audio');
