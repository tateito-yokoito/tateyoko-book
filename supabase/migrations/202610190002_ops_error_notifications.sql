begin;

-- This migration is the cutover. Apply only after the history RPC, admin UI,
-- and updated notifier have been verified in that order.
create function public.claim_ops_error_notifications(input_limit integer default 10)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare result jsonb;
begin
  if not exists (
    select 1 from public.ops_monitor_settings
    where singleton and enabled and incident_alerts_enabled
  ) then return '[]'::jsonb; end if;

  with pending as (
    select i.id from public.ops_error_incidents i
    where i.status in ('open', 'investigating')
      and i.importance in ('review', 'urgent')
      and (i.notified_importance = 'record'
        or (i.importance = 'urgent' and i.notified_importance = 'review'))
      and (i.notification_claimed_at is null
        or i.notification_claimed_at < now() - interval '5 minutes')
    order by case i.importance when 'urgent' then 0 else 1 end,
      i.first_seen_at
    limit least(greatest(input_limit, 1), 20)
    for update skip locked
  ), claimed as (
    update public.ops_error_incidents i
    set notification_claimed_at = now()
    from pending p where i.id = p.id
    returning i.*
  )
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into result
  from (
    select c.id, c.kind, c.failure_point, c.error_code, c.http_status,
      c.attempt_count, c.importance, c.first_seen_at, c.last_seen_at,
      c.notification_claimed_at
    from claimed c
  ) r;
  return result;
end;
$function$;
revoke all on function public.claim_ops_error_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.claim_ops_error_notifications(integer)
  to service_role;

create function public.finish_ops_error_notification(
  input_id uuid, input_importance text, input_sent boolean
)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $function$
begin
  if input_importance not in ('review', 'urgent') then
    raise exception 'Invalid importance' using errcode = '22023';
  end if;
  update public.ops_error_incidents i set
    notified_importance = case when input_sent then input_importance
      else i.notified_importance end,
    email_sent_at = case when input_sent then now() else i.email_sent_at end,
    notification_claimed_at = null
  where i.id = input_id and i.notification_claimed_at is not null;
end;
$function$;
revoke all on function public.finish_ops_error_notification(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.finish_ops_error_notification(uuid, text, boolean)
  to service_role;

-- The old hourly aggregate findings stay visible as history but stop sending
-- separate email for the same client failures. Delivery/site alerts continue.
update public.ops_monitor_settings set incident_alerts_enabled = true,
  updated_at = now() where singleton;
select cron.unschedule('ops-monitor-notify');
select cron.schedule(
  'ops-monitor-notify', '* * * * *',
  'select public.invoke_ops_monitor_notify()'
);

commit;
