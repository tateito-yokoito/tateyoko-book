-- Post-deployment verification, through the admin CLI only. Read-only transaction;
-- no names, email addresses, narration content, or identifiers in the output.
begin read only;
do $$
begin
  perform set_config('request.jwt.claim.sub', (
    select user_id::text from public.admin_users where is_active order by user_id limit 1
  ), true);
end;
$$;
with snapshot as materialized (
  select public.get_admin_account_impacts(array(select id from auth.users order by id limit 250)) as data
), accounts as (
  select key as account_id, value as impact from snapshot, lateral jsonb_each(data)
), projects as (
  select account_id, project from accounts, lateral jsonb_array_elements(impact -> 'projects') project
)
select
  (select count(*) from accounts) as checked_accounts,
  count(*) as checked_relationships,
  count(*) filter (where (project ->> 'hidden')::boolean) as hidden_relationships_included,
  coalesce(bool_and((project ->> 'answer_count')::bigint = (
    select count(*) from public.answers a where a.book_project_id = (project ->> 'id')::uuid
  )), true) as answer_counts_match,
  coalesce(bool_and((project ->> 'video_count')::bigint = (
    select count(*) from public.video_stories v where v.book_project_id = (project ->> 'id')::uuid
  )), true) as video_counts_match,
  coalesce(bool_and((project ->> 'publication_count')::bigint = (
    select count(*) from public.voice_publications v where v.book_project_id = (project ->> 'id')::uuid and v.status = 'published'
  )), true) as publication_counts_match,
  count(*) = count(distinct (account_id, project ->> 'id')) as no_duplicate_projects,
  (select bool_and((impact ->> 'is_admin')::boolean = exists (
    select 1 from public.admin_users au where au.user_id = account_id::uuid and au.is_active
  )) from accounts) as admin_protection_matches
from projects;
rollback;
