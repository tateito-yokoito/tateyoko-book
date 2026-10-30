begin;

create or replace function public.resolve_answer_text_draft_conflict(
  input_project_id uuid, input_sequence_order integer, input_generation bigint,
  input_remote_edit_number bigint, input_device_id uuid, input_body text,
  input_base_text_revision bigint
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); d public.answer_text_drafts%rowtype;
        answer_revision bigint;
begin
  if uid is null or input_device_id is null or input_body is null
    or length(input_body) > 100000 or not exists (
      select 1 from public.user_questions where user_id = uid
        and book_project_id = input_project_id and sequence_order = input_sequence_order
    ) then raise exception 'Question unavailable'; end if;
  select * into d from public.answer_text_drafts
    where user_id = uid and sequence_order = input_sequence_order for update;
  if d.user_id is null or d.book_project_id <> input_project_id
    or d.generation <> input_generation or d.edit_number <> input_remote_edit_number then
    return jsonb_build_object('status','conflict','draft',to_jsonb(d));
  end if;
  select coalesce(text_revision,0) into answer_revision from public.answers
    where user_id=uid and sequence_order=input_sequence_order;
  if coalesce(answer_revision,0) <> input_base_text_revision then
    return jsonb_build_object('status','answer_conflict',
      'answer_revision',coalesce(answer_revision,0));
  end if;
  update public.answer_text_drafts set
    body=input_body, base_text_revision=input_base_text_revision,
    edit_number=edit_number+1, device_id=input_device_id,
    state='active', updated_at=now()
    where user_id=uid and sequence_order=input_sequence_order returning * into d;
  return jsonb_build_object('status','saved','draft',to_jsonb(d));
end; $$;

revoke all on function public.resolve_answer_text_draft_conflict(uuid,integer,bigint,bigint,uuid,text,bigint)
  from public,anon,authenticated;
grant execute on function public.resolve_answer_text_draft_conflict(uuid,integer,bigint,bigint,uuid,text,bigint)
  to authenticated;

commit;
