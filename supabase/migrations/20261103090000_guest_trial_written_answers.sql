-- Text-only guest answers share the same private ticket and 10-day retention
-- as recorded answers. Existing audio rows continue to satisfy the check.
alter table public.guest_trial_answers
  alter column audio_path drop not null,
  alter column audio_mime drop not null,
  alter column audio_bytes drop not null;

alter table public.guest_trial_answers
  drop constraint guest_trial_answers_check;
alter table public.guest_trial_answers
  add constraint guest_trial_answers_check check (
    (audio_path is null and audio_mime is null and audio_bytes is null
      and transcription_state = 'complete' and length(btrim(transcript)) > 0)
    or
    (audio_path is not null and audio_mime is not null and audio_bytes is not null
      and audio_path like 'guest-trial/' || session_id::text || '/%')
  );
