-- The existing purchase handoff can resume on another device without the
-- original browser token. Only the verified claim Edge Function uses this
-- service-role wrapper; the underlying link still checks the claimed owner,
-- project and person before creating an idempotent connection.
create function public.link_guest_trial_ring_book_service(
  input_token_hash text,input_user_id uuid,input_project_id uuid
) returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
begin
  if input_user_id is null then
    raise exception 'Account required' using errcode='42501';
  end if;
  perform set_config('request.jwt.claim.sub',input_user_id::text,true);
  return public.link_guest_trial_ring_book(input_token_hash,input_project_id);
end;
$$;
revoke all on function public.link_guest_trial_ring_book_service(text,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.link_guest_trial_ring_book_service(text,uuid,uuid)
  to service_role;
