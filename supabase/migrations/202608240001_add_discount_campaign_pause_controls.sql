begin;

create or replace function public.admin_set_discount_campaign_active(
  input_campaign_id uuid,
  input_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  campaign_row public.discount_campaigns%rowtype;
  previous_status text;
  next_status text;
begin
  if not public.is_admin_sales_mode_active() then
    raise exception '販売管理モードが必要です' using errcode = '42501';
  end if;

  select * into campaign_row
  from public.discount_campaigns
  where id = input_campaign_id
  for update;

  if not found then
    raise exception 'キャンペーンが見つかりません';
  end if;

  previous_status := campaign_row.status;

  if input_active then
    if campaign_row.ends_at is not null and campaign_row.ends_at <= now() then
      raise exception '終了日時を過ぎたキャンペーンは再開できません';
    end if;
    next_status := case
      when campaign_row.starts_at is not null and campaign_row.starts_at > now() then 'scheduled'
      else 'active'
    end;
  else
    if campaign_row.status = 'ended'
      or (campaign_row.ends_at is not null and campaign_row.ends_at <= now()) then
      raise exception '終了したキャンペーンは停止状態へ変更できません';
    end if;
    next_status := 'paused';
  end if;

  if previous_status = next_status then
    return to_jsonb(campaign_row);
  end if;

  update public.discount_campaigns
  set status = next_status
  where id = input_campaign_id
  returning * into campaign_row;

  insert into public.admin_audit_logs(
    admin_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    auth.uid(),
    case when input_active then 'resume_discount_campaign' else 'pause_discount_campaign' end,
    'discount_campaign',
    campaign_row.id,
    jsonb_build_object(
      'campaign_name', campaign_row.name,
      'status_before', previous_status,
      'status_after', campaign_row.status,
      'starts_at', campaign_row.starts_at,
      'ends_at', campaign_row.ends_at
    )
  );

  return to_jsonb(campaign_row);
end;
$$;

revoke all on function public.admin_set_discount_campaign_active(uuid, boolean) from public;
grant execute on function public.admin_set_discount_campaign_active(uuid, boolean) to authenticated;

comment on function public.admin_set_discount_campaign_active(uuid, boolean)
  is '販売管理モード中に割引キャンペーンを停止・再開し、変更履歴を監査ログへ残す。';

commit;
