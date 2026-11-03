-- Trial funnel signals contain no narration, audio, name, email, IP or LINE id.
-- Client signals indicate intent only; payment and friend status must come from
-- their authoritative server-side records, never from this table.
create table public.guest_trial_funnel_events (
  session_id uuid not null references public.guest_trial_sessions(id) on delete cascade,
  event_name text not null check (event_name in (
    'trial_guest_started', 'trial_guest_completed',
    'trial_conversion_page_viewed', 'trial_problem_section_reached',
    'trial_journey_preview_reached', 'trial_book_preview_reached',
    'trial_webbook_preview_reached', 'trial_price_viewed',
    'trial_refund_section_viewed', 'trial_payment_options_viewed',
    'trial_story_replayed', 'trial_purchase_cta_clicked',
    'trial_pause_choice_opened', 'trial_pause_returned',
    'trial_line_updates_clicked', 'trial_pause_ended'
  )),
  occurred_at timestamptz not null default now(),
  primary key (session_id, event_name)
);
create index guest_trial_funnel_events_name_time_idx
  on public.guest_trial_funnel_events(event_name, occurred_at desc);
alter table public.guest_trial_funnel_events enable row level security;
revoke all on public.guest_trial_funnel_events from public, anon, authenticated;
