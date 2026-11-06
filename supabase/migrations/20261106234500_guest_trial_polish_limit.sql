-- Keep anonymous AI editing bounded to nine requests per ten-day trial.
-- The existing guest session token remains the only authorization for this action.
alter table public.guest_trial_sessions
  add column if not exists polish_attempts integer not null default 0
    check (polish_attempts between 0 and 9);
