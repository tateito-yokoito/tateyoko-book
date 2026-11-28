-- The free three-question save belongs to accounts that have not started a BOOK.
-- Once a BOOK exists, stories are added and edited from the family app's ring.
create function public.guest_trial_book_started()
returns boolean language plpgsql security definer
set search_path=public,auth,pg_temp as $$
begin
  if auth.uid() is null or not public.family_place_access_allowed() then
    raise exception 'Family app access required' using errcode='42501';
  end if;
  return exists(select 1 from public.book_projects p
    where p.owner_user_id=auth.uid() and (
      p.access_status in ('paid','gifted','legacy')
      or (p.access_status='refunded' and p.onboarding_status in ('in_progress','completed'))));
end;
$$;
revoke all on function public.guest_trial_book_started() from public,anon;
grant execute on function public.guest_trial_book_started() to authenticated;

create or replace function public.save_guest_trial_to_ring(
  input_token_hash text,input_person_id uuid,input_through_slot smallint
) returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
begin
  if auth.uid() is null or not public.family_place_access_allowed() then
    raise exception 'Family app access required' using errcode='42501';
  end if;
  if public.guest_trial_book_started() then
    raise exception 'BOOK already started; use the family ring' using errcode='55000';
  end if;
  return public.save_guest_trial_to_ring_internal(
    input_token_hash,input_person_id,input_through_slot);
end;
$$;
revoke all on function public.save_guest_trial_to_ring(text,uuid,smallint)
  from public,anon;
grant execute on function public.save_guest_trial_to_ring(text,uuid,smallint)
  to authenticated;

alter function public.replace_guest_trial_ring_stories(text,uuid)
  rename to replace_guest_trial_ring_stories_internal;
revoke all on function public.replace_guest_trial_ring_stories_internal(text,uuid)
  from public,anon,authenticated;

create function public.replace_guest_trial_ring_stories(
  input_token_hash text,input_person_id uuid
) returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
begin
  if auth.uid() is null or not public.family_place_access_allowed() then
    raise exception 'Family app access required' using errcode='42501';
  end if;
  if public.guest_trial_book_started() then
    raise exception 'BOOK already started; use the family ring' using errcode='55000';
  end if;
  return public.replace_guest_trial_ring_stories_internal(
    input_token_hash,input_person_id);
end;
$$;
revoke all on function public.replace_guest_trial_ring_stories(text,uuid)
  from public,anon;
grant execute on function public.replace_guest_trial_ring_stories(text,uuid)
  to authenticated;
