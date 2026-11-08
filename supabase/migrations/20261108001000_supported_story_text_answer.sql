-- A purchaser managing a family story, or an invited co-manager, can answer
-- an unanswered question in that project without touching another project.
create or replace function public.save_supported_story_text(
  input_book_project_id uuid, input_user_question_id uuid, input_text text
) returns uuid language plpgsql security definer
set search_path = public, auth as $$
declare
  actor uuid := auth.uid();
  target_project public.book_projects%rowtype;
  target_question public.user_questions%rowtype;
  existing_answer public.answers%rowtype;
  saved_answer_id uuid;
begin
  if actor is null or input_book_project_id is null or input_user_question_id is null
    or length(btrim(coalesce(input_text, ''))) = 0 or length(input_text) > 50000 then
    raise exception 'Invalid supported story text' using errcode = '22023';
  end if;

  select * into target_project from public.book_projects
    where id = input_book_project_id and status = 'active';
  if target_project.id is null
    or not public.experience_data_allowed(input_book_project_id, true)
    or not exists (
      select 1 from public.project_supporters ps
      where ps.book_project_id = input_book_project_id
        and ps.supporter_user_id = actor and ps.status = 'active'
        and ps.can_edit_book_text = true
        and ps.meta_json ->> 'support_role' in ('facilitator', 'co_manager')
    ) then
    raise exception 'Supported story access is not allowed' using errcode = '42501';
  end if;

  select * into target_question from public.user_questions
    where id = input_user_question_id and book_project_id = input_book_project_id
      and is_active = true for update;
  if target_question.id is null then
    raise exception 'Question was not found' using errcode = '22023';
  end if;

  select * into existing_answer from public.answers
    where book_project_id = input_book_project_id
      and user_question_id = input_user_question_id
    order by created_at desc limit 1;
  if existing_answer.id is not null then
    if existing_answer.transcript_edited = btrim(input_text) then
      return existing_answer.id;
    end if;
    raise exception 'This question has already been answered' using errcode = '23505';
  end if;

  insert into public.answers (
    user_id, book_project_id, speaker_person_id, subject_person_id,
    user_question_id, question_id, sequence_order, transcript_raw,
    transcript_clean, transcript_readable, transcript_edited, selected_style,
    meta_json
  ) values (
    target_project.owner_user_id, input_book_project_id,
    target_project.subject_person_id, target_project.subject_person_id,
    target_question.id, target_question.question_id, target_question.sequence_order,
    btrim(input_text), btrim(input_text), btrim(input_text), btrim(input_text),
    'readable',
    jsonb_build_object('recorded_with_supporter', true, 'supporter_user_id', actor)
  ) returning id into saved_answer_id;

  update public.user_questions set status = 'answered',
    answered_at = coalesce(answered_at, now()) where id = target_question.id;
  return saved_answer_id;
end;
$$;

revoke all on function public.save_supported_story_text(uuid, uuid, text) from public, anon;
grant execute on function public.save_supported_story_text(uuid, uuid, text) to authenticated;
