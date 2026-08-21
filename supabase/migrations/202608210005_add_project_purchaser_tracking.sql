begin;

-- The person whose story is being recorded and the account that paid for the
-- book are separate concepts. Preserve the purchaser at checkout time so a
-- later ownership change does not rewrite the commercial history.
alter table public.book_projects
  add column if not exists purchaser_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_book_projects_purchaser_user_id
  on public.book_projects(purchaser_user_id)
  where purchaser_user_id is not null;

-- Existing purchased_at values were only written by the authenticated owner
-- checkout flow, so the owner at that time is the best available purchaser.
update public.book_projects
set purchaser_user_id = owner_user_id
where purchaser_user_id is null
  and purchased_at is not null;

create or replace function public.set_book_project_purchaser()
returns trigger
language plpgsql
set search_path = public, auth
as $$
begin
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' and new.purchaser_user_id is not null then
      raise exception 'Purchaser is managed by the payment flow' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.purchaser_user_id is distinct from old.purchaser_user_id then
      raise exception 'Purchaser is managed by the payment flow' using errcode = '42501';
    end if;
  end if;

  if new.purchaser_user_id is null
    and (
      new.purchased_at is not null
      or new.stripe_checkout_session_id is not null
      or new.stripe_payment_intent_id is not null
    ) then
    new.purchaser_user_id := new.owner_user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_book_projects_set_purchaser on public.book_projects;
create trigger trg_book_projects_set_purchaser
before insert or update of purchaser_user_id, purchased_at, stripe_checkout_session_id, stripe_payment_intent_id
on public.book_projects
for each row execute function public.set_book_project_purchaser();

create or replace function public.get_admin_project_purchase(input_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.book_projects where id = input_project_id) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'project_id', bp.id,
    'purchased_at', bp.purchased_at,
    'purchaser_user_id', bp.purchaser_user_id,
    'purchaser_email', purchaser.email,
    'purchaser_name', coalesce(
      nullif(btrim(concat_ws(' ', nullif(profile.family_name, ''), nullif(profile.given_name, ''))), ''),
      nullif(profile.display_name, ''),
      nullif(to_jsonb(profile) ->> 'name', ''),
      nullif(to_jsonb(profile) ->> 'preferred_name', ''),
      purchaser.email,
      '名称未登録'
    )
  )
  into result
  from public.book_projects bp
  left join auth.users purchaser on purchaser.id = bp.purchaser_user_id
  left join public.profiles profile on profile.id = bp.purchaser_user_id
  where bp.id = input_project_id;

  return result;
end;
$$;

revoke all on function public.get_admin_project_purchase(uuid) from public;
grant execute on function public.get_admin_project_purchase(uuid) to authenticated;

comment on column public.book_projects.purchaser_user_id is
  'この物語の購入手続きを行ったアカウント。物語の主体および現在の所有者とは独立して保持する。';

comment on function public.get_admin_project_purchase(uuid) is
  '管理画面の物語詳細用に、購入日と購入者アカウントを返す。';

commit;
