begin;

-- =========================================================
-- 1. 「はじまりの章」を途中の画面から正確に再開する
-- =========================================================

alter table public.book_projects
  add column if not exists onboarding_ritual_step text;

alter table public.book_projects
  add column if not exists theme_experience_state jsonb
  not null default '{}'::jsonb;

comment on column public.book_projects.onboarding_ritual_step is
  'はじまりの章の現在位置。説明、最初の会話、歩き方、各設定、門出の声、完了を一続きで再開する。';

comment on column public.book_projects.theme_experience_state is
  'テーマの導入・完了演出など、テーマ単位の体験状態。';

update public.book_projects
set onboarding_ritual_step = case
  when onboarding_status = 'completed' then 'completed'
  when onboarding_status = 'life_outline_completed' then
    case
      when theme_guide_completed_at is null then 'conversation_complete'
      when onboarding_preferences_completed_at is null then 'preferences'
      when starting_motivation_completed_at is null then 'notification'
      else 'chapter_complete'
    end
  when onboarding_status = 'in_progress' and life_outline_completed_at is not null
    then 'conversation_complete'
  when onboarding_overview_completed_at is not null then 'starting_conversation'
  else 'service_intro'
end
where onboarding_ritual_step is null;


-- =========================================================
-- 2. 無料体験を「はじめの会話」と分ける
--
-- 専用質問は質問セットの末尾に置く。アプリはtrial_experienceを
-- 明示的に選ぶため、本編・はじまりの章の順番には影響しない。
-- 既存プロジェクトは従来の体験を維持し、新規プロジェクトから採用する。
-- =========================================================

insert into public.questions (
  id,
  sequence_order,
  chapter,
  content,
  is_active,
  meta_json,
  chapter_id
)
values
  (
    'TY_TRIAL01',
    9001,
    '体験の一頁',
    '最近、ふと昔のことを思い出した瞬間はありましたか？',
    true,
    '{
      "product_brand":"tateito_yokoito",
      "flow_type":"trial",
      "flow_phase":"trial",
      "question_role":"trial_experience",
      "onboarding_group":"trial_experience",
      "onboarding_order":1,
      "progress_label":"1 / 3",
      "include_in_profile_text":false,
      "include_in_profile_audio":false,
      "include_in_story_list":true,
      "include_in_book_body":false
    }'::jsonb,
    null
  ),
  (
    'TY_TRIAL02',
    9002,
    '体験の一頁',
    '今も心に残っている、誰かの言葉はありますか？',
    true,
    '{
      "product_brand":"tateito_yokoito",
      "flow_type":"trial",
      "flow_phase":"trial",
      "question_role":"trial_experience",
      "onboarding_group":"trial_experience",
      "onboarding_order":2,
      "progress_label":"2 / 3",
      "include_in_profile_text":false,
      "include_in_profile_audio":false,
      "include_in_story_list":true,
      "include_in_book_body":false
    }'::jsonb,
    null
  ),
  (
    'TY_TRIAL03',
    9003,
    '体験の一頁',
    'これからも大切にしていきたいことは、何ですか？',
    true,
    '{
      "product_brand":"tateito_yokoito",
      "flow_type":"trial",
      "flow_phase":"trial",
      "question_role":"trial_experience",
      "onboarding_group":"trial_experience",
      "onboarding_order":3,
      "progress_label":"3 / 3",
      "include_in_profile_text":false,
      "include_in_profile_audio":false,
      "include_in_story_list":true,
      "include_in_book_body":false
    }'::jsonb,
    null
  )
on conflict (id) do update set
  sequence_order = excluded.sequence_order,
  chapter = excluded.chapter,
  content = excluded.content,
  is_active = excluded.is_active,
  meta_json = excluded.meta_json,
  chapter_id = excluded.chapter_id;

with trial_items as (
  select *
  from (values
    (
      'TY_TRIAL01'::text,
      9001,
      '最近の出来事から思い出したことでも、写真を見て浮かんだことでもかまいません。'::text,
      '一つの場面を思い浮かべてみてください。'::text,
      '1 / 3'::text
    ),
    (
      'TY_TRIAL02'::text,
      9002,
      '家族や友人、先生、仕事仲間など、どなたの言葉でもかまいません。'::text,
      '言葉を正確に思い出せなくても、そのとき感じたことで大丈夫です。'::text,
      '2 / 3'::text
    ),
    (
      'TY_TRIAL03'::text,
      9003,
      '日々の習慣、人とのつながり、考え方など、心に浮かぶものからお話しください。'::text,
      '大きなことでなくてもかまいません。'::text,
      '3 / 3'::text
    )
  ) as rows(question_id, sequence_order, prompt_hint, reassurance_text, progress_label)
)
insert into public.question_set_items (
  question_set_id,
  question_id,
  sequence_order,
  chapter_id,
  chapter_title_snapshot,
  chapter_subtitle_snapshot,
  question_text_snapshot,
  is_required,
  is_active,
  meta_json,
  prompt_style,
  prompt_hint_snapshot,
  reassurance_text_snapshot,
  followup_hint_snapshot,
  min_duration_seconds,
  min_transcript_chars
)
select
  question_set.id,
  trial.question_id,
  trial.sequence_order,
  null,
  '体験の一頁',
  trial.progress_label,
  question.content,
  true,
  true,
  question.meta_json,
  'gentle',
  trial.prompt_hint,
  trial.reassurance_text,
  null,
  5,
  5
from public.question_sets question_set
cross join trial_items trial
join public.questions question on question.id = trial.question_id
where question_set.code = 'tateito_yokoito_standard_v2'
on conflict (question_set_id, question_id) do update set
  sequence_order = excluded.sequence_order,
  chapter_id = excluded.chapter_id,
  chapter_title_snapshot = excluded.chapter_title_snapshot,
  chapter_subtitle_snapshot = excluded.chapter_subtitle_snapshot,
  question_text_snapshot = excluded.question_text_snapshot,
  is_required = excluded.is_required,
  is_active = excluded.is_active,
  meta_json = excluded.meta_json,
  prompt_style = excluded.prompt_style,
  prompt_hint_snapshot = excluded.prompt_hint_snapshot,
  reassurance_text_snapshot = excluded.reassurance_text_snapshot,
  followup_hint_snapshot = excluded.followup_hint_snapshot,
  min_duration_seconds = excluded.min_duration_seconds,
  min_transcript_chars = excluded.min_transcript_chars;

update public.question_sets
set
  description = '無料体験3問、はじまりの章4問、本編9テーマ23問からなる正式質問セット。',
  meta_json =
    (coalesce(meta_json, '{}'::jsonb)
      - 'question_count'
      - 'trial_question_count')
    || jsonb_build_object(
      'question_count', 30,
      'trial_question_count', 3
    )
where code = 'tateito_yokoito_standard_v2';

commit;
