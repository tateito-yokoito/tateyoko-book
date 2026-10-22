begin;

create or replace function public.list_runnable_book_production_jobs(input_limit integer default 1)
returns table(order_id uuid) language sql security definer set search_path=public as $$
  select j.order_id from public.book_production_jobs j
  where j.attempts < 5 and j.stage <> 'snapshot_conflict' and (
    j.state in ('queued','error') or (j.state='running' and j.lease_until < now()))
  order by j.created_at limit least(greatest(input_limit,1),5);
$$;
revoke all on function public.list_runnable_book_production_jobs(integer) from public,anon,authenticated;
grant execute on function public.list_runnable_book_production_jobs(integer) to service_role;

-- Vault values are installed during rollout. Until then the cron remains a
-- cheap no-op, and no service credential is stored in source control.
create or replace function public.dispatch_book_production_sweep()
returns void language plpgsql security definer set search_path=public,vault,net as $$
declare
  project_url text;
  service_key text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets
    where name='book_production_project_url' limit 1;
  select decrypted_secret into service_key from vault.decrypted_secrets
    where name='book_production_service_key' limit 1;
  if project_url is null or service_key is null then return; end if;
  perform net.http_post(
    url:=rtrim(project_url,'/') || '/functions/v1/book-production-sweep',
    headers:=jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer ' || service_key,'apikey',service_key),
    body:='{}'::jsonb,
    timeout_milliseconds:=130000
  );
end; $$;
revoke all on function public.dispatch_book_production_sweep() from public,anon,authenticated;

do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron')
    and exists(select 1 from pg_extension where extname='pg_net') then
    perform cron.schedule('book-production-sweep-5min','*/5 * * * *',
      'select public.dispatch_book_production_sweep()');
  end if;
end $$;

commit;
