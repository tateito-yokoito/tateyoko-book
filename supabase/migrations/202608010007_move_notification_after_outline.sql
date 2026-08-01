begin;

alter table public.book_projects
  add column if not exists onboarding_overview_completed_at timestamptz;

comment on column public.book_projects.onboarding_overview_completed_at is
  '初回の進め方説明を確認した日時。通知設定の有無とは独立して管理する。';

-- すでに初回体験を開始している利用者は、説明画面を確認済みとして扱う。
-- これにより既存の途中データを先頭へ戻さない。
update public.book_projects
set onboarding_overview_completed_at = coalesce(
  onboarding_overview_completed_at,
  onboarding_started_at,
  created_at,
  now()
)
where onboarding_status <> 'not_started';

commit;
