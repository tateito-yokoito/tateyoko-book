begin;

alter table public.voice_publication_request_windows
  drop constraint if exists voice_publication_request_windows_kind_check;
alter table public.voice_publication_request_windows
  add constraint voice_publication_request_windows_kind_check
  check (request_kind in ('metadata', 'asset', 'video_asset', 'all', 'all_day'));

create or replace function public.register_voice_publication_request(
  input_publication_id uuid,
  input_client_hash text,
  input_request_kind text
)
returns table (
  allowed boolean,
  circuit_open boolean,
  retry_after_seconds integer,
  client_count bigint,
  publication_window_count bigint,
  publication_day_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_client_hash text := left(btrim(coalesce(input_client_hash, '')), 128);
  normalized_kind text := lower(btrim(coalesce(input_request_kind, '')));
  current_status text;
  now_at timestamptz := clock_timestamp();
  ten_minute_window timestamptz;
  day_window timestamptz;
  client_limit bigint;
  client_total bigint;
  publication_total bigint;
  day_total bigint;
  open_reason text := '';
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden';
  end if;
  if normalized_client_hash = '' or normalized_kind not in ('metadata', 'asset', 'video_asset') then
    raise exception 'invalid rate-limit input';
  end if;

  select publication.status
  into current_status
  from public.voice_publications publication
  where publication.id = input_publication_id;

  if current_status is distinct from 'published' then
    return query select false, true, 600, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  ten_minute_window := date_bin(interval '10 minutes', now_at, timestamptz '2001-01-01 00:00:00+00');
  day_window := date_trunc('day', now_at);
  client_limit := case
    when normalized_kind = 'metadata' then 30
    when normalized_kind = 'video_asset' then 40
    else 120
  end;

  insert into public.voice_publication_request_windows as counter (
    publication_id, counter_key, request_kind, window_started_at, request_count
  ) values (
    input_publication_id, normalized_client_hash, normalized_kind, ten_minute_window, 1
  )
  on conflict (publication_id, counter_key, request_kind, window_started_at)
  do update set request_count = counter.request_count + 1,
                updated_at = now_at
  returning counter.request_count into client_total;

  insert into public.voice_publication_request_windows as counter (
    publication_id, counter_key, request_kind, window_started_at, request_count
  ) values (
    input_publication_id, '*', 'all', ten_minute_window, 1
  )
  on conflict (publication_id, counter_key, request_kind, window_started_at)
  do update set request_count = counter.request_count + 1,
                updated_at = now_at
  returning counter.request_count into publication_total;

  insert into public.voice_publication_request_windows as counter (
    publication_id, counter_key, request_kind, window_started_at, request_count
  ) values (
    input_publication_id, '*', 'all_day', day_window, 1
  )
  on conflict (publication_id, counter_key, request_kind, window_started_at)
  do update set request_count = counter.request_count + 1,
                updated_at = now_at
  returning counter.request_count into day_total;

  if publication_total = 1 then
    delete from public.voice_publication_request_windows
    where publication_id = input_publication_id
      and window_started_at < now_at - interval '2 days';
  end if;

  if publication_total > 500 then
    open_reason := 'automatic_playback_limit:burst';
  elsif day_total > 5000 then
    open_reason := 'automatic_playback_limit:daily';
  end if;

  if open_reason <> '' then
    update public.voice_publications
    set status = 'disabled',
        disabled_at = now_at,
        disabled_reason = open_reason
    where id = input_publication_id
      and status = 'published';

    return query select false, true, 600, client_total, publication_total, day_total;
    return;
  end if;

  if client_total > client_limit then
    return query select
      false,
      false,
      greatest(1, extract(epoch from (ten_minute_window + interval '10 minutes' - now_at))::integer),
      client_total,
      publication_total,
      day_total;
    return;
  end if;

  return query select true, false, 0, client_total, publication_total, day_total;
end;
$$;

revoke all on function public.register_voice_publication_request(uuid, text, text) from public;
grant execute on function public.register_voice_publication_request(uuid, text, text) to service_role;

comment on function public.register_voice_publication_request(uuid, text, text) is
  '公開Viewerのメタデータ・音声写真・動画を別々に制限し、作品単位の自動停止も行う。';

commit;
