begin;

-- Keep the profile email change and the lifecycle/trash records in one
-- database transaction. Auth is changed immediately before this RPC and is
-- rolled back by the Edge Function if this transaction fails.
create or replace function public.complete_admin_account_retirement(
  input_actor_id uuid,
  input_account_id uuid,
  input_original_email text,
  input_tombstone_email text,
  input_snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.profiles
  set email = lower(btrim(input_tombstone_email))
  where id = input_account_id;

  perform public.finalize_admin_account_retirement(
    input_actor_id,
    input_account_id,
    input_original_email,
    input_tombstone_email,
    input_snapshot
  );
end;
$$;

create or replace function public.complete_admin_account_restore(
  input_actor_id uuid,
  input_account_id uuid,
  input_restore_email text,
  input_original_email text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.profiles
  set email = lower(btrim(input_restore_email))
  where id = input_account_id;

  perform public.finalize_admin_account_restore(
    input_actor_id,
    input_account_id,
    input_restore_email,
    input_original_email
  );
end;
$$;

revoke all on function public.complete_admin_account_retirement(uuid, uuid, text, text, jsonb) from public;
revoke all on function public.complete_admin_account_restore(uuid, uuid, text, text) from public;

grant execute on function public.complete_admin_account_retirement(uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.complete_admin_account_restore(uuid, uuid, text, text) to service_role;

comment on function public.complete_admin_account_retirement(uuid, uuid, text, text, jsonb) is
  'プロフィールのメール置換、退役台帳、所有物語の連動非表示を1トランザクションで確定する。';

comment on function public.complete_admin_account_restore(uuid, uuid, text, text) is
  'プロフィールのメール復旧、退役解除、連動非表示物語の復旧を1トランザクションで確定する。';

commit;
