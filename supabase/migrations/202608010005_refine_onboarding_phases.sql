begin;

-- =========================================================
-- 1. 「人生の輪郭」の完了を、毎週の問いとは別の節目として持つ
-- =========================================================

alter table public.book_projects
  add column if not exists life_outline_completed_at timestamptz;

alter table public.book_projects
  drop constraint if exists book_projects_onboarding_status_check;

-- 旧仕様では「人生の輪郭」の次にQ01を初回体験として扱っていた。
-- 制約を外してから、既存ユーザーを新しい節目画面へ移す。
update public.book_projects
set
  onboarding_status = 'life_outline_completed',
  life_outline_completed_at = coalesce(life_outline_completed_at, now())
where onboarding_status = 'first_story';

alter table public.book_projects
  add constraint book_projects_onboarding_status_check
  check (
    onboarding_status in (
      'not_started',
      'in_progress',
      'introduction_review',
      'life_outline_completed',
      'completed'
    )
  );

comment on column public.book_projects.life_outline_completed_at is
  '3つの語りから生成した「人生の輪郭」を本人が確認し、最初の節目を完了した日時。';


-- =========================================================
-- 2. 表示名を「声の入口」から「物語の入口」へ変更する
-- =========================================================

update public.questions
set chapter = '物語の入口'
where id = 'TY_ONB01';

update public.question_set_items
set chapter_title_snapshot = '物語の入口'
where question_id = 'TY_ONB01';

update public.user_questions
set chapter_title_snapshot = '物語の入口'
where question_id = 'TY_ONB01';


-- =========================================================
-- 3. Q01を初回体験から外し、毎週の23問の最初の問いとして整理する
-- =========================================================

update public.questions
set meta_json =
  (coalesce(meta_json, '{}'::jsonb)
    - 'onboarding_group'
    - 'completes_onboarding'
    - 'flow_phase')
  || '{"flow_type":"story","question_role":"first_weekly_question"}'::jsonb
where id = 'TY_Q01';

update public.question_set_items
set meta_json =
  (coalesce(meta_json, '{}'::jsonb)
    - 'onboarding_group'
    - 'completes_onboarding'
    - 'flow_phase')
  || '{"flow_type":"story","question_role":"first_weekly_question"}'::jsonb
where question_id = 'TY_Q01';

update public.user_questions
set meta_json =
  (coalesce(meta_json, '{}'::jsonb)
    - 'onboarding_group'
    - 'completes_onboarding'
    - 'flow_phase')
  || '{"flow_type":"story","question_role":"first_weekly_question"}'::jsonb
where question_id = 'TY_Q01';

commit;
