begin;

alter table public.book_cover_settings
  add column if not exists footer_text text not null default '';

commit;
