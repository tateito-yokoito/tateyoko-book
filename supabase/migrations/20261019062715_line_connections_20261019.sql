begin;

-- A LINE Login identity and a Messaging API delivery destination are not the
-- same consent. Only the server may store a verified OA-reachable recipient.
create table if not exists public.line_notification_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  line_user_id text not null unique,
  status text not null default 'unavailable'
    check (status in ('active', 'reachable_unconfirmed', 'unavailable', 'blocked')),
  profile_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint line_notification_connections_user_id_format
    check (line_user_id ~ '^U[0-9a-f]{32}$')
);

create index if not exists line_notification_connections_status_idx
  on public.line_notification_connections(status, profile_checked_at);

drop trigger if exists line_notification_connections_updated_at on public.line_notification_connections;
create trigger line_notification_connections_updated_at
before update on public.line_notification_connections
for each row execute function public.set_tateyoko_updated_at();

alter table public.line_notification_connections enable row level security;
revoke all on public.line_notification_connections from public, anon, authenticated;
-- Read/write is deliberately service-role-only; the authenticated user talks
-- to the line-connection Edge Function, which verifies the Auth identity.

commit;
