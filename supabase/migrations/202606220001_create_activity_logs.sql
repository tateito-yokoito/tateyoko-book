create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  family_id uuid,
  book_project_id uuid,
  answer_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_actor_user_id_idx
  on public.activity_logs(actor_user_id);

create index if not exists activity_logs_action_idx
  on public.activity_logs(action);

create index if not exists activity_logs_book_project_id_idx
  on public.activity_logs(book_project_id);

create index if not exists activity_logs_answer_id_idx
  on public.activity_logs(answer_id);

create index if not exists activity_logs_created_at_idx
  on public.activity_logs(created_at desc);

alter table public.activity_logs enable row level security;

drop policy if exists "Users can insert own activity logs" on public.activity_logs;
create policy "Users can insert own activity logs"
  on public.activity_logs
  for insert
  to authenticated
  with check (actor_user_id = auth.uid());

drop policy if exists "Users can read own activity logs" on public.activity_logs;
create policy "Users can read own activity logs"
  on public.activity_logs
  for select
  to authenticated
  using (actor_user_id = auth.uid());

-- Admin-wide access should be implemented with a service role function or
-- an explicit admin role table. Avoid exposing broad read access in the browser.
