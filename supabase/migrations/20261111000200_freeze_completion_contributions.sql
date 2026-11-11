-- Keep the existing final snapshot equality guard intact. The older
-- attach_story_contributions_to_work BEFORE UPDATE trigger adds the appendix
-- before that guard runs, so the checkout snapshot must already contain the
-- same appendix. Freeze its source rows while checkout is pending.
begin;

create function public.included_book_contributions(input_project_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', answer.id,
    'request_id', request.id,
    'question_key', answer.question_key,
    'source_question_id', answer.source_question_id,
    'theme_code', request.theme_code,
    'responder_name', answer.responder_name,
    'relationship', request.relationship_label,
    'recipient_name', request.recipient_name,
    'question', answer.prompt_snapshot,
    'body', answer.current_text,
    'audio_records', answer.audio_records,
    'photo_paths', answer.photo_paths
  ) order by request.created_at, answer.created_at), '[]'::jsonb)
  from public.theme_memory_answer_records answer
  join public.theme_memory_requests request on request.id=answer.request_id
  where request.book_project_id=input_project_id
    and answer.publication_status='included'
    and answer.consent_at is not null;
$$;
revoke all on function public.included_book_contributions(uuid) from public,anon,authenticated;

-- Preserve the legacy trigger's behavior for all normal completions while
-- sharing its exact appendix projection with the V2 checkout snapshot.
create or replace function public.attach_story_contributions_to_work()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.confirmed_at is null and new.confirmed_at is not null then
    new.snapshot:=jsonb_set(new.snapshot,'{contributions}',
      public.included_book_contributions(new.book_project_id),true);
  end if;
  return new;
end;
$$;

create function public.freeze_initial_completion_contributions()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists (select 1 from public.commerce_orders o
      where o.id=new.order_id and o.metadata->>'order_kind'='initial_completion')
    and exists (select 1 from public.book_work_manifests w
      where w.id=new.work_manifest_id and w.confirmed_at is null) then
    new.snapshot:=jsonb_set(new.snapshot,'{contributions}',
      public.included_book_contributions(new.book_project_id),true);
    new.source_sha256:=encode(extensions.digest(new.snapshot::text,'sha256'),'hex');
  end if;
  return new;
end;
$$;
revoke all on function public.freeze_initial_completion_contributions() from public,anon,authenticated;
create trigger freeze_initial_completion_contributions
  before insert on public.book_order_work_snapshots
  for each row execute function public.freeze_initial_completion_contributions();

-- A contribution's inclusion, text, media or request metadata changes the
-- source BOOK. Serialize those edits with order creation using the same
-- project-row lock as guard_pending_v2_completion_edit.
create function public.guard_pending_v2_contribution_edit()
returns trigger language plpgsql security definer set search_path=public as $$
declare old_project uuid; new_project uuid; project_id uuid;
begin
  if tg_table_name='theme_memory_requests' then
    if tg_op<>'INSERT' then old_project:=old.book_project_id; end if;
    if tg_op<>'DELETE' then new_project:=new.book_project_id; end if;
  else
    if tg_op<>'INSERT' then
      select book_project_id into old_project from public.theme_memory_requests
        where id=old.request_id;
    end if;
    if tg_op<>'DELETE' then
      select book_project_id into new_project from public.theme_memory_requests
        where id=new.request_id;
    end if;
  end if;
  for project_id in select distinct id from unnest(array[old_project,new_project]) as projects(id)
    where id is not null order by id loop
    perform 1 from public.book_projects where id=project_id for share;
    if exists (select 1 from public.commerce_orders o
      where o.book_project_id=project_id and o.status='checkout_pending'
        and o.metadata->>'order_kind'='initial_completion') then
      raise exception '完成決済中は採用済みの語りを変更できません。決済を完了するか中止してください'
        using errcode='55000';
    end if;
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_pending_v2_contribution_edit() from public,anon,authenticated;
create trigger guard_completion_contribution_answers
  before insert or update of request_id,question_key,source_question_id,
    responder_name,prompt_snapshot,current_text,audio_records,photo_paths,
    publication_status,consent_at,created_at or delete
  on public.theme_memory_answer_records
  for each row execute function public.guard_pending_v2_contribution_edit();
create trigger guard_completion_contribution_requests
  before insert or update of book_project_id,theme_code,relationship_label,
    recipient_name,created_at or delete
  on public.theme_memory_requests
  for each row execute function public.guard_pending_v2_contribution_edit();

commit;
