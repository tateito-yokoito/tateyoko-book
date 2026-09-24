import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const ref = 'zpswxefgfabzvxdbtyvq'; // TEST only
const cli = process.env.QA_SUPABASE_CLI;
assert.ok(cli, 'QA_SUPABASE_CLI is required');
const mode = process.argv[2];
assert.ok(['--dry-run', '--apply', '--refresh-asset', '--refresh-customer', '--align-metadata', '--verify'].includes(mode));
const source = readFileSync('supabase/migrations/202609240004_admin_readonly_customer_view.sql', 'utf8');
const hash = createHash('sha256').update(source).digest('hex');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const query = sql => {
  const raw = execFileSync(cli, ['db', 'query', '--linked', '--project-ref', ref, sql],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 150000 });
  const result = JSON.parse(raw.slice(raw.indexOf('{')));
  assert.ok(!result.error, result.error?.message);
  return result.rows || [];
};
if (mode === '--align-metadata') {
  query(`begin;update supabase_migrations.schema_migrations set statements=array[${literal(source)}]
    where version='202609240004';commit;`);
  console.log(JSON.stringify({mode,ref,hash,metadataAligned:true}));
} else if (mode === '--refresh-customer') {
  const customer = source.slice(source.indexOf('create or replace function public.admin_readonly_shared'),
    source.indexOf('create or replace function public.get_admin_readonly_customer_stories'));
  assert.ok(customer.startsWith('create or replace function') && customer.includes('get_admin_readonly_customer'));
  query(`begin;${customer}commit;`);
  console.log(JSON.stringify({mode,ref,hash,customerRefreshed:true}));
} else if (mode === '--refresh-asset') {
  const asset = source.slice(source.indexOf('create or replace function public.admin_readonly_preview_asset'),
    source.indexOf('revoke all on function public.admin_readonly_preview_asset'));
  assert.ok(asset.startsWith('create or replace function') && asset.includes('returns boolean'));
  query(`begin;${asset}commit;`);
  console.log(JSON.stringify({mode,ref,hash,assetRefreshed:true}));
} else if (mode === '--dry-run' || mode === '--apply') {
  const guard = `do $$begin
    if exists(select 1 from supabase_migrations.schema_migrations where version='202609240004') then
      raise exception 'Migration already applied'; end if;
  end $$;`;
  const body = source.replace(/^begin;\s*$/gm, '').replace(/^commit;\s*$/gm, '');
  const registration = mode === '--apply' ? `insert into supabase_migrations.schema_migrations(version,name,statements)
    values('202609240004','admin_readonly_customer_view',array[${literal(source)}]);` : '';
  const rows = query(`begin; set local lock_timeout='3s'; set local statement_timeout='90s';
    ${guard} ${body} ${registration}
    select jsonb_build_object('customer',to_regprocedure('public.get_admin_readonly_customer(uuid)') is not null,
      'stories',to_regprocedure('public.get_admin_readonly_customer_stories(uuid,uuid)') is not null,
      'preview',to_regprocedure('public.get_admin_readonly_web_preview(uuid)') is not null,
      'asset',to_regprocedure('public.admin_readonly_preview_asset(uuid,text,text)') is not null) as checks;
    ${mode === '--apply' ? 'commit' : 'rollback'};`);
  assert.ok(Object.values(rows[0].checks).every(Boolean));
  console.log(JSON.stringify({ mode, ref, hash, checks: rows[0].checks }));
} else {
  const rows = query(`select jsonb_build_object(
    'migration',exists(select 1 from supabase_migrations.schema_migrations where version='202609240004'),
    'admin_only',not has_function_privilege('anon','public.get_admin_readonly_customer(uuid)','execute'),
    'asset_service_only',not has_function_privilege('authenticated','public.admin_readonly_preview_asset(uuid,text,text)','execute')) as checks;`);
  console.log(JSON.stringify({ mode, ref, hash, checks: rows[0].checks }));
}
