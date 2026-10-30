begin;

-- Resolve a conflict between an unsaved draft and a newer confirmed answer.
-- Both texts remain visible to the caller until it explicitly chooses one.
create or replace function public.rebase_conflicted_answer_text_draft(
  input_project_id uuid, input_sequence_order integer,
  input_generation bigint, input_edit_number bigint,
  input_device_id uuid, input_answer_revision bigint,
  input_choice text
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
  q public.user_questions%rowtype;
  p public.book_projects%rowtype;
  d public.answer_text_drafts%rowtype;
  a public.answers%rowtype;
  chosen_body text;
  current_body text;
begin
  if uid is null or input_device_id is null or input_choice not in ('local','remote') then
    raise exception 'Invalid draft resolution';
  end if;
  select * into q from public.user_questions where user_id = uid
    and book_project_id = input_project_id and sequence_order = input_sequence_order
    and is_active is true;
  select * into p from public.book_projects where id = input_project_id;
  if q.id is null or p.id is null or p.status <> 'active'
    or (public.unpaid_trial_project(input_project_id)
      and not public.unpaid_trial_question(input_project_id,q.id)) then
    raise exception 'Question unavailable';
  end if;
  select * into d from public.answer_text_drafts where user_id = uid
    and book_project_id = input_project_id and sequence_order = input_sequence_order for update;
  if d.user_id is null or d.state <> 'active' or d.device_id <> input_device_id
    or d.generation <> input_generation or d.edit_number <> input_edit_number then
    return jsonb_build_object('status','draft_conflict');
  end if;
  select * into a from public.answers where user_id = uid
    and sequence_order = input_sequence_order for update;
  if a.id is not null and a.book_project_id is distinct from input_project_id then
    raise exception 'Answer unavailable';
  end if;
  if coalesce(a.text_revision,0) <> input_answer_revision then
    return jsonb_build_object('status','answer_conflict',
      'answer_revision',coalesce(a.text_revision,0));
  end if;
  current_body := coalesce(a.transcript_edited,a.transcript_readable,
    a.transcript_clean,a.transcript_raw,a.snippet,'');
  chosen_body := case when input_choice = 'local' then d.body else current_body end;
  if chosen_body is null or length(chosen_body) > 100000 then
    raise exception 'Invalid draft body';
  end if;
  update public.answer_text_drafts set body = chosen_body,
    base_text_revision = input_answer_revision,
    generation = generation + 1, edit_number = edit_number + 1,
    updated_at = now() where user_id = uid and sequence_order = input_sequence_order
    returning * into d;
  return jsonb_build_object('status','saved','draft',to_jsonb(d),
    'answer_body',current_body,'answer_revision',input_answer_revision);
end; $$;

revoke all on function public.rebase_conflicted_answer_text_draft(uuid,integer,bigint,bigint,uuid,bigint,text)
  from public,anon,authenticated;
grant execute on function public.rebase_conflicted_answer_text_draft(uuid,integer,bigint,bigint,uuid,bigint,text)
  to authenticated;
commit;
