begin;

update public.chapters
set
  label = '学生時代',
  description = '学校生活、友人、夢中になったこと、進路などを語るテーマ。'
where id = 'ty_theme_youth';

update public.questions
set
  chapter = '学生時代',
  content = case
    when id = 'TY_Q06' then '学生時代、夢中になっていたことは何でしたか？'
    else content
  end,
  meta_json = jsonb_set(
    coalesce(meta_json, '{}'::jsonb),
    '{theme_label}',
    to_jsonb('学生時代'::text),
    true
  )
where chapter_id = 'ty_theme_youth';

update public.question_set_items item
set
  chapter_title_snapshot = '学生時代',
  question_text_snapshot = case
    when item.question_id = 'TY_Q06' then '学生時代、夢中になっていたことは何でしたか？'
    else item.question_text_snapshot
  end,
  meta_json = jsonb_set(
    coalesce(item.meta_json, '{}'::jsonb),
    '{theme_label}',
    to_jsonb('学生時代'::text),
    true
  )
from public.question_sets question_set
where
  question_set.id = item.question_set_id
  and question_set.code = 'tateito_yokoito_standard_v2'
  and item.chapter_id = 'ty_theme_youth';

update public.user_questions
set
  chapter = '学生時代',
  chapter_title_snapshot = '学生時代',
  question_text_snapshot = case
    when question_id = 'TY_Q06' and status <> 'answered'
      then '学生時代、夢中になっていたことは何でしたか？'
    else question_text_snapshot
  end,
  meta_json = jsonb_set(
    coalesce(meta_json, '{}'::jsonb),
    '{theme_label}',
    to_jsonb('学生時代'::text),
    true
  )
where
  question_id in ('TY_Q04', 'TY_Q05', 'TY_Q06')
  or meta_json ->> 'theme_code' = 'ty_theme_youth';

commit;
