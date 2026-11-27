-- Guard the TEST installation of the bridge that was applied before the
-- family-app allowlist check was added. The original implementation remains
-- private, while its public name now checks the existing release boundary.
alter function public.save_guest_trial_to_ring(text,uuid,smallint)
  rename to save_guest_trial_to_ring_internal;
revoke all on function public.save_guest_trial_to_ring_internal(text,uuid,smallint)
  from public,anon,authenticated;

create function public.save_guest_trial_to_ring(
  input_token_hash text,input_person_id uuid,input_through_slot smallint
) returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
begin
  if auth.uid() is null or not public.family_place_access_allowed() then
    raise exception 'Family app access required' using errcode='42501';
  end if;
  return public.save_guest_trial_to_ring_internal(
    input_token_hash,input_person_id,input_through_slot);
end;
$$;
revoke all on function public.save_guest_trial_to_ring(text,uuid,smallint)
  from public,anon;
grant execute on function public.save_guest_trial_to_ring(text,uuid,smallint)
  to authenticated;
