-- Remember a non-retryable service error across a page reload so a speaker
-- sees the manual-words route instead of an endless retry button.
alter table public.guest_trial_answers
  add column transcription_retryable boolean not null default true;
