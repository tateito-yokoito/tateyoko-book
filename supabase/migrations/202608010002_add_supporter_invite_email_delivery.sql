begin;

alter table public.project_invites
  add column if not exists email_delivery_status text
  not null default 'not_sent';

alter table public.project_invites
  add column if not exists email_attempted_at timestamptz;

alter table public.project_invites
  add column if not exists email_sent_at timestamptz;

alter table public.project_invites
  add column if not exists email_message_id text;

alter table public.project_invites
  add column if not exists email_error text;

alter table public.project_invites
  drop constraint if exists project_invites_email_delivery_status_check;

alter table public.project_invites
  add constraint project_invites_email_delivery_status_check
  check (
    email_delivery_status in (
      'not_sent',
      'sending',
      'sent',
      'failed'
    )
  );

create index if not exists project_invites_email_delivery_status_idx
  on public.project_invites(email_delivery_status, created_at);

commit;
