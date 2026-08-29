begin;

-- A publication is the immutable source behind one printed edition's QR code.
-- Editable project data is deliberately not exposed through the public URL.
create table if not exists public.voice_publications (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  book_project_id uuid not null
    references public.book_projects(id)
    on delete restrict,
  status text not null default 'draft',
  book_title text not null default '',
  book_subtitle text not null default '',
  subject_name text not null default '',
  snapshot_schema_version integer not null default 1,
  snapshot_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  disabled_at timestamptz,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_publications_public_id_check
    check (public_id ~ '^[a-f0-9]{48}$'),
  constraint voice_publications_status_check
    check (status in ('draft', 'published', 'disabled'))
);

create table if not exists public.voice_publication_items (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null
    references public.voice_publications(id)
    on delete cascade,
  item_order integer not null,
  source_answer_id uuid
    references public.answers(id)
    on delete set null,
  chapter_title text not null default '',
  question_text text not null default '',
  transcript_text text not null default '',
  audio_assets jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint voice_publication_items_order_check check (item_order > 0),
  constraint voice_publication_items_publication_order_unique
    unique (publication_id, item_order),
  constraint voice_publication_items_audio_assets_check
    check (jsonb_typeof(audio_assets) = 'array')
);

create index if not exists voice_publications_project_created_idx
  on public.voice_publications(book_project_id, created_at desc);

create index if not exists voice_publications_public_status_idx
  on public.voice_publications(public_id, status);

create index if not exists voice_publication_items_publication_order_idx
  on public.voice_publication_items(publication_id, item_order);

drop trigger if exists voice_publications_updated_at on public.voice_publications;
create trigger voice_publications_updated_at
before update on public.voice_publications
for each row execute function public.set_tateyoko_updated_at();

alter table public.voice_publications enable row level security;
alter table public.voice_publication_items enable row level security;

drop policy if exists voice_publications_manager_read on public.voice_publications;
create policy voice_publications_manager_read
on public.voice_publications for select to authenticated
using (public.can_manage_book_cover(book_project_id));

drop policy if exists voice_publication_items_manager_read on public.voice_publication_items;
create policy voice_publication_items_manager_read
on public.voice_publication_items for select to authenticated
using (
  exists (
    select 1
    from public.voice_publications publication
    where publication.id = voice_publication_items.publication_id
      and public.can_manage_book_cover(publication.book_project_id)
  )
);

-- Publication writes and anonymous playback are handled only by service-role
-- Edge Functions. No anonymous table or storage access is granted.
revoke all on public.voice_publications from anon, authenticated;
revoke all on public.voice_publication_items from anon, authenticated;
grant select on public.voice_publications to authenticated;
grant select on public.voice_publication_items to authenticated;

comment on table public.voice_publications is
  '印刷済みQRが参照する、冊子発行時点で固定された公開版。';

comment on column public.voice_publications.public_id is
  'QRに含める推測困難な不変ID。内部IDや利用者情報は含めない。';

comment on table public.voice_publication_items is
  '公開版に固定された質問・本文・複製済み音声の順序付きスナップショット。';

commit;
