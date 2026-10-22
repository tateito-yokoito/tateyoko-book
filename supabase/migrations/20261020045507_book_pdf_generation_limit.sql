begin;

-- Draft PDFs invoke a paid Chromium renderer. Keep the reservation atomic so
-- parallel clicks and separate browser sessions share the same hourly limit.
create table public.book_pdf_generation_windows (
  user_id uuid not null,
  book_project_id uuid not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count between 1 and 12),
  primary key (user_id, book_project_id, window_started_at)
);
create index book_pdf_generation_windows_cleanup_idx
  on public.book_pdf_generation_windows(window_started_at);
alter table public.book_pdf_generation_windows enable row level security;
revoke all on public.book_pdf_generation_windows from public, anon, authenticated;
grant select, insert, update, delete on public.book_pdf_generation_windows to service_role;

create function public.claim_book_pdf_generation(input_user_id uuid, input_project_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  current_window timestamptz := date_trunc('hour', now());
  used_count integer;
begin
  if input_user_id is null or input_project_id is null then
    raise exception 'Invalid PDF generation request';
  end if;
  -- Expiration is maintained separately from the customer request path.
  -- Avoid a table-wide cleanup on every PDF click.
  insert into public.book_pdf_generation_windows as counter
    (user_id, book_project_id, window_started_at, request_count)
  values (input_user_id, input_project_id, current_window, 1)
  on conflict (user_id, book_project_id, window_started_at)
  do update set request_count = counter.request_count + 1
    where counter.request_count < 12
  returning request_count into used_count;
  if used_count is null then
    return jsonb_build_object('allowed', false, 'retry_after_seconds',
      greatest(1, ceil(extract(epoch from current_window + interval '1 hour' - now()))::integer));
  end if;
  return jsonb_build_object('allowed', true, 'used', used_count, 'remaining', 12 - used_count);
end;
$$;
revoke all on function public.claim_book_pdf_generation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_book_pdf_generation(uuid, uuid) to service_role;

commit;
