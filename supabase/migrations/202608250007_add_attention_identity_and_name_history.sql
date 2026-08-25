begin;

-- 配信履歴は事実の記録として変更せず、運営上の確認状態を別テーブルで管理する。
create table if not exists public.admin_attention_items (
  id uuid primary key default gen_random_uuid(),
  book_project_id uuid not null references public.book_projects(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  attention_type text not null,
  severity text not null default 'error' check (severity in ('info', 'warning', 'error')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  title text not null,
  details jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  last_occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_reason text,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index if not exists admin_attention_items_open_project_idx
  on public.admin_attention_items(book_project_id, last_occurred_at desc)
  where status = 'open';

alter table public.admin_attention_items enable row level security;
revoke all on table public.admin_attention_items from public, anon, authenticated;
grant all on table public.admin_attention_items to service_role;

drop trigger if exists admin_attention_items_updated_at on public.admin_attention_items;
create trigger admin_attention_items_updated_at
before update on public.admin_attention_items
for each row execute function public.set_tateyoko_updated_at();

alter table public.question_delivery_logs
  add column if not exists retry_of_delivery_id uuid references public.question_delivery_logs(id) on delete set null;

create index if not exists question_delivery_logs_retry_of_idx
  on public.question_delivery_logs(retry_of_delivery_id)
  where retry_of_delivery_id is not null;

create or replace function public.sync_question_delivery_attention()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  has_successful_sibling boolean := false;
  issue_title text;
begin
  select exists (
    select 1
    from public.question_delivery_logs sibling
    where sibling.user_question_id = new.user_question_id
      and sibling.scheduled_for is not distinct from new.scheduled_for
      and sibling.id <> new.id
      and sibling.delivery_status in ('sent', 'delivered', 'opened', 'answered')
  ) into has_successful_sibling;

  if new.delivery_status = 'failed' then
    issue_title := case when has_successful_sibling then '一部失敗' else '配信失敗' end;

    insert into public.admin_attention_items (
      book_project_id, source_type, source_id, attention_type, severity,
      status, title, details, opened_at, last_occurred_at
    ) values (
      new.book_project_id,
      'question_delivery_log',
      new.id,
      'question_delivery_failed',
      'error',
      'open',
      issue_title,
      jsonb_strip_nulls(jsonb_build_object(
        'delivery_channel', new.delivery_channel,
        'recipient_email', new.recipient_email,
        'recipient_phone', new.recipient_phone,
        'scheduled_for', new.scheduled_for,
        'failed_at', new.failed_at,
        'error_code', new.error_code,
        'error_message', new.error_message
      )),
      coalesce(new.failed_at, new.attempted_at, new.created_at, now()),
      coalesce(new.failed_at, new.attempted_at, new.created_at, now())
    )
    on conflict (source_type, source_id) do update set
      status = 'open',
      title = excluded.title,
      severity = excluded.severity,
      details = excluded.details,
      last_occurred_at = excluded.last_occurred_at,
      resolved_at = null,
      resolved_by = null,
      resolution_reason = null,
      resolution_note = null,
      updated_at = now();
  end if;

  if new.delivery_status in ('sent', 'delivered', 'opened', 'answered') then
    if new.retry_of_delivery_id is not null then
      update public.admin_attention_items
      set
        status = 'resolved',
        resolved_at = now(),
        resolved_by = null,
        resolution_reason = 'retry_succeeded',
        resolution_note = '管理画面からの再送に成功したため自動的に解決しました。',
        updated_at = now()
      where source_type = 'question_delivery_log'
        and source_id = new.retry_of_delivery_id
        and status = 'open';
    end if;

    update public.admin_attention_items attention
    set title = '一部失敗', updated_at = now()
    where attention.source_type = 'question_delivery_log'
      and attention.status = 'open'
      and attention.source_id in (
        select failed.id
        from public.question_delivery_logs failed
        where failed.user_question_id = new.user_question_id
          and failed.scheduled_for is not distinct from new.scheduled_for
          and failed.delivery_status = 'failed'
      );
  end if;

  return new;
end;
$$;

drop trigger if exists question_delivery_attention_sync on public.question_delivery_logs;
create trigger question_delivery_attention_sync
after insert or update of delivery_status on public.question_delivery_logs
for each row execute function public.sync_question_delivery_attention();

-- 既存の失敗も要対応へ載せる。履歴自体の状態は変更しない。
insert into public.admin_attention_items (
  book_project_id, source_type, source_id, attention_type, severity,
  status, title, details, opened_at, last_occurred_at
)
select
  failed.book_project_id,
  'question_delivery_log',
  failed.id,
  'question_delivery_failed',
  'error',
  'open',
  case when exists (
    select 1 from public.question_delivery_logs sibling
    where sibling.user_question_id = failed.user_question_id
      and sibling.scheduled_for is not distinct from failed.scheduled_for
      and sibling.id <> failed.id
      and sibling.delivery_status in ('sent', 'delivered', 'opened', 'answered')
  ) then '一部失敗' else '配信失敗' end,
  jsonb_strip_nulls(jsonb_build_object(
    'delivery_channel', failed.delivery_channel,
    'recipient_email', failed.recipient_email,
    'recipient_phone', failed.recipient_phone,
    'scheduled_for', failed.scheduled_for,
    'failed_at', failed.failed_at,
    'error_code', failed.error_code,
    'error_message', failed.error_message
  )),
  coalesce(failed.failed_at, failed.attempted_at, failed.created_at),
  coalesce(failed.failed_at, failed.attempted_at, failed.created_at)
from public.question_delivery_logs failed
where failed.delivery_status = 'failed'
on conflict (source_type, source_id) do nothing;

create or replace function public.resolve_admin_attention_item(
  input_attention_id uuid,
  input_reason text,
  input_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_reason text := lower(btrim(coalesce(input_reason, '')));
  resolved public.admin_attention_items;
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if normalized_reason not in ('system_fixed', 'contacted_elsewhere', 'no_action_needed') then
    raise exception 'Invalid resolution reason' using errcode = '22023';
  end if;

  update public.admin_attention_items
  set
    status = 'resolved',
    resolved_at = now(),
    resolved_by = auth.uid(),
    resolution_reason = normalized_reason,
    resolution_note = nullif(btrim(coalesce(input_note, '')), ''),
    updated_at = now()
  where id = input_attention_id
    and status = 'open'
  returning * into resolved;

  if resolved.id is null then
    raise exception 'Open attention item not found' using errcode = 'P0002';
  end if;

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'resolve_attention', 'admin_attention_item', resolved.id,
    jsonb_strip_nulls(jsonb_build_object(
      'book_project_id', resolved.book_project_id,
      'reason', normalized_reason,
      'note', nullif(btrim(coalesce(input_note, '')), '')
    ))
  );

  return to_jsonb(resolved);
end;
$$;

revoke all on function public.resolve_admin_attention_item(uuid, text, text) from public;
grant execute on function public.resolve_admin_attention_item(uuid, text, text) to authenticated;

-- 再送ワーカーが必要とする最小情報だけをservice roleへ返す。
create or replace function public.get_admin_retry_question_delivery_for_worker(input_delivery_id uuid)
returns table (
  notification_schedule_id uuid,
  user_id uuid,
  book_project_id uuid,
  email text,
  phone_number text,
  user_name text,
  user_question_id uuid,
  question_id text,
  sequence_order integer,
  question_text text,
  scheduled_for timestamptz,
  email_enabled boolean,
  sms_enabled boolean,
  delivery_channel text,
  question_url text
)
language sql
security definer
set search_path = public, auth
as $$
  select
    null::uuid,
    qdl.recipient_user_id,
    qdl.book_project_id,
    coalesce(qdl.recipient_email, profile.email, account.email),
    coalesce(qdl.recipient_phone, preference.phone_number),
    coalesce(profile.preferred_name, profile.display_name, profile.name, 'あなた'),
    qdl.user_question_id,
    uq.question_id::text,
    uq.sequence_order,
    coalesce(uq.custom_question_text, uq.question_text_snapshot, question.content, ''),
    date_trunc('minute', now()),
    qdl.delivery_channel = 'email',
    qdl.delivery_channel = 'sms',
    qdl.delivery_channel,
    qdl.metadata ->> 'question_url'
  from public.question_delivery_logs qdl
  left join public.user_questions uq on uq.id = qdl.user_question_id
  left join public.questions question on question.id = uq.question_id
  left join public.profiles profile on profile.id = qdl.recipient_user_id
  left join auth.users account on account.id = qdl.recipient_user_id
  left join public.notification_preferences preference on preference.user_id = qdl.recipient_user_id
  where qdl.id = input_delivery_id
    and qdl.delivery_status = 'failed'
    and qdl.delivery_channel in ('email', 'sms');
$$;

revoke all on function public.get_admin_retry_question_delivery_for_worker(uuid) from public, anon, authenticated;
grant execute on function public.get_admin_retry_question_delivery_for_worker(uuid) to service_role;

-- 既存ダッシュボードの判定を保持したまま、運営対応を統合する。
alter function public.get_admin_dashboard(text, integer)
  rename to get_admin_dashboard_without_delivery_attention;

revoke all on function public.get_admin_dashboard_without_delivery_attention(text, integer)
  from public, anon, authenticated;

create or replace function public.get_admin_dashboard(
  input_search text default null,
  input_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  base_result jsonb;
  merged_projects jsonb := '[]'::jsonb;
  merged_attention jsonb := '[]'::jsonb;
  old_attention_ids uuid[] := '{}'::uuid[];
  additional_attention_count integer := 0;
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  base_result := public.get_admin_dashboard_without_delivery_attention(input_search, input_limit);

  select coalesce(array_agg((item ->> 'id')::uuid), '{}'::uuid[])
  into old_attention_ids
  from jsonb_array_elements(coalesce(base_result -> 'attention', '[]'::jsonb)) item;

  with issue_stats as (
    select
      ai.book_project_id,
      count(*)::integer as attention_item_count,
      count(*) filter (where ai.attention_type = 'question_delivery_failed')::integer as delivery_failure_count,
      case when bool_or(ai.title = '配信失敗') then '配信失敗' else '一部失敗' end as attention_reason,
      case when bool_or(ai.severity = 'error') then 'error' else 'warning' end as health_status
    from public.admin_attention_items ai
    where ai.status = 'open'
    group by ai.book_project_id
  ), rows as (
    select
      project.value || jsonb_strip_nulls(jsonb_build_object(
        'attention_item_count', stats.attention_item_count,
        'delivery_failure_count', stats.delivery_failure_count,
        'attention_reason', coalesce(nullif(project.value ->> 'attention_reason', ''), stats.attention_reason),
        'health_status', case
          when coalesce(project.value ->> 'health_status', 'ok') <> 'ok' then project.value ->> 'health_status'
          else stats.health_status
        end
      )) as value
    from jsonb_array_elements(coalesce(base_result -> 'projects', '[]'::jsonb)) project
    left join issue_stats stats on stats.book_project_id = (project.value ->> 'id')::uuid
  )
  select coalesce(jsonb_agg(value order by value ->> 'last_activity_at' desc), '[]'::jsonb)
  into merged_projects
  from rows;

  select coalesce(jsonb_agg(project order by
    case project ->> 'health_status' when 'error' then 1 when 'warning' then 2 else 3 end,
    project ->> 'last_activity_at' desc
  ), '[]'::jsonb)
  into merged_attention
  from jsonb_array_elements(merged_projects) project
  where nullif(project ->> 'attention_reason', '') is not null;

  select count(distinct ai.book_project_id)::integer
  into additional_attention_count
  from public.admin_attention_items ai
  where ai.status = 'open'
    and not (ai.book_project_id = any(old_attention_ids));

  base_result := jsonb_set(base_result, '{projects}', merged_projects, true);
  base_result := jsonb_set(base_result, '{attention}', merged_attention, true);
  base_result := jsonb_set(
    base_result,
    '{metrics,attention_count}',
    to_jsonb(coalesce((base_result #>> '{metrics,attention_count}')::integer, 0) + additional_attention_count),
    true
  );

  return base_result;
end;
$$;

revoke all on function public.get_admin_dashboard(text, integer) from public;
grant execute on function public.get_admin_dashboard(text, integer) to authenticated;

-- 物語詳細に未解決の運営対応を付加する。
alter function public.get_admin_project_detail(uuid)
  rename to get_admin_project_detail_without_attention;

revoke all on function public.get_admin_project_detail_without_attention(uuid)
  from public, anon, authenticated;

create or replace function public.get_admin_project_detail(input_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  base_result jsonb;
  attention_items jsonb;
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  base_result := public.get_admin_project_detail_without_attention(input_project_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ai.id,
    'source_type', ai.source_type,
    'source_id', ai.source_id,
    'attention_type', ai.attention_type,
    'severity', ai.severity,
    'status', ai.status,
    'title', ai.title,
    'details', ai.details,
    'opened_at', ai.opened_at,
    'last_occurred_at', ai.last_occurred_at,
    'delivery_channel', qdl.delivery_channel,
    'recipient_email', qdl.recipient_email,
    'recipient_phone', qdl.recipient_phone,
    'error_code', qdl.error_code,
    'error_message', qdl.error_message,
    'scheduled_for', qdl.scheduled_for,
    'question_text', coalesce(uq.custom_question_text, uq.question_text_snapshot, question.content, '')
  ) order by ai.last_occurred_at desc), '[]'::jsonb)
  into attention_items
  from public.admin_attention_items ai
  left join public.question_delivery_logs qdl
    on ai.source_type = 'question_delivery_log' and qdl.id = ai.source_id
  left join public.user_questions uq on uq.id = qdl.user_question_id
  left join public.questions question on question.id = uq.question_id
  where ai.book_project_id = input_project_id
    and ai.status = 'open';

  return base_result || jsonb_build_object('attention_items', attention_items);
end;
$$;

revoke all on function public.get_admin_project_detail(uuid) from public;
grant execute on function public.get_admin_project_detail(uuid) to authenticated;

-- アカウント名変更は利用アカウントだけに限定し、物語の主体は変更しない。
create table if not exists public.profile_name_change_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_family_name text,
  previous_given_name text,
  previous_display_name text,
  new_family_name text not null,
  new_given_name text not null,
  new_display_name text not null,
  changed_at timestamptz not null default now()
);

create index if not exists profile_name_change_logs_user_changed_idx
  on public.profile_name_change_logs(user_id, changed_at desc);

alter table public.profile_name_change_logs enable row level security;
revoke all on table public.profile_name_change_logs from public, anon, authenticated;
grant all on table public.profile_name_change_logs to service_role;

create or replace function public.update_own_profile_name(input_family_name text, input_given_name text)
returns table (family_name text, given_name text, display_name text, preferred_name text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  f text := btrim(coalesce(input_family_name, ''));
  g text := btrim(coalesce(input_given_name, ''));
  d text;
  previous public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if f = '' or g = '' then
    raise exception 'Family name and given name are required' using errcode = '22023';
  end if;

  d := f || ' ' || g;
  select * into previous from public.profiles where id = auth.uid() for update;
  if previous.id is null then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if previous.family_name is not distinct from f
    and previous.given_name is not distinct from g
    and previous.display_name is not distinct from d then
    return query select f, g, d, g || 'さん';
    return;
  end if;

  insert into public.profile_name_change_logs (
    user_id, previous_family_name, previous_given_name, previous_display_name,
    new_family_name, new_given_name, new_display_name
  ) values (
    auth.uid(), previous.family_name, previous.given_name, previous.display_name,
    f, g, d
  );

  update public.profiles
  set family_name = f, given_name = g, display_name = d, preferred_name = g || 'さん'
  where id = auth.uid();

  insert into public.activity_logs (
    actor_user_id, subject_user_id, action, entity_type, entity_id,
    source, outcome, metadata
  ) values (
    auth.uid(), auth.uid(), 'account_name_changed', 'account', auth.uid(),
    'app', 'success', jsonb_build_object(
      'previous_display_name', previous.display_name,
      'new_display_name', d
    )
  );

  return query select f, g, d, g || 'さん';
end;
$$;

revoke all on function public.update_own_profile_name(text, text) from public;
grant execute on function public.update_own_profile_name(text, text) to authenticated;

-- 注文時点の購入者表示を固定し、後日のプロフィール変更で過去注文を改名しない。
alter table public.commerce_orders
  add column if not exists purchaser_name_snapshot text,
  add column if not exists purchaser_email_snapshot text;

create or replace function public.set_commerce_order_purchaser_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  snapshot_name text;
  snapshot_email text;
begin
  if new.purchaser_user_id is not null
    and (new.purchaser_name_snapshot is null or new.purchaser_email_snapshot is null) then
    select
      coalesce(
        nullif(btrim(concat_ws(' ', nullif(profile.family_name, ''), nullif(profile.given_name, ''))), ''),
        nullif(profile.display_name, ''),
        nullif(to_jsonb(profile) ->> 'name', ''),
        account.email,
        '名称未登録'
      ),
      account.email
    into snapshot_name, snapshot_email
    from auth.users account
    left join public.profiles profile on profile.id = account.id
    where account.id = new.purchaser_user_id;

    new.purchaser_name_snapshot := coalesce(new.purchaser_name_snapshot, snapshot_name);
    new.purchaser_email_snapshot := coalesce(new.purchaser_email_snapshot, snapshot_email);
  end if;
  return new;
end;
$$;

drop trigger if exists commerce_orders_purchaser_snapshot on public.commerce_orders;
create trigger commerce_orders_purchaser_snapshot
before insert or update of purchaser_user_id on public.commerce_orders
for each row execute function public.set_commerce_order_purchaser_snapshot();

update public.commerce_orders order_row
set
  purchaser_name_snapshot = coalesce(order_row.purchaser_name_snapshot, source.name),
  purchaser_email_snapshot = coalesce(order_row.purchaser_email_snapshot, source.email)
from (
  select
    commerce.id,
    coalesce(
      nullif(btrim(concat_ws(' ', nullif(profile.family_name, ''), nullif(profile.given_name, ''))), ''),
      nullif(profile.display_name, ''),
      nullif(to_jsonb(profile) ->> 'name', ''),
      account.email,
      '名称未登録'
    ) as name,
    account.email
  from public.commerce_orders commerce
  left join auth.users account on account.id = commerce.purchaser_user_id
  left join public.profiles profile on profile.id = commerce.purchaser_user_id
) source
where source.id = order_row.id
  and (order_row.purchaser_name_snapshot is null or order_row.purchaser_email_snapshot is null);

create or replace function public.get_admin_commerce_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  select jsonb_build_object(
    'products', (select coalesce(jsonb_agg(to_jsonb(p) order by p.product_code), '[]'::jsonb) from public.commerce_products p),
    'campaigns', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb) from public.discount_campaigns c),
    'codes', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb) from public.discount_codes c),
    'orders', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from (
      select o.*,
        coalesce(o.purchaser_name_snapshot, nullif(btrim(concat_ws(' ', p.family_name, p.given_name)), ''), p.display_name, u.email) purchaser_name,
        coalesce(o.purchaser_email_snapshot, u.email) purchaser_email,
        dc.code discount_code, d.name campaign_name,
        concat_ws(' ＋ ',
          case when o.includes_base_book then '基本パッケージ（スタンダード冊子1冊）' end,
          case when o.standard_extra_copy_count > 0 then 'スタンダード冊子 増刷' || o.standard_extra_copy_count || '冊' end,
          case when o.premium_copy_count > 0 then 'プレミアム冊子 ' || o.premium_copy_count || '冊' end,
          case when o.gift_package_selected then 'ギフトパッケージ' end
        ) item_summary
      from public.commerce_orders o
      left join auth.users u on u.id = o.purchaser_user_id
      left join public.profiles p on p.id = o.purchaser_user_id
      left join public.discount_codes dc on dc.id = o.discount_code_id
      left join public.discount_campaigns d on d.id = dc.campaign_id
      order by o.created_at desc limit 500
    ) x),
    'gifts', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from (
      select g.*, o.order_number, o.purchaser_user_id, o.amount_total, o.status order_status
      from public.gift_orders g join public.commerce_orders o on o.id = g.commerce_order_id
      order by g.created_at desc limit 500
    ) x)
  ) into result;
  return result;
end;
$$;

create or replace function public.get_admin_project_purchase(input_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.book_projects where id = input_project_id) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'project_id', bp.id,
    'purchased_at', coalesce(commerce.purchased_at, bp.purchased_at),
    'purchaser_user_id', coalesce(commerce.purchaser_user_id, bp.purchaser_user_id),
    'purchaser_email', coalesce(commerce.purchaser_email_snapshot, purchaser.email),
    'purchaser_name', coalesce(
      commerce.purchaser_name_snapshot,
      nullif(btrim(concat_ws(' ', nullif(profile.family_name, ''), nullif(profile.given_name, ''))), ''),
      nullif(profile.display_name, ''),
      nullif(to_jsonb(profile) ->> 'name', ''),
      purchaser.email,
      '名称未登録'
    )
  ) into result
  from public.book_projects bp
  left join public.commerce_orders commerce on commerce.id = bp.commerce_order_id
  left join auth.users purchaser on purchaser.id = coalesce(commerce.purchaser_user_id, bp.purchaser_user_id)
  left join public.profiles profile on profile.id = purchaser.id
  where bp.id = input_project_id;

  return result;
end;
$$;

revoke all on function public.get_admin_commerce_dashboard() from public;
grant execute on function public.get_admin_commerce_dashboard() to authenticated;
revoke all on function public.get_admin_project_purchase(uuid) from public;
grant execute on function public.get_admin_project_purchase(uuid) to authenticated;

commit;
