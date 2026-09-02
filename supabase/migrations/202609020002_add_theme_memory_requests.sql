begin;

create table if not exists public.theme_memory_requests (
  id uuid primary key default gen_random_uuid(),
  book_project_id uuid not null
    references public.book_projects(id)
    on delete cascade,
  requester_user_id uuid not null
    references auth.users(id)
    on delete cascade,
  theme_code text not null default 'ty_theme_childhood',
  subject_name text not null,
  recipient_name text not null,
  recipient_email text not null,
  relationship_label text not null,
  selected_questions jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  email_delivery_status text not null default 'not_sent',
  email_attempted_at timestamptz,
  email_sent_at timestamptz,
  email_message_id text,
  email_error text,
  opened_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint theme_memory_requests_theme_check
    check (theme_code = 'ty_theme_childhood'),
  constraint theme_memory_requests_relationship_check
    check (relationship_label in ('mother', 'father', 'grandmother', 'grandfather', 'sibling', 'relative', 'other')),
  constraint theme_memory_requests_status_check
    check (status in ('pending', 'opened', 'submitted', 'approved', 'cancelled', 'expired')),
  constraint theme_memory_requests_email_status_check
    check (email_delivery_status in ('not_sent', 'sending', 'sent', 'failed')),
  constraint theme_memory_requests_questions_check
    check (
      jsonb_typeof(selected_questions) = 'array'
      and jsonb_array_length(selected_questions) between 1 and 3
    )
);

create table if not exists public.theme_memory_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique
    references public.theme_memory_requests(id)
    on delete cascade,
  responder_name text not null,
  answers jsonb not null default '[]'::jsonb,
  extra_response jsonb not null default '{}'::jsonb,
  photo_paths jsonb not null default '[]'::jsonb,
  status text not null default 'submitted',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint theme_memory_responses_answers_check
    check (jsonb_typeof(answers) = 'array'),
  constraint theme_memory_responses_extra_check
    check (jsonb_typeof(extra_response) = 'object'),
  constraint theme_memory_responses_photos_check
    check (jsonb_typeof(photo_paths) = 'array'),
  constraint theme_memory_responses_status_check
    check (status in ('submitted', 'approved', 'rejected'))
);

create index if not exists theme_memory_requests_project_idx
  on public.theme_memory_requests(book_project_id, created_at desc);
create index if not exists theme_memory_requests_owner_idx
  on public.theme_memory_requests(requester_user_id, created_at desc);
create index if not exists theme_memory_requests_status_idx
  on public.theme_memory_requests(status, updated_at desc);

drop trigger if exists theme_memory_requests_updated_at on public.theme_memory_requests;
create trigger theme_memory_requests_updated_at
before update on public.theme_memory_requests
for each row execute function public.set_updated_at();

drop trigger if exists theme_memory_responses_updated_at on public.theme_memory_responses;
create trigger theme_memory_responses_updated_at
before update on public.theme_memory_responses
for each row execute function public.set_updated_at();

alter table public.theme_memory_requests enable row level security;
alter table public.theme_memory_responses enable row level security;

revoke all on table public.theme_memory_requests from public, anon, authenticated;
revoke all on table public.theme_memory_responses from public, anon, authenticated;
grant all on table public.theme_memory_requests to service_role;
grant all on table public.theme_memory_responses to service_role;
grant select, update on table public.theme_memory_requests to authenticated;
grant select, update on table public.theme_memory_responses to authenticated;

drop policy if exists theme_memory_requests_owner_select on public.theme_memory_requests;
create policy theme_memory_requests_owner_select
on public.theme_memory_requests for select to authenticated
using (
  requester_user_id = auth.uid()
  and exists (
    select 1 from public.book_projects project
    where project.id = book_project_id
      and project.owner_user_id = auth.uid()
  )
);

drop policy if exists theme_memory_requests_owner_update on public.theme_memory_requests;
create policy theme_memory_requests_owner_update
on public.theme_memory_requests for update to authenticated
using (requester_user_id = auth.uid())
with check (requester_user_id = auth.uid());

drop policy if exists theme_memory_responses_owner_select on public.theme_memory_responses;
create policy theme_memory_responses_owner_select
on public.theme_memory_responses for select to authenticated
using (
  exists (
    select 1
    from public.theme_memory_requests request
    where request.id = request_id
      and request.requester_user_id = auth.uid()
  )
);

drop policy if exists theme_memory_responses_owner_update on public.theme_memory_responses;
create policy theme_memory_responses_owner_update
on public.theme_memory_responses for update to authenticated
using (
  exists (
    select 1
    from public.theme_memory_requests request
    where request.id = request_id
      and request.requester_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.theme_memory_requests request
    where request.id = request_id
      and request.requester_user_id = auth.uid()
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'memory-contributions',
  'memory-contributions',
  false,
  26214400,
  array[
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

comment on table public.theme_memory_requests is
  'テーマ完了後に、家族へ特定の記憶だけを尋ねる専用リクエスト。一般の支援者権限とは分離する。';
comment on table public.theme_memory_responses is
  '家族から届いたテーマ記憶の回答。本人の承認後に物語へ採用する。';

commit;
