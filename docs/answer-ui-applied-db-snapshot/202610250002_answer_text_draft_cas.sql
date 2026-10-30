begin;
drop function if exists public.sync_answer_text_draft(uuid,integer,bigint,bigint,uuid,text,bigint);
create or replace function public.sync_answer_text_draft(
  input_project_id uuid, input_sequence_order integer, input_generation bigint,
  input_edit_number bigint, input_expected_server_edit_number bigint,
  input_device_id uuid, input_body text,
  input_base_text_revision bigint
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
  q public.user_questions%rowtype;
  a public.answers%rowtype;
  d public.answer_text_drafts%rowtype;
begin
  if uid is null or input_device_id is null or input_edit_number < 1
    or input_generation < 0 or input_body is null or length(input_body) > 100000 then
    raise exception 'Invalid text draft request';
  end if;
  select * into q from public.user_questions
    where user_id = uid and book_project_id = input_project_id
      and sequence_order = input_sequence_order and is_active is true;
  if q.id is null then raise exception 'Question unavailable'; end if;
  select * into a from public.answers
    where user_id = uid and sequence_order = input_sequence_order;
  if a.id is not null and (a.book_project_id is not null and a.book_project_id <> input_project_id
    or a.text_revision <> input_base_text_revision) then
    return jsonb_build_object('status','answer_conflict','answer_revision',a.text_revision);
  end if;
  if a.id is null and input_base_text_revision <> 0 then
    return jsonb_build_object('status','answer_conflict','answer_revision',0);
  end if;

  insert into public.answer_text_drafts
    (user_id, sequence_order, book_project_id, generation, edit_number,
     device_id, body, base_text_revision, state)
  values (uid, input_sequence_order, input_project_id, 0, 0,
          input_device_id, null, input_base_text_revision, 'discarded')
  on conflict (user_id, sequence_order) do nothing;
  select * into d from public.answer_text_drafts
    where user_id = uid and sequence_order = input_sequence_order for update;
  if d.book_project_id <> input_project_id or d.generation <> input_generation then
    return jsonb_build_object('status','generation_conflict','draft',to_jsonb(d));
  end if;
  if d.edit_number <> input_expected_server_edit_number then
    return jsonb_build_object('status','edit_conflict','draft',to_jsonb(d));
  end if;
  if d.state = 'active' and d.device_id is distinct from input_device_id then
    return jsonb_build_object('status','device_conflict','draft',to_jsonb(d));
  end if;
  if d.state = 'active' and input_edit_number <= d.edit_number then
    return jsonb_build_object('status','stale_edit','draft',to_jsonb(d));
  end if;
  update public.answer_text_drafts set
    body = input_body, base_text_revision = input_base_text_revision,
    edit_number = input_edit_number, device_id = input_device_id,
    state = 'active', updated_at = now()
    where user_id = uid and sequence_order = input_sequence_order returning * into d;
  return jsonb_build_object('status','saved','draft',to_jsonb(d));
end; $$;

revoke all on function public.sync_answer_text_draft(uuid,integer,bigint,bigint,bigint,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.sync_answer_text_draft(uuid,integer,bigint,bigint,bigint,uuid,text,bigint) to authenticated;
commit;
