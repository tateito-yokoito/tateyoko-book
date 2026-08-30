begin;

update public.questions
set content = '最近は、どんなふうに一日を過ごすことが多いですか？'
where id = 'TY_ONB02';

update public.question_set_items item
set question_text_snapshot = '最近は、どんなふうに一日を過ごすことが多いですか？'
from public.question_sets question_set
where question_set.id = item.question_set_id
  and question_set.code = 'tateito_yokoito_standard_v2'
  and item.question_id = 'TY_ONB02';

update public.user_questions
set question_text_snapshot = '最近は、どんなふうに一日を過ごすことが多いですか？'
where question_id = 'TY_ONB02'
  and answered_at is null
  and status <> 'answered';

commit;
