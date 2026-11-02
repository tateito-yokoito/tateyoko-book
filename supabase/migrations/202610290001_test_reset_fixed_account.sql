-- Dedicated, fixed-LINE test reset. This is separate from ordinary account deletion.
-- Invoke only through an owner-authenticated Edge Function and an active organization mode.
-- No account ID is accepted by this RPC.
create or replace function public.admin_test_reset_preview()
returns jsonb language plpgsql volatile security definer
set search_path = public, auth, storage as $$
declare
  target_id uuid;
  base jsonb;
  owned uuid[];
  blockers jsonb;
  summary jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select i.user_id into strict target_id from auth.identities i
    where i.provider = 'custom:line'
      and md5(i.provider_id) = '02985a41bf96806af2e3dad6929125c7';
  base := public.admin_account_deletion_preview(target_id);
  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into owned
    from jsonb_array_elements_text(base -> 'project_ids') value;
  blockers := coalesce(base -> 'blockers', '[]'::jsonb);
  if exists (select 1 from public.commerce_orders o
      where (o.purchaser_user_id = target_id or o.book_project_id = any(owned))
        and (o.status not in ('expired', 'zero_paid')
          or (o.status = 'zero_paid' and o.amount_total <> 0)
          or o.stripe_payment_intent_id is not null
          or o.stripe_customer_id is not null
          or o.refunded_at is not null
          or coalesce(o.refund_amount, 0) <> 0))
    or exists (select 1 from public.experience_refund_requests r
      join public.commerce_orders o on o.id = r.order_id
      where o.purchaser_user_id = target_id or o.book_project_id = any(owned))
  then blockers := blockers || jsonb_build_array('実課金・返金の履歴があります'); end if;
  if exists (select 1 from public.experience_contracts c
      where (c.purchaser_user_id = target_id or c.book_project_id = any(owned))
        and c.payment_confirmed_at is not null and coalesce(c.base_paid_amount, 0) <> 0)
  then blockers := blockers || jsonb_build_array('有償契約の履歴があります'); end if;
  if exists (select 1 from public.answer_recording_attempts a
      where a.book_project_id = any(owned) and a.state not in ('committed', 'discarded'))
  then blockers := blockers || jsonb_build_array('保存途中の録音があります'); end if;
  if exists (select 1 from public.book_order_work_snapshots s where s.book_project_id = any(owned))
    or exists (select 1 from public.book_production_jobs j where j.book_project_id = any(owned))
    or exists (select 1 from public.experience_notification_outbox n where n.recipient_user_id = target_id)
    or exists (select 1 from public.book_orders b where b.user_id = target_id)
    or exists (select 1 from public.books b where b.user_id = target_id)
    or exists (select 1 from public.family_production_consents c where c.project_id = any(owned))
    or exists (select 1 from public.family_production_events e where e.project_id = any(owned))
  then blockers := blockers || jsonb_build_array('制作・配信の処理履歴があります'); end if;
  if exists (select 1 from public.notification_deliveries d
      where (d.user_id = target_id or d.book_project_id = any(owned)) and d.status = 'sending')
    or exists (select 1 from public.question_delivery_logs d
      where (d.recipient_user_id = target_id or d.book_project_id = any(owned))
        and d.delivery_status = 'sending')
  then blockers := blockers || jsonb_build_array('送信中の通知があります'); end if;
  if exists (
    select 1 from jsonb_array_elements(base -> 'storage_files') as f(value)
      left join storage.objects o on o.bucket_id = f.value ->> 'bucket' and o.name = f.value ->> 'path'
    where o.id is null or o.owner_id is distinct from target_id::text
  ) then blockers := blockers || jsonb_build_array('ファイル所有者を確認できません'); end if;
  summary := (base - 'fingerprint') || jsonb_build_object(
    'blockers', blockers,
    'draft_count', (select count(*) from public.answer_text_drafts where book_project_id = any(owned)),
    'recording_attempt_count', (select count(*) from public.answer_recording_attempts where book_project_id = any(owned)),
    'line_connection_count', (select count(*) from public.line_notification_connections where user_id = target_id),
    'schedule_count', (select count(*) from public.notification_schedules where user_id = target_id),
    'contract_snapshot', (select md5(coalesce(string_agg(
      concat_ws(':', c.order_id, c.base_paid_amount, c.payment_confirmed_at,
        c.purchaser_user_id, c.book_project_id), ',' order by c.order_id), ''))
      from public.experience_contracts c
      where c.purchaser_user_id = target_id or c.book_project_id = any(owned))
  );
  return summary || jsonb_build_object('fingerprint', md5(summary::text));
exception when no_data_found then
  return jsonb_build_object('blockers', jsonb_build_array('固定されたLINEテストアカウントが見つかりません'));
when too_many_rows then
  return jsonb_build_object('blockers', jsonb_build_array('固定LINE IDが複数アカウントに対応しています'));
end;
$$;
revoke all on function public.admin_test_reset_preview() from public, anon, authenticated;
grant execute on function public.admin_test_reset_preview() to service_role;

-- An audit marker distinguishes fixed-test-reset cleanup jobs from generic
-- account deletion jobs. No client role can read or write this table.
create table if not exists public.admin_test_reset_jobs (
  job_id uuid primary key references public.admin_account_deletion_jobs(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  account_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.admin_test_reset_jobs enable row level security;
revoke all on public.admin_test_reset_jobs from public, anon, authenticated;
grant select, insert on public.admin_test_reset_jobs to service_role;

create or replace function public.admin_test_reset_execute(
  input_actor_id uuid, input_fingerprint text
) returns jsonb language plpgsql security definer
set search_path = public, auth, family_private as $$
declare
  preview jsonb;
  owned uuid[];
  job_id uuid;
  input_account_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  -- This identity is enrolled by its stable LINE provider hash. Callers cannot
  -- supply a user ID, and a new Auth UUID after re-registration still resolves.
  select i.user_id into strict input_account_id
    from auth.identities i
    where i.provider = 'custom:line'
      and md5(i.provider_id) = '02985a41bf96806af2e3dad6929125c7';
  if exists (select 1 from public.admin_users where user_id = input_account_id) then
    raise exception '管理者アカウントはリセットできません' using errcode = '42501';
  end if;

  if input_actor_id = input_account_id or not exists (
    select 1 from public.admin_users a
      join public.admin_organization_mode_sessions s on s.admin_user_id = a.user_id
    where a.user_id = input_actor_id and a.is_active and a.role = 'owner'
      and s.expires_at > now()
  ) then raise exception '有効な整理モードが必要です' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext(input_account_id::text));
  perform 1 from auth.users where id = input_account_id for update;
  if not found then raise exception 'アカウントが見つかりません'; end if;
  perform 1 from public.families where owner_user_id = input_account_id for update;
  perform 1 from public.book_projects where owner_user_id = input_account_id for update;
  select coalesce(array_agg(id), '{}'::uuid[]) into owned
    from public.book_projects where owner_user_id = input_account_id;
  perform 1 from public.persons person_row
    join public.families family_row on family_row.id = person_row.family_id
    where family_row.owner_user_id = input_account_id
    for update of person_row;
  perform 1 from public.commerce_orders o
    where o.purchaser_user_id = input_account_id or o.book_project_id = any(owned)
    for update;
  perform 1 from public.experience_contracts c
    where c.purchaser_user_id = input_account_id or c.main_started_by = input_account_id
      or c.book_project_id = any(owned)
    for update;
  perform 1 from public.experience_refund_requests r
    where r.requested_by = input_account_id
      or r.order_id in (select c.order_id from public.experience_contracts c
        where c.purchaser_user_id = input_account_id or c.book_project_id = any(owned))
    for update;
  preview := public.admin_test_reset_preview();
  if preview ->> 'fingerprint' is distinct from input_fingerprint then
    raise exception '内容が変わりました。再確認してください' using errcode = '40001';
  end if;
  if jsonb_array_length(preview -> 'blockers') > 0 then
    raise exception '個別確認が必要なアカウントです' using errcode = '42501';
  end if;
  if exists (select 1 from public.commerce_orders o
      where (o.purchaser_user_id = input_account_id or o.book_project_id = any(owned))
        and (o.status not in ('expired', 'zero_paid')
          or (o.status = 'zero_paid' and o.amount_total <> 0)
          or o.stripe_payment_intent_id is not null
          or o.stripe_customer_id is not null
          or o.refunded_at is not null
          or coalesce(o.refund_amount, 0) <> 0))
    or exists (select 1 from public.experience_refund_requests r
      join public.commerce_orders o on o.id = r.order_id
      where o.purchaser_user_id = input_account_id or o.book_project_id = any(owned))
  then raise exception '実課金・返金の履歴は自動リセットできません' using errcode = '42501'; end if;
  if exists (select 1 from public.answer_recording_attempts a
      where a.book_project_id = any(owned) and a.state not in ('committed', 'discarded'))
  then raise exception '保存途中の録音があります' using errcode = '42501'; end if;

  insert into public.admin_account_deletion_jobs(actor_id, account_id, project_count, storage_files)
    values(input_actor_id, input_account_id, cardinality(owned), preview -> 'storage_files')
    returning id into job_id;
  insert into public.admin_test_reset_jobs(job_id, actor_id, account_id)
    values(job_id, input_actor_id, input_account_id);

  -- Preserve financial rows, but sever every reference to the deleted user,
  -- owned work, or owned Person before deleting those entities.
  update public.experience_refund_requests r
    set requested_by = case when r.requested_by = input_account_id then null else r.requested_by end,
        subject_person_id = case when r.subject_person_id in (
          select person_row.id from public.persons person_row
            join public.families family_row on family_row.id = person_row.family_id
            where family_row.owner_user_id = input_account_id)
          then null else r.subject_person_id end
    where r.requested_by = input_account_id or r.subject_person_id in (
      select person_row.id from public.persons person_row
        join public.families family_row on family_row.id = person_row.family_id
        where family_row.owner_user_id = input_account_id);
  update public.experience_contracts c
    set purchaser_user_id = case when c.purchaser_user_id = input_account_id then null else c.purchaser_user_id end,
        main_started_by = case when c.main_started_by = input_account_id then null else c.main_started_by end,
        book_project_id = case when c.book_project_id = any(owned) then null else c.book_project_id end,
        subject_person_id = case when c.subject_person_id in (
          select person_row.id from public.persons person_row
            join public.families family_row on family_row.id = person_row.family_id
            where family_row.owner_user_id = input_account_id)
          then null else c.subject_person_id end
    where c.purchaser_user_id = input_account_id or c.main_started_by = input_account_id
      or c.book_project_id = any(owned) or c.subject_person_id in (
        select person_row.id from public.persons person_row
          join public.families family_row on family_row.id = person_row.family_id
          where family_row.owner_user_id = input_account_id);
  update public.discount_redemptions set purchaser_user_id = null
    where purchaser_user_id = input_account_id;
  update public.commerce_orders o
    set purchaser_user_id = case when o.purchaser_user_id = input_account_id then null else o.purchaser_user_id end,
        book_project_id = case when o.book_project_id = any(owned) then null else o.book_project_id end
    where o.purchaser_user_id = input_account_id or o.book_project_id = any(owned);

  delete from public.admin_trash_entries
    where (entity_type = 'account' and entity_id = input_account_id)
      or (entity_type = 'book_project' and entity_id = any(owned))
      or source_account_id = input_account_id;
  delete from public.admin_retired_accounts where account_id = input_account_id;
  delete from public.family_production_events
    where project_id = any(owned)
      or consent_id in (select id from public.family_production_consents
        where supporter_user_id = input_account_id);
  delete from public.family_production_consents
    where project_id = any(owned) or supporter_user_id = input_account_id;
  delete from family_private.invites where project_id = any(owned) or issuer_id = input_account_id;
  update family_private.invites set consumed_by = null where consumed_by = input_account_id;
  delete from public.family_trial_intents
    where book_project_id = any(owned) or actor_user_id = input_account_id;
  delete from public.book_milestone_uploads
    where project_id = any(owned) or actor_id = input_account_id;
  delete from public.family_uploads
    where project_id = any(owned) or actor_id = input_account_id;
  delete from public.book_work_manifests where book_project_id = any(owned);
  update public.book_work_manifests set confirmed_by = null
    where confirmed_by = input_account_id;
  delete from public.family_subject_bindings
    where person_id in (select person_row.id from public.persons person_row
      join public.families family_row on family_row.id = person_row.family_id
      where family_row.owner_user_id = input_account_id);
  delete from public.project_participants where user_id = input_account_id;
  delete from public.media_assets where user_id = input_account_id;
  update public.family_memberships set invited_by_user_id = null
    where invited_by_user_id = input_account_id;
  -- A family deletion cascades to its book projects. Remove the two new
  -- non-cascading answer tables before that cascade starts.
  delete from public.answer_text_drafts where book_project_id = any(owned);
  delete from public.answer_recording_attempts where book_project_id = any(owned);
  delete from public.families where owner_user_id = input_account_id;
  delete from public.book_projects where owner_user_id = input_account_id;
  delete from public.profiles where id = input_account_id;
  delete from auth.users where id = input_account_id;
  return jsonb_build_object('job_id', job_id, 'account_id', input_account_id,
    'project_count', cardinality(owned), 'storage_files', preview -> 'storage_files');
end;
$$;

revoke all on function public.admin_test_reset_execute(uuid,text) from public, anon, authenticated;
grant execute on function public.admin_test_reset_execute(uuid,text) to service_role;
