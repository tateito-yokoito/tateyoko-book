begin;

alter table public.theme_memory_requests
  add column if not exists owner_viewed_at timestamptz;

comment on column public.theme_memory_requests.owner_viewed_at is
  'Last time an authorized project owner or family subject opened a submitted story request.';

commit;
