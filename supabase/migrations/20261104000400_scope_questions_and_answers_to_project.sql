-- Add project-scoped keys before the client release. The old user-wide keys
-- remain for the old deployed client until the new client is live.
create unique index if not exists user_questions_project_question_unique
  on public.user_questions(book_project_id, question_id);
create unique index if not exists user_questions_project_sequence_unique
  on public.user_questions(book_project_id, sequence_order);
create unique index if not exists answers_project_sequence_unique
  on public.answers(book_project_id, sequence_order);
