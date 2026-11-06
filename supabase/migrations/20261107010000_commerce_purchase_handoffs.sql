-- A short-lived server-side handoff survives email/LINE authentication in a
-- different browser tab. Only Edge Functions may access these rows.
create table public.commerce_purchase_handoffs (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  selection jsonb not null,
  guest_trial_session_id uuid references public.guest_trial_sessions(id) on delete cascade,
  auth_email_hash text check (auth_email_hash ~ '^[a-f0-9]{64}$'),
  claimed_user_id uuid references auth.users(id),
  creator_ip_hash text not null check (creator_ip_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at)
);
create index commerce_purchase_handoffs_ip_created_idx
  on public.commerce_purchase_handoffs(creator_ip_hash, created_at desc);
create index commerce_purchase_handoffs_expiry_idx
  on public.commerce_purchase_handoffs(expires_at);
alter table public.commerce_purchase_handoffs enable row level security;
revoke all on public.commerce_purchase_handoffs from public, anon, authenticated;
grant select, insert, update, delete on public.commerce_purchase_handoffs to service_role;
