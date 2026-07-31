begin;

-- =========================================================
-- 1. プロジェクトが使用する質問セットを固定する
-- =========================================================

alter table public.book_projects
  add column if not exists base_question_set_id uuid
  references public.question_sets(id);

comment on column public.book_projects.base_question_set_id is
  'このプロジェクトが作成時に採用した質問セット。公開後は原則変更しない。';


-- =========================================================
-- 2. 初回体験の進行状態
-- =========================================================

alter table public.book_projects
  add column if not exists onboarding_status text
  not null default 'not_started';

alter table public.book_projects
  add column if not exists current_onboarding_user_question_id uuid
  references public.user_questions(id);

alter table public.book_projects
  add column if not exists onboarding_started_at timestamptz;

alter table public.book_projects
  add column if not exists onboarding_completed_at timestamptz;

alter table public.book_projects
  drop constraint if exists book_projects_onboarding_status_check;

alter table public.book_projects
  add constraint book_projects_onboarding_status_check
  check (
    onboarding_status in (
      'not_started',
      'in_progress',
      'introduction_review',
      'first_story',
      'completed'
    )
  );

comment on column public.book_projects.onboarding_status is
  '正式な初回体験の進行状態。';

comment on column public.book_projects.current_onboarding_user_question_id is
  '初回体験で次に表示するuser_questionsのID。質問数や順番をコードに固定しないために使用する。';


-- =========================================================
-- 3. 「私の歩み」の生成文章
-- =========================================================

create table if not exists public.project_introductions (
  id uuid primary key default gen_random_uuid(),

  book_project_id uuid not null
    references public.book_projects(id)
    on delete cascade,

  person_id uuid
    references public.persons(id)
    on delete set null,

  introduction_type text not null default 'life_outline',

  title text not null default '私の歩み',

  body_text text,

  generation_status text not null default 'not_generated',

  generation_version text,

  is_user_edited boolean not null default false,

  generated_at timestamptz,

  edited_at timestamptz,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  meta_json jsonb not null default '{}'::jsonb,

  constraint project_introductions_type_check
    check (
      introduction_type in (
        'life_outline'
      )
    ),

  constraint project_introductions_status_check
    check (
      generation_status in (
        'not_generated',
        'generating',
        'generated',
        'error'
      )
    ),

  constraint project_introductions_project_type_unique
    unique (book_project_id, introduction_type)
);

comment on table public.project_introductions is
  '本の導入部に掲載する「私の歩み」など、通常の物語とは別に生成される文章。';


-- =========================================================
-- 4. 「私の歩み」の元になった回答とQR音声
-- =========================================================

create table if not exists public.project_introduction_sources (
  id uuid primary key default gen_random_uuid(),

  project_introduction_id uuid not null
    references public.project_introductions(id)
    on delete cascade,

  answer_id uuid not null
    references public.answers(id)
    on delete cascade,

  include_in_text boolean not null default false,

  include_in_audio boolean not null default false,

  text_order integer,

  audio_order integer,

  created_at timestamptz not null default now(),

  meta_json jsonb not null default '{}'::jsonb,

  constraint project_introduction_sources_unique
    unique (project_introduction_id, answer_id)
);

comment on table public.project_introduction_sources is
  '「私の歩み」の生成元となる回答と、人物紹介QRで連続再生する音声の並び。';


-- =========================================================
-- 5. 検索用インデックス
-- =========================================================

create index if not exists idx_book_projects_base_question_set
  on public.book_projects(base_question_set_id);

create index if not exists idx_book_projects_onboarding
  on public.book_projects(owner_user_id, onboarding_status);

create index if not exists idx_project_introductions_project
  on public.project_introductions(book_project_id);

create index if not exists idx_project_introduction_sources_intro
  on public.project_introduction_sources(project_introduction_id);

create index if not exists idx_project_introduction_sources_answer
  on public.project_introduction_sources(answer_id);


-- =========================================================
-- 6. updated_atの自動更新
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_project_introductions_updated_at
  on public.project_introductions;

create trigger set_project_introductions_updated_at
before update on public.project_introductions
for each row
execute function public.set_updated_at();


-- =========================================================
-- 7. RLS
-- =========================================================

alter table public.project_introductions enable row level security;
alter table public.project_introduction_sources enable row level security;

drop policy if exists "project owners can view introductions"
  on public.project_introductions;

create policy "project owners can view introductions"
on public.project_introductions
for select
using (
  exists (
    select 1
    from public.book_projects bp
    where bp.id = project_introductions.book_project_id
      and bp.owner_user_id = auth.uid()
  )
);

drop policy if exists "project owners can insert introductions"
  on public.project_introductions;

create policy "project owners can insert introductions"
on public.project_introductions
for insert
with check (
  exists (
    select 1
    from public.book_projects bp
    where bp.id = project_introductions.book_project_id
      and bp.owner_user_id = auth.uid()
  )
);

drop policy if exists "project owners can update introductions"
  on public.project_introductions;

create policy "project owners can update introductions"
on public.project_introductions
for update
using (
  exists (
    select 1
    from public.book_projects bp
    where bp.id = project_introductions.book_project_id
      and bp.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.book_projects bp
    where bp.id = project_introductions.book_project_id
      and bp.owner_user_id = auth.uid()
  )
);

drop policy if exists "project owners can delete introductions"
  on public.project_introductions;

create policy "project owners can delete introductions"
on public.project_introductions
for delete
using (
  exists (
    select 1
    from public.book_projects bp
    where bp.id = project_introductions.book_project_id
      and bp.owner_user_id = auth.uid()
  )
);


drop policy if exists "project owners can view introduction sources"
  on public.project_introduction_sources;

create policy "project owners can view introduction sources"
on public.project_introduction_sources
for select
using (
  exists (
    select 1
    from public.project_introductions pi
    join public.book_projects bp
      on bp.id = pi.book_project_id
    where pi.id = project_introduction_sources.project_introduction_id
      and bp.owner_user_id = auth.uid()
  )
);

drop policy if exists "project owners can insert introduction sources"
  on public.project_introduction_sources;

create policy "project owners can insert introduction sources"
on public.project_introduction_sources
for insert
with check (
  exists (
    select 1
    from public.project_introductions pi
    join public.book_projects bp
      on bp.id = pi.book_project_id
    where pi.id = project_introduction_sources.project_introduction_id
      and bp.owner_user_id = auth.uid()
  )
);

drop policy if exists "project owners can update introduction sources"
  on public.project_introduction_sources;

create policy "project owners can update introduction sources"
on public.project_introduction_sources
for update
using (
  exists (
    select 1
    from public.project_introductions pi
    join public.book_projects bp
      on bp.id = pi.book_project_id
    where pi.id = project_introduction_sources.project_introduction_id
      and bp.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.project_introductions pi
    join public.book_projects bp
      on bp.id = pi.book_project_id
    where pi.id = project_introduction_sources.project_introduction_id
      and bp.owner_user_id = auth.uid()
  )
);

drop policy if exists "project owners can delete introduction sources"
  on public.project_introduction_sources;

create policy "project owners can delete introduction sources"
on public.project_introduction_sources
for delete
using (
  exists (
    select 1
    from public.project_introductions pi
    join public.book_projects bp
      on bp.id = pi.book_project_id
    where pi.id = project_introduction_sources.project_introduction_id
      and bp.owner_user_id = auth.uid()
  )
);

commit;