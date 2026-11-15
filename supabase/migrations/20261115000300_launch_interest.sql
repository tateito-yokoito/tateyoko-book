-- Public launch interest is separate from orders, accounts and inquiries.
create table public.launch_interest (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  created_at timestamptz not null default now(),
  email text not null,
  interest_for text not null check (interest_for in ('self', 'family', 'both')),
  purchase_intent text not null check (purchase_intent in ('updates', 'considering')),
  reason text check (reason is null or char_length(reason) <= 1000),
  consent_at timestamptz not null,
  ip_hash text not null,
  constraint launch_interest_email_valid check (char_length(email) between 3 and 254 and email = lower(email))
);
create unique index launch_interest_email_unique on public.launch_interest (email);
create index launch_interest_created_idx on public.launch_interest (created_at desc);
create index launch_interest_ip_idx on public.launch_interest (ip_hash, created_at desc);
alter table public.launch_interest enable row level security;
revoke all on public.launch_interest from public, anon, authenticated;
grant select, insert, update on public.launch_interest to service_role;

-- No anon/authenticated policy: public intake runs only through the validated Edge function.
-- Supabase Table Editor can list and export the table as CSV for authorized operators.
