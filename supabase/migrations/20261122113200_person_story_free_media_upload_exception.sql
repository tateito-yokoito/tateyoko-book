-- A paid owner can still upload an independent free Person-story recording.
-- Keep the existing contract gate for every other unassociated file.
begin;

create or replace function public.experience_storage_allowed(
  input_bucket text,input_name text,input_write boolean
) returns boolean language plpgsql stable security definer
set search_path=public,auth as $$
declare pid uuid; segment text:=split_part(input_name,'/',2);
begin
  if input_bucket not in ('audio','photos','videos') or input_name like 'published/%' then return true; end if;
  select coalesce(m.book_project_id,a.book_project_id) into pid
  from public.media_assets m left join public.answers a on a.id=m.answer_id
  where m.storage_path=input_name limit 1;
  if pid is null and segment ~ '^[0-9a-fA-F-]{36}$' then
    select id into pid from public.book_projects where id=segment::uuid;
    if pid is null then select book_project_id into pid
      from public.answers where id=segment::uuid; end if;
  end if;
  if pid is null and segment='introductions'
    and split_part(input_name,'/',3) ~ '^[0-9a-fA-F-]{36}$' then
    select book_project_id into pid from public.project_introductions
      where id=split_part(input_name,'/',3)::uuid;
  end if;
  if pid is not null then return public.experience_data_allowed(pid,input_write); end if;
  if input_write and input_bucket in ('photos','audio')
    and split_part(input_name,'/',1)=auth.uid()::text
    and segment ~ '^[0-9a-fA-F-]{36}$'
    and exists(select 1 from public.family_free_stories s
      where s.id=segment::uuid and s.created_by=auth.uid()
        and public.family_free_story_can_write(s.id)) then
    return true;
  end if;
  -- Existing paid-contract boundary remains intact for other new paths.
  if input_write and exists(select 1 from public.experience_contracts c
    join public.book_projects p on p.id=c.book_project_id
    where p.owner_user_id=auth.uid() and c.payment_confirmed_at is not null) then
    return false;
  end if;
  return true;
end;
$$;

commit;
