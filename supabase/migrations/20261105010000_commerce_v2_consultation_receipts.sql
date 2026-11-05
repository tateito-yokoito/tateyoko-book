-- Consultation receipts reuse the existing Phase 2 consultation record.
-- Apply only after the Phase 2 commerce migration is present.
alter table public.commerce_v2_consultations
  add column if not exists answer_copy_requested boolean not null default false,
  add column if not exists customer_email_status text not null default 'not_requested',
  add column if not exists admin_notification_status text not null default 'pending',
  add column if not exists notification_attempted_at timestamptz;

alter table public.commerce_v2_consultations
  add constraint commerce_v2_consultations_customer_email_status_check
    check (customer_email_status in ('not_requested', 'sending', 'sent', 'failed')),
  add constraint commerce_v2_consultations_admin_notification_status_check
    check (admin_notification_status in ('pending', 'sending', 'sent', 'failed'));
