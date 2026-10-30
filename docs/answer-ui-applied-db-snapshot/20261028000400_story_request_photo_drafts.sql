begin;

alter table public.theme_memory_answer_drafts
  add column if not exists photo_paths jsonb not null default '[]'::jsonb;

alter table public.theme_memory_answer_drafts
  add constraint theme_memory_answer_drafts_photo_paths_array
  check (jsonb_typeof(photo_paths) = 'array');

commit;
