begin;

create or replace function public.add_custom_story_question(
  input_book_project_id uuid,
  input_question_text text,
  input_chapter_title text,
  input_position text default 'end'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_project public.book_projects%rowtype;
  target_participant_id uuid;
  new_question_id text := 'CUSTOM_' || replace(gen_random_uuid()::text, '-', '');
  new_user_question_id uuid := gen_random_uuid();
  insert_sequence integer;
  catalog_sequence integer;
begin
  select * into target_project
  from public.book_projects bp
  where bp.id = input_book_project_id
    and bp.owner_user_id = auth.uid()
    and bp.status = 'active';

  if target_project.id is null then
    raise exception 'Project owner access is required';
  end if;

  if char_length(btrim(coalesce(input_question_text, ''))) < 4 then
    raise exception 'Question text is too short';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(input_book_project_id::text, 0));
  lock table public.questions in share row exclusive mode;

  select pp.id into target_participant_id
  from public.project_participants pp
  where pp.book_project_id = input_book_project_id
    and pp.role = 'speaker'
  order by pp.created_at asc
  limit 1;

  if input_position = 'next' then
    select coalesce(min(uq.sequence_order), 1) into insert_sequence
    from public.user_questions uq
    where uq.book_project_id = input_book_project_id
      and uq.is_active = true
      and uq.status = 'pending'
      and coalesce(uq.meta_json ->> 'flow_type', '') = 'story';

    -- A two-step shift remains safe even when a project has a unique
    -- sequence constraint: the temporary range cannot collide with live rows.
    update public.user_questions
    set sequence_order = sequence_order + 1000000
    where book_project_id = input_book_project_id
      and sequence_order >= insert_sequence;

    update public.user_questions
    set sequence_order = sequence_order - 999999
    where book_project_id = input_book_project_id
      and sequence_order >= insert_sequence + 1000000;
  else
    select coalesce(max(uq.sequence_order), 0) + 1 into insert_sequence
    from public.user_questions uq
    where uq.book_project_id = input_book_project_id;
  end if;

  -- questions.sequence_order is catalogue-wide, whereas the ordering above
  -- belongs to one user's project. Keep the two sequences independent.
  select coalesce(max(q.sequence_order), 0) + 1 into catalog_sequence
  from public.questions q;

  insert into public.questions (
    id,
    sequence_order,
    chapter,
    content,
    is_active,
    meta_json
  ) values (
    new_question_id,
    catalog_sequence,
    coalesce(nullif(btrim(input_chapter_title), ''), '追加した問い'),
    btrim(input_question_text),
    true,
    jsonb_build_object(
      'product_brand', 'tateito_yokoito',
      'flow_type', 'story',
      'question_role', 'custom_story',
      'created_by_user_id', auth.uid()
    )
  );

  insert into public.user_questions (
    id,
    user_id,
    book_project_id,
    participant_id,
    question_id,
    sequence_order,
    chapter,
    chapter_title_snapshot,
    chapter_subtitle_snapshot,
    question_text_snapshot,
    custom_question_text,
    status,
    is_active,
    meta_json
  ) values (
    new_user_question_id,
    target_project.owner_user_id,
    target_project.id,
    target_participant_id,
    new_question_id,
    insert_sequence,
    coalesce(nullif(btrim(input_chapter_title), ''), '追加した問い'),
    coalesce(nullif(btrim(input_chapter_title), ''), '追加した問い'),
    'ご自身で追加した問い',
    btrim(input_question_text),
    btrim(input_question_text),
    'pending',
    true,
    jsonb_build_object(
      'flow_type', 'story',
      'question_role', 'custom_story',
      'is_custom', true,
      'prompt_style', 'open',
      'reassurance_text', '思い浮かぶところから、お話しください。',
      'min_duration_seconds', 25,
      'min_transcript_chars', 80
    )
  );

  return new_user_question_id;
end;
$$;

revoke all on function public.add_custom_story_question(uuid, text, text, text) from public;
grant execute on function public.add_custom_story_question(uuid, text, text, text) to authenticated;

commit;
