begin;

alter table public.book_cover_settings
  add column if not exists shipping_address jsonb not null default '{}'::jsonb;

commit;
