begin;

alter table public.theme_memory_requests
  add column if not exists arrival_notification_state text not null default 'pending',
  add column if not exists arrival_notification_channel text,
  add column if not exists arrival_notification_attempted_at timestamptz,
  add column if not exists arrival_notification_sent_at timestamptz;

-- Requests completed before this feature was installed are not new arrivals.
update public.theme_memory_requests
set arrival_notification_state = 'unavailable'
where status = 'submitted'
  and arrival_notification_state = 'pending';

alter table public.theme_memory_requests
  add constraint theme_memory_requests_arrival_notification_state_check
  check (arrival_notification_state in ('pending', 'sending', 'sent', 'failed', 'unavailable'));

comment on column public.theme_memory_requests.arrival_notification_state is
  'One delivery attempt for an arrived response. The recipient and message body are not stored.';

commit;
