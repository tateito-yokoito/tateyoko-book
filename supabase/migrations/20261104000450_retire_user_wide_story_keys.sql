-- Apply only after the project-aware client is deployed. A purchaser can then
-- own their own story and a separate family-managed gift without conflicts.
drop index if exists public.user_questions_user_question_unique;
alter table public.user_questions
  drop constraint if exists user_questions_user_id_question_id_key;
alter table public.user_questions
  drop constraint if exists user_questions_user_id_sequence_order_key;
alter table public.answers
  drop constraint if exists answers_user_id_sequence_order_key;

-- Legacy rows without a project keep the former uniqueness semantics.
create unique index if not exists user_questions_legacy_user_question_unique
  on public.user_questions(user_id, question_id) where book_project_id is null;
create unique index if not exists user_questions_legacy_user_sequence_unique
  on public.user_questions(user_id, sequence_order) where book_project_id is null;
create unique index if not exists answers_legacy_user_sequence_unique
  on public.answers(user_id, sequence_order) where book_project_id is null;
