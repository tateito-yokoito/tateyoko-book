begin;

-- =========================================================
-- 1. 物語全体の共有方針
-- =========================================================

create table if not exists public.story_sharing_preferences (
  id uuid primary key default gen_random_uuid(),

  book_project_id uuid not null
    references public.book_projects(id)
    on delete cascade,

  owner_person_id uuid
    references public.persons(id)
    on delete set null,

  live_scope text not null default 'private',
  legacy_scope text not null default 'unset',

  initial_setup_completed_at timestamptz,
  legacy_configured_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  meta_json jsonb not null default '{}'::jsonb,

  constraint story_sharing_preferences_project_unique
    unique (book_project_id),

  constraint story_sharing_preferences_live_scope_check
    check (live_scope in ('private', 'selected', 'family')),

  constraint story_sharing_preferences_legacy_scope_check
    check (
      legacy_scope in (
        'unset',
        'inherit',
        'selected',
        'family',
        'private',
        'delete'
      )
    )
);

comment on table public.story_sharing_preferences is
  '物語全体の現在の共有範囲と、完成後に設定する将来の手渡し方針。';


-- =========================================================
-- 2. 「選んだ人」へ共有する場合の受取人
-- =========================================================

create table if not exists public.story_share_recipients (
  id uuid primary key default gen_random_uuid(),

  sharing_preference_id uuid not null
    references public.story_sharing_preferences(id)
    on delete cascade,

  recipient_person_id uuid
    references public.persons(id)
    on delete cascade,

  recipient_user_id uuid
    references auth.users(id)
    on delete cascade,

  recipient_phase text not null default 'live',
  source text not null default 'direct',
  status text not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  meta_json jsonb not null default '{}'::jsonb,

  constraint story_share_recipients_identity_check
    check (
      recipient_person_id is not null or
      recipient_user_id is not null
    ),

  constraint story_share_recipients_phase_check
    check (recipient_phase in ('live', 'legacy', 'both')),

  constraint story_share_recipients_source_check
    check (source in ('direct', 'supporter', 'family')),

  constraint story_share_recipients_status_check
    check (status in ('pending', 'active', 'revoked'))
);

create unique index if not exists story_share_recipients_person_unique
  on public.story_share_recipients (
    sharing_preference_id,
    recipient_person_id,
    recipient_phase
  )
  where recipient_person_id is not null;

create unique index if not exists story_share_recipients_user_unique
  on public.story_share_recipients (
    sharing_preference_id,
    recipient_user_id,
    recipient_phase
  )
  where recipient_user_id is not null;


-- =========================================================
-- 3. プロジェクト単位のサポーター権限
--    共有相手・将来の受取人とは別の権限として管理する。
-- =========================================================

create table if not exists public.project_supporters (
  id uuid primary key default gen_random_uuid(),

  book_project_id uuid not null
    references public.book_projects(id)
    on delete cascade,

  supporter_user_id uuid not null
    references auth.users(id)
    on delete cascade,

  supporter_person_id uuid
    references public.persons(id)
    on delete set null,

  granted_by_user_id uuid
    references auth.users(id)
    on delete set null,

  status text not null default 'active',

  can_operate_recording boolean not null default true,
  can_manage_photos boolean not null default true,
  can_edit_book_text boolean not null default true,
  can_build_book boolean not null default true,

  can_view_raw_audio boolean not null default false,
  can_change_sharing boolean not null default false,
  can_change_legacy boolean not null default false,
  can_delete_story boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  meta_json jsonb not null default '{}'::jsonb,

  constraint project_supporters_project_user_unique
    unique (book_project_id, supporter_user_id),

  constraint project_supporters_status_check
    check (status in ('active', 'revoked'))
);

comment on table public.project_supporters is
  '写真・本文・本づくりなどを本人に代わって操作できる人。共有相手や将来の受取人とは分離する。';


-- =========================================================
-- 4. 既存の招待に、承認後の共有連動を記録する
-- =========================================================

alter table if exists public.project_invites
  add column if not exists auto_share_on_accept boolean
  not null default false;

alter table public.answers
  add column if not exists access_override text
  not null default 'inherit';

alter table public.answers
  drop constraint if exists answers_access_override_check;

alter table public.answers
  add constraint answers_access_override_check
  check (access_override in ('inherit', 'private_forever'));


-- =========================================================
-- 5. 更新日時
-- =========================================================

create or replace function public.set_tateyoko_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists story_sharing_preferences_updated_at
  on public.story_sharing_preferences;

create trigger story_sharing_preferences_updated_at
before update on public.story_sharing_preferences
for each row execute function public.set_tateyoko_updated_at();

drop trigger if exists story_share_recipients_updated_at
  on public.story_share_recipients;

create trigger story_share_recipients_updated_at
before update on public.story_share_recipients
for each row execute function public.set_tateyoko_updated_at();

drop trigger if exists project_supporters_updated_at
  on public.project_supporters;

create trigger project_supporters_updated_at
before update on public.project_supporters
for each row execute function public.set_tateyoko_updated_at();


-- =========================================================
-- 6. RLS
-- =========================================================

alter table public.story_sharing_preferences enable row level security;
alter table public.story_share_recipients enable row level security;
alter table public.project_supporters enable row level security;

drop policy if exists story_sharing_preferences_owner_all
  on public.story_sharing_preferences;

create policy story_sharing_preferences_owner_all
on public.story_sharing_preferences
for all
using (
  exists (
    select 1
    from public.book_projects bp
    where bp.id = story_sharing_preferences.book_project_id
      and bp.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.book_projects bp
    where bp.id = story_sharing_preferences.book_project_id
      and bp.owner_user_id = auth.uid()
  )
);

drop policy if exists story_share_recipients_owner_all
  on public.story_share_recipients;

create policy story_share_recipients_owner_all
on public.story_share_recipients
for all
using (
  exists (
    select 1
    from public.story_sharing_preferences pref
    join public.book_projects bp
      on bp.id = pref.book_project_id
    where pref.id = story_share_recipients.sharing_preference_id
      and bp.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.story_sharing_preferences pref
    join public.book_projects bp
      on bp.id = pref.book_project_id
    where pref.id = story_share_recipients.sharing_preference_id
      and bp.owner_user_id = auth.uid()
  )
);

drop policy if exists project_supporters_owner_all
  on public.project_supporters;

create policy project_supporters_owner_all
on public.project_supporters
for all
using (
  exists (
    select 1
    from public.book_projects bp
    where bp.id = project_supporters.book_project_id
      and bp.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.book_projects bp
    where bp.id = project_supporters.book_project_id
      and bp.owner_user_id = auth.uid()
  )
);

drop policy if exists project_supporters_self_select
  on public.project_supporters;

create policy project_supporters_self_select
on public.project_supporters
for select
using (supporter_user_id = auth.uid());


-- =========================================================
-- 7. サポーター用の限定読み取りAPI
--    answers全列や原音声を直接開放しない。
-- =========================================================

create or replace function public.list_supported_story_projects()
returns table (
  supporter_id uuid,
  book_project_id uuid,
  project_title text,
  subject_person_id uuid,
  subject_name text,
  can_operate_recording boolean,
  can_manage_photos boolean,
  can_edit_book_text boolean,
  can_build_book boolean
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    ps.id,
    bp.id,
    bp.title,
    bp.subject_person_id,
    coalesce(p.preferred_name, p.display_name, '物語の持ち主'),
    ps.can_operate_recording,
    ps.can_manage_photos,
    ps.can_edit_book_text,
    ps.can_build_book
  from public.project_supporters ps
  join public.book_projects bp
    on bp.id = ps.book_project_id
  left join public.persons p
    on p.id = bp.subject_person_id
  where ps.supporter_user_id = auth.uid()
    and ps.status = 'active'
    and bp.status = 'active'
  order by ps.created_at asc;
$$;

create or replace function public.get_supporter_book_stories(
  input_book_project_id uuid
)
returns table (
  answer_id uuid,
  sequence_order integer,
  book_text text,
  created_at timestamptz,
  question_id text,
  question_text text,
  chapter_title text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1
    from public.project_supporters ps
    where ps.book_project_id = input_book_project_id
      and ps.supporter_user_id = auth.uid()
      and ps.status = 'active'
      and ps.can_build_book = true
  ) then
    raise exception 'Supporter access is not allowed';
  end if;

  return query
  select
    a.id,
    a.sequence_order,
    coalesce(
      nullif(a.transcript_edited, ''),
      case
        when a.selected_style = 'essay' then nullif(a.transcript_essay, '')
        else nullif(a.transcript_readable, '')
      end,
      nullif(a.transcript_readable, ''),
      nullif(a.transcript_clean, ''),
      ''
    ) as book_text,
    a.created_at,
    uq.question_id::text,
    coalesce(uq.custom_question_text, uq.question_text_snapshot, '') as question_text,
    coalesce(uq.chapter_title_snapshot, uq.chapter, 'その他') as chapter_title
  from public.answers a
  left join public.user_questions uq
    on uq.id = a.user_question_id
  where a.book_project_id = input_book_project_id
    and coalesce(a.access_override, 'inherit') <> 'private_forever'
  order by a.sequence_order asc;
end;
$$;

create or replace function public.get_supporter_book_photos(
  input_book_project_id uuid
)
returns table (
  media_id uuid,
  answer_id uuid,
  storage_path text,
  meta_json jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1
    from public.project_supporters ps
    where ps.book_project_id = input_book_project_id
      and ps.supporter_user_id = auth.uid()
      and ps.status = 'active'
      and ps.can_build_book = true
  ) then
    raise exception 'Supporter access is not allowed';
  end if;

  return query
  select
    ma.id,
    ma.answer_id,
    ma.storage_path,
    ma.meta_json,
    ma.created_at
  from public.media_assets ma
  join public.answers a
    on a.id = ma.answer_id
  where a.book_project_id = input_book_project_id
    and coalesce(a.access_override, 'inherit') <> 'private_forever'
    and ma.asset_type = 'photo'
  order by ma.created_at asc;
end;
$$;

revoke all on function public.list_supported_story_projects() from public;
revoke all on function public.get_supporter_book_stories(uuid) from public;
revoke all on function public.get_supporter_book_photos(uuid) from public;

grant execute on function public.list_supported_story_projects() to authenticated;
grant execute on function public.get_supporter_book_stories(uuid) to authenticated;
grant execute on function public.get_supporter_book_photos(uuid) to authenticated;

drop policy if exists photos_supporter_read on storage.objects;

create policy photos_supporter_read
on storage.objects
for select
using (
  bucket_id = 'photos'
  and exists (
    select 1
    from public.media_assets ma
    join public.answers a
      on a.id = ma.answer_id
    join public.project_supporters ps
      on ps.book_project_id = a.book_project_id
    where ma.storage_path = storage.objects.name
      and ma.asset_type = 'photo'
      and coalesce(a.access_override, 'inherit') <> 'private_forever'
      and ps.supporter_user_id = auth.uid()
      and ps.status = 'active'
      and ps.can_build_book = true
  )
);

commit;
