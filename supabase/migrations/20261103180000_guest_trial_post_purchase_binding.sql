-- Bind a completed guest trial to one unpaid, owned story before checkout.
-- Copy its answers only after a new, paid self order for that exact story.
alter table public.guest_trial_sessions
  add column purchase_bound_user_id uuid references auth.users(id),
  add column purchase_bound_project_id uuid references public.book_projects(id),
  add column purchase_bound_at timestamptz,
  add constraint guest_trial_purchase_binding_complete check (
    (purchase_bound_user_id is null and purchase_bound_project_id is null and purchase_bound_at is null)
    or (purchase_bound_user_id is not null and purchase_bound_project_id is not null and purchase_bound_at is not null)
  );

alter function public.claim_guest_trial_before_purchase(text,uuid,uuid,jsonb)
  rename to claim_guest_trial_copy_internal;
revoke all on function public.claim_guest_trial_copy_internal(text,uuid,uuid,jsonb)
  from public,anon,authenticated;

create function public.claim_guest_trial_before_purchase(
  input_token_hash text, input_user_id uuid, input_project_id uuid,
  input_audio_paths jsonb
) returns jsonb language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare trial public.guest_trial_sessions%rowtype;
begin
  select * into trial from public.guest_trial_sessions
    where token_hash=input_token_hash for update;
  if trial.id is null or trial.purchase_bound_user_id is distinct from input_user_id
    or trial.purchase_bound_project_id is distinct from input_project_id
    or trial.purchase_bound_at is null
  then raise exception 'No matching purchase binding' using errcode='42501'; end if;
  if not exists (
    select 1 from public.commerce_orders o
    where o.purchaser_user_id=input_user_id and o.book_project_id=input_project_id
      and o.order_type='self' and o.status in ('paid','zero_paid')
      and o.purchased_at >= trial.purchase_bound_at
  ) then raise exception 'A new paid order is required' using errcode='55000'; end if;
  return public.claim_guest_trial_copy_internal(
    input_token_hash,input_user_id,input_project_id,input_audio_paths);
end;
$$;
revoke all on function public.claim_guest_trial_before_purchase(text,uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.claim_guest_trial_before_purchase(text,uuid,uuid,jsonb)
  to service_role;
