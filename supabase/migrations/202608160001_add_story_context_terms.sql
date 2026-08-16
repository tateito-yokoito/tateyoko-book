begin;

-- A project-private vocabulary used to improve proper-noun transcription.
-- AI-discovered spellings remain candidates until a person confirms them.
create table if not exists public.story_context_terms (
  id uuid primary key default gen_random_uuid(),
  book_project_id uuid not null
    references public.book_projects(id)
    on delete cascade,
  term_type text not null default 'other',
  canonical_value text not null,
  reading text,
  aliases text[] not null default '{}'::text[],
  context_label text,
  source text not null default 'user',
  status text not null default 'confirmed',
  confidence numeric not null default 1,
  observation_count integer not null default 1,
  use_count integer not null default 0,
  last_used_at timestamptz,
  created_by_user_id uuid
    references auth.users(id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint story_context_terms_type_check
    check (term_type in ('person', 'place', 'organization', 'school', 'other')),
  constraint story_context_terms_source_check
    check (source in ('user', 'profile', 'relationship', 'transcript_candidate', 'system')),
  constraint story_context_terms_status_check
    check (status in ('candidate', 'confirmed', 'rejected')),
  constraint story_context_terms_confidence_check
    check (confidence >= 0 and confidence <= 1),
  constraint story_context_terms_observation_count_check
    check (observation_count >= 1),
  constraint story_context_terms_use_count_check
    check (use_count >= 0),
  constraint story_context_terms_value_check
    check (length(btrim(canonical_value)) between 1 and 80)
);

comment on table public.story_context_terms is
  '物語ごとの固有名詞辞書。confirmedのみ文字起こしに利用し、AI抽出語はcandidateとして人の確認を待つ。';

create unique index if not exists story_context_terms_project_value_unique
  on public.story_context_terms (book_project_id, lower(btrim(canonical_value)));

create index if not exists story_context_terms_confirmed_lookup
  on public.story_context_terms (book_project_id, status, use_count desc, last_used_at desc);

drop trigger if exists set_story_context_terms_updated_at
  on public.story_context_terms;

create trigger set_story_context_terms_updated_at
before update on public.story_context_terms
for each row
execute function public.set_updated_at();

alter table public.story_context_terms enable row level security;

drop policy if exists "project owners can manage story context terms"
  on public.story_context_terms;

create policy "project owners can manage story context terms"
on public.story_context_terms
for all
using (
  exists (
    select 1
    from public.book_projects bp
    where bp.id = story_context_terms.book_project_id
      and bp.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.book_projects bp
    where bp.id = story_context_terms.book_project_id
      and bp.owner_user_id = auth.uid()
  )
);

grant select, insert, update, delete
  on public.story_context_terms
  to authenticated;

commit;
