-- An older installation used a standalone index, not the constraint names
-- removed by 005. Keep uniqueness per Project and for unassigned legacy rows.
-- This does not change the one-Account/one-subject identity boundary.
begin;
do $$declare definition text;begin
 if to_regclass('public.family_questions_project_question') is null
 or to_regclass('public.family_questions_project_sequence') is null
 or to_regclass('public.family_questions_unassigned_question') is null
 or to_regclass('public.family_questions_unassigned_sequence') is null then
  raise exception 'Project-scoped question guards required';
 end if;
 select pg_get_indexdef(to_regclass('public.user_questions_user_question_unique')) into definition;
 if definition is not null then
  if definition <> 'CREATE UNIQUE INDEX user_questions_user_question_unique ON public.user_questions USING btree (user_id, question_id)'
   or exists(select 1 from pg_constraint where conindid=to_regclass('public.user_questions_user_question_unique')) then
   raise exception 'Unexpected legacy index; inspect before changing';
  end if;
  drop index public.user_questions_user_question_unique;
 end if;
end $$;
commit;
