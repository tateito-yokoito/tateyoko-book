-- The customer question screen previously used a fixed 85% shade, regardless
-- of the stored questionDim. Preserve that appearance for every assigned day
-- before allowing the editor to control the shade directly.
update public.daily_sky_catalog
set sky = jsonb_set(sky, '{questionDim}', '0.85'::jsonb, true)
where sky->>'questionDim' is distinct from '0.85';

update public.daily_sky_schedule
set sky_snapshot = jsonb_set(sky_snapshot, '{questionDim}', '0.85'::jsonb, true)
where sky_snapshot->>'questionDim' is distinct from '0.85';

create or replace function public.admin_register_daily_sky(input_id text,input_sky jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if input_id !~ '^sky-[a-z0-9-]{8,80}$' or input_sky->>'id' is distinct from input_id
    or input_sky->>'src' is distinct from '/storage/v1/object/public/daily-skies/'||input_id||'.webp'
    or coalesce((input_sky->>'homeHeightPx')::int,0) <> 260
    or coalesce((input_sky->>'questionDim')::numeric,-1) not between 0 and 1
    or input_sky->>'homeObjectPosition' is null or input_sky->>'questionObjectPosition' is null then
    raise exception 'Invalid sky metadata' using errcode='22023';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='daily-skies' and name=input_id||'.webp') then
    raise exception 'Sky image is not uploaded' using errcode='22023';
  end if;
  insert into public.daily_sky_catalog(id,sky,active,available_on,registered_on)
    values(input_id,input_sky,false,(statement_timestamp() at time zone 'Asia/Tokyo')::date+1,
      (statement_timestamp() at time zone 'Asia/Tokyo')::date);
end $$;
revoke all on function public.admin_register_daily_sky(text,jsonb) from public;
grant execute on function public.admin_register_daily_sky(text,jsonb) to authenticated;

create or replace function public.admin_update_daily_sky_display(input_id text,input_sky jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare previous jsonb; today date := (statement_timestamp() at time zone 'Asia/Tokyo')::date;
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  select sky into previous from public.daily_sky_catalog where id=input_id for update;
  if previous is null then raise exception 'Sky not found' using errcode='22023'; end if;
  if input_sky->>'id' is distinct from input_id or input_sky->>'src' is distinct from previous->>'src'
    or input_sky->>'questionSrc' is distinct from previous->>'questionSrc'
    or coalesce((input_sky->>'homeHeightPx')::int,0) <> 260
    or coalesce((input_sky->>'questionDim')::numeric,-1) not between 0 and 1
    or input_sky->>'homeObjectPosition' is null
    or input_sky->>'questionObjectPosition' is null
    or input_sky->>'homeObjectPosition' !~ '^[0-9]{1,3}% [0-9]{1,3}%$'
    or input_sky->>'questionObjectPosition' !~ '^[0-9]{1,3}% [0-9]{1,3}%$' then
    raise exception 'Invalid sky display metadata' using errcode='22023';
  end if;
  update public.daily_sky_catalog set sky=input_sky where id=input_id;
  -- Normal edits preserve the historical snapshot; the one-time normalization
  -- above only makes its stored value match its already-visible 85% shade.
  update public.daily_sky_schedule set sky_snapshot=input_sky where sky_id=input_id and day>today;
end $$;
revoke all on function public.admin_update_daily_sky_display(text,jsonb) from public;
grant execute on function public.admin_update_daily_sky_display(text,jsonb) to authenticated;
