-- Provisional person-based prompts. The map can be revised after question
-- wording is approved; existing linked answers are never silently remapped.
begin;

insert into public.person_story_question_map
  (story_question_key,book_question_id,enabled)
values
  ('TY_TRIAL_CHILDHOOD02','TY_Q15',true),
  ('TY_TRIAL_CHILDHOOD03','TY_Q02',true)
on conflict (story_question_key) do update
set book_question_id=excluded.book_question_id,
    enabled=excluded.enabled,
    updated_at=now()
where public.person_story_question_map.book_question_id
  is distinct from excluded.book_question_id;

commit;
