-- General inquiries are independent from production-support consultations.
create table if not exists public.general_inquiries (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  category text not null check (category in (
    'サービス・料金について', 'ご利用方法について', 'BOOK・Webブックについて',
    'ご注文・お支払いについて', '不具合・エラーについて', 'その他'
  )),
  message text not null check (char_length(message) between 1 and 4000),
  source text not null check (source in ('hp', 'app')),
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'unhandled' check (status in ('unhandled', 'in_progress', 'resolved')),
  admin_note text not null default '' check (char_length(admin_note) <= 4000),
  updated_by uuid references auth.users(id) on delete set null,
  ip_hash text not null,
  admin_email_status text not null default 'pending' check (admin_email_status in ('pending', 'sending', 'sent', 'failed')),
  customer_email_status text not null default 'pending' check (customer_email_status in ('pending', 'sending', 'sent', 'failed')),
  admin_email_attempts integer not null default 0,
  customer_email_attempts integer not null default 0,
  admin_email_error text,
  customer_email_error text,
  admin_email_sent_at timestamptz,
  customer_email_sent_at timestamptz,
  admin_email_claimed_at timestamptz,
  customer_email_claimed_at timestamptz
);

create index if not exists general_inquiries_created_idx on public.general_inquiries (created_at desc);
create index if not exists general_inquiries_status_idx on public.general_inquiries (status, created_at desc);
create index if not exists general_inquiries_ip_idx on public.general_inquiries (ip_hash, created_at desc);
alter table public.general_inquiries enable row level security;
revoke all on public.general_inquiries from public, anon, authenticated;
grant select, insert, update on public.general_inquiries to service_role;

-- Called only by the public Edge Function with the service role. The advisory
-- lock makes the per-IP limit atomic across concurrent requests.
create or replace function public.submit_general_inquiry(
  p_request_key uuid, p_name text, p_email text, p_category text,
  p_message text, p_source text, p_user_id uuid, p_ip_hash text
)
returns table (inquiry_id uuid, accepted_at timestamptz, newly_created boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare result public.general_inquiries%rowtype;
begin
  select * into result from public.general_inquiries where request_key = p_request_key;
  if found then
    return query select result.id, result.created_at, false;
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_ip_hash, 0));
  select * into result from public.general_inquiries where request_key = p_request_key;
  if found then
    return query select result.id, result.created_at, false;
    return;
  end if;
  if (select count(*) from public.general_inquiries
      where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.general_inquiries
    (request_key, name, email, category, message, source, user_id, ip_hash)
  values (p_request_key, p_name, p_email, p_category, p_message, p_source, p_user_id, p_ip_hash)
  on conflict (request_key) do nothing
  returning * into result;
  if found then
    return query select result.id, result.created_at, true;
  else
    select * into result from public.general_inquiries where request_key = p_request_key;
    return query select result.id, result.created_at, false;
  end if;
end;
$$;
revoke all on function public.submit_general_inquiry(uuid,text,text,text,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.submit_general_inquiry(uuid,text,text,text,text,text,uuid,text) to service_role;

-- A single message kind is claimed by one worker at a time. A stale claim
-- can be retried after five minutes if an Edge invocation was interrupted.
create or replace function public.claim_general_inquiry_email(p_id uuid, p_kind text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare affected integer := 0;
begin
  if p_kind = 'admin' then
    update public.general_inquiries set admin_email_status = 'sending',
      admin_email_claimed_at = now(), admin_email_attempts = admin_email_attempts + 1
    where id = p_id and (admin_email_status in ('pending', 'failed')
      or (admin_email_status = 'sending' and admin_email_claimed_at < now() - interval '5 minutes'));
  elsif p_kind = 'customer' then
    update public.general_inquiries set customer_email_status = 'sending',
      customer_email_claimed_at = now(), customer_email_attempts = customer_email_attempts + 1
    where id = p_id and (customer_email_status in ('pending', 'failed')
      or (customer_email_status = 'sending' and customer_email_claimed_at < now() - interval '5 minutes'));
  else
    return false;
  end if;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;
revoke all on function public.claim_general_inquiry_email(uuid,text) from public, anon, authenticated;
grant execute on function public.claim_general_inquiry_email(uuid,text) to service_role;
