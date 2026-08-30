begin;

-- 最初の問いは、読む量を最小限にする。
update public.questions
set content = 'お名前をフルネームで教えてください。'
where id = 'TY_ONB01';

update public.question_set_items item
set
  question_text_snapshot = 'お名前をフルネームで教えてください。',
  prompt_hint_snapshot = null,
  reassurance_text_snapshot = 'ゆっくりで大丈夫です。'
from public.question_sets question_set
where question_set.id = item.question_set_id
  and question_set.code = 'tateito_yokoito_standard_v2'
  and item.question_id = 'TY_ONB01';

-- まだ回答していない既存の物語にも、新しい短い表示を反映する。
update public.user_questions
set
  question_text_snapshot = 'お名前をフルネームで教えてください。',
  meta_json = (
    coalesce(meta_json, '{}'::jsonb)
      - 'prompt_hint'
      - 'reassurance_text'
  ) || jsonb_build_object(
    'reassurance_text', 'ゆっくりで大丈夫です。'
  )
where question_id = 'TY_ONB01'
  and answered_at is null
  and status <> 'answered';

commit;
