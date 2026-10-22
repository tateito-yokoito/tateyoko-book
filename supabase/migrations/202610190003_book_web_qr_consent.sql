begin;

alter table public.book_cover_settings
  add column if not exists include_web_book_qr boolean not null default false;

commit;
