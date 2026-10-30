begin;

create or replace function public.discard_conflicted_answer_text_draft(
  input_project_id uuid, input_sequence_order integer,
  input_generation bigint, input_remote_edit_number bigint,
  input_device_id uuid
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); d public.answer_text_drafts%rowtype;
begin
  if uid is null or input_device_id is null or input_generation<0
    or input_remote_edit_number<0 or not exists (
      select 1 from public.user_questions q where q.user_id=uid
        and q.book_project_id=input_project_id
        and q.sequence_order=input_sequence_order
    ) then raise exception 'Question unavailable'; end if;
  select * into d from public.answer_text_drafts
    where user_id=uid and sequence_order=input_sequence_order for update;
  if d.user_id is null or d.book_project_id<>input_project_id
    or d.generation<>input_generation or d.edit_number<>input_remote_edit_number then
    return jsonb_build_object('status','conflict','draft',to_jsonb(d));
  end if;
  update public.answer_text_drafts set body=null,state='discarded',
    generation=generation+1,edit_number=0,device_id=input_device_id,
    updated_at=now() where user_id=uid and sequence_order=input_sequence_order
    returning * into d;
  return jsonb_build_object('status','discarded','draft',to_jsonb(d));
end; $$;

revoke all on function public.discard_conflicted_answer_text_draft(uuid,integer,bigint,bigint,uuid)
  from public,anon,authenticated;
grant execute on function public.discard_conflicted_answer_text_draft(uuid,integer,bigint,bigint,uuid)
  to authenticated;

commit;
