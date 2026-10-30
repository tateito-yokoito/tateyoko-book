begin;

-- Keep existing email invitations and their responses readable while allowing
-- a link-only invitation for any of the nine story themes.
alter table public.theme_memory_requests
  alter column recipient_email drop not null;
alter table public.theme_memory_requests
  drop constraint if exists theme_memory_requests_theme_check;
alter table public.theme_memory_requests
  drop constraint if exists theme_memory_requests_relationship_check;
alter table public.theme_memory_requests
  add column if not exists link_token_hash text,
  add column if not exists requester_name_snapshot text,
  add column if not exists share_message text,
  add column if not exists revoked_at timestamptz;
alter table public.theme_memory_requests
  add constraint theme_memory_requests_theme_check check (theme_code in (
    'ty_theme_childhood','ty_theme_youth','ty_theme_likes',
    'ty_theme_living','ty_theme_work','ty_theme_connections',
    'ty_theme_family','ty_theme_turning_points','ty_theme_now_future'
  ));
alter table public.theme_memory_requests
  add constraint theme_memory_requests_relationship_check
  check (length(trim(relationship_label)) between 1 and 80);

-- New contributions are separate from the owner's answers. The older
-- theme_memory_responses rows remain untouched for existing invitations.
create table public.theme_memory_answer_records (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.theme_memory_requests(id) on delete cascade,
  question_key text not null,
  source_question_id uuid,
  prompt_snapshot text not null,
  current_text text not null default '',
  text_versions jsonb not null default '[]'::jsonb,
  audio_records jsonb not null default '[]'::jsonb,
  photo_paths jsonb not null default '[]'::jsonb,
  responder_name text not null,
  consent_at timestamptz not null,
  consent_version text not null,
  publication_status text not null default 'unreviewed'
    check (publication_status in ('unreviewed','included','excluded')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, question_key),
  check (jsonb_typeof(text_versions) = 'array'),
  check (jsonb_typeof(audio_records) = 'array'),
  check (jsonb_typeof(photo_paths) = 'array')
);
create index theme_memory_answer_records_request_idx
  on public.theme_memory_answer_records(request_id, created_at);
create trigger theme_memory_answer_records_updated_at
  before update on public.theme_memory_answer_records
  for each row execute function public.set_updated_at();

create table public.theme_memory_answer_drafts (
  request_id uuid not null references public.theme_memory_requests(id) on delete cascade,
  question_key text not null,
  draft_text text not null default '',
  audio_records jsonb not null default '[]'::jsonb,
  revision bigint not null default 0,
  discarded_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (request_id, question_key),
  check (jsonb_typeof(audio_records) = 'array')
);

alter table public.theme_memory_answer_records enable row level security;
alter table public.theme_memory_answer_drafts enable row level security;
revoke all on public.theme_memory_answer_records, public.theme_memory_answer_drafts
  from public, anon, authenticated;
grant all on public.theme_memory_answer_records, public.theme_memory_answer_drafts
  to service_role;
grant select on public.theme_memory_answer_records to authenticated;
create policy theme_memory_answer_records_owner_read
  on public.theme_memory_answer_records for select to authenticated
  using (exists (
    select 1 from public.theme_memory_requests request
    where request.id = request_id and request.requester_user_id = auth.uid()
  ));

comment on table public.theme_memory_answer_records is
  '依頼先の質問別回答。本人の回答とは独立し、掲載状態を質問単位で管理する。';
comment on table public.theme_memory_answer_drafts is
  '依頼先の端末間下書き。削除は墓標で記録し、古い下書きの再出現を防ぐ。';

commit;
