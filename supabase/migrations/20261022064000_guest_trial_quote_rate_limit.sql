-- A completed guest trial may view the existing commerce quote, including a
-- privately supplied discount code. Prevent one bearer token from enumerating
-- the whole discount-code space before a real checkout can reserve a code.
alter table public.guest_trial_sessions
  add column quote_attempts integer not null default 0
    check (quote_attempts between 0 and 10);
