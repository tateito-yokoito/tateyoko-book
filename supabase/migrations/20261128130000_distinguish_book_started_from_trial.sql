-- A trial project is created during free onboarding. It is not a started BOOK.
create or replace function public.guest_trial_book_started()
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
