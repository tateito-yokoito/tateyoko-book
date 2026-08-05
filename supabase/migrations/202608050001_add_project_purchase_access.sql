begin;

-- A project owns its purchase entitlement. Existing projects remain usable,
-- while projects created after this migration start with the free trial.
alter table public.book_projects
  add column if not exists access_status text;

alter table public.book_projects
  add column if not exists product_code text
  not null default 'self_book_v1';

alter table public.book_projects
  add column if not exists purchased_at timestamptz;

alter table public.book_projects
  add column if not exists stripe_checkout_session_id text;

alter table public.book_projects
  add column if not exists stripe_customer_id text;

alter table public.book_projects
  add column if not exists stripe_payment_intent_id text;

-- Values that existed before paid access was introduced must never be locked.
update public.book_projects
set access_status = 'legacy'
where access_status is null;

alter table public.book_projects
  alter column access_status set default 'trial';

alter table public.book_projects
  alter column access_status set not null;

alter table public.book_projects
  drop constraint if exists book_projects_access_status_check;

alter table public.book_projects
  add constraint book_projects_access_status_check
  check (
    access_status in (
      'trial',
      'checkout_pending',
      'paid',
      'gifted',
      'legacy',
      'refunded'
    )
  );

create unique index if not exists idx_book_projects_stripe_checkout_session
  on public.book_projects(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists idx_book_projects_access_status
  on public.book_projects(owner_user_id, access_status);

comment on column public.book_projects.access_status is
  'trial=無料3問、checkout_pending=決済中、paid/gifted/legacy=本編利用可、refunded=返金済み。';

commit;
