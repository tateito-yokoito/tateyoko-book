begin;

-- One read-only snapshot for the list, account detail and retirement confirmation.
-- Aggregate each resource independently: joining recipients/media/answers would
-- multiply counts. Hidden projects deliberately remain in the result.
create or replace function public.get_admin_account_impacts(input_account_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
  names jsonb;
  project_ids uuid[];
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if coalesce(cardinality(input_account_ids), 0) > 250 then
    raise exception 'At most 250 accounts may be requested';
  end if;

  select array_agg(bp.id) into project_ids
  from public.book_projects bp
  where bp.owner_user_id = any(input_account_ids)
    or bp.purchaser_user_id = any(input_account_ids)
    or exists (select 1 from public.project_supporters ps
      where ps.book_project_id = bp.id and ps.supporter_user_id = any(input_account_ids) and ps.status = 'active');
  names := public.get_admin_project_display_names(project_ids);

  with project_stats as materialized (
    select bp.id, bp.owner_user_id, bp.purchaser_user_id,
      coalesce(names ->> bp.id::text, bp.title, '名称未登録') as name,
      bp.access_status,
      exists (select 1 from public.admin_trash_entries t
        where t.entity_type = 'book_project' and t.entity_id = bp.id) as hidden,
      (select count(*) from public.answers a where a.book_project_id = bp.id) as answer_count,
      (select count(*) from public.answers a join public.user_questions uq on uq.id = a.user_question_id
        where a.book_project_id = bp.id and uq.meta_json ->> 'question_role' = 'starting_conversation') as starting_count,
      (select coalesce(sum(greatest(parts.n - 1, 0)), 0) from (
        select count(*) as n from public.media_assets m
        where m.book_project_id = bp.id and m.asset_type = 'audio' and m.answer_id is not null
        group by m.answer_id
      ) parts) as addition_count,
      (select count(*) from public.video_stories v where v.book_project_id = bp.id) as video_count,
      (select count(*) from public.voice_publications v where v.book_project_id = bp.id and v.status = 'published') as publication_count,
      (select count(*) from public.project_supporters ps where ps.book_project_id = bp.id and ps.status = 'active') as supporter_count,
      (select count(*) from public.story_share_recipients r
        join public.story_sharing_preferences sp on sp.id = r.sharing_preference_id
        where sp.book_project_id = bp.id and r.status in ('active', 'pending')) as sharing_count,
      (select count(*) from public.project_introductions i where i.book_project_id = bp.id
        and (nullif(btrim(i.body_text), '') is not null or i.generation_status = 'generated')) as introduction_count,
      (select coalesce(sum(case when jsonb_typeof(i.meta_json -> 'additional_audio') = 'array'
        then jsonb_array_length(i.meta_json -> 'additional_audio') else 0 end), 0)
        from public.project_introductions i where i.book_project_id = bp.id) as introduction_addition_count
    from public.book_projects bp where bp.id = any(project_ids)
  ), account_stats as (
    select u.id,
      exists (select 1 from public.admin_users au where au.user_id = u.id and au.is_active) as is_admin,
      coalesce(u.banned_until > now(), false) as is_suspended,
      coalesce((select jsonb_agg(to_jsonb(p) - 'owner_user_id' - 'purchaser_user_id' || jsonb_build_object(
        'roles', array_remove(array[
          case when p.owner_user_id = u.id then 'owner' end,
          case when p.purchaser_user_id = u.id then 'purchaser' end,
          case when exists (select 1 from public.project_supporters ps where ps.book_project_id = p.id
            and ps.supporter_user_id = u.id and ps.status = 'active') then 'supporter' end
        ], null)
      ) order by p.name, p.id) from project_stats p
      where p.owner_user_id = u.id or p.purchaser_user_id = u.id
        or exists (select 1 from public.project_supporters ps where ps.book_project_id = p.id
          and ps.supporter_user_id = u.id and ps.status = 'active')), '[]'::jsonb) as projects
    from auth.users u where u.id = any(input_account_ids)
  )
  select coalesce(jsonb_object_agg(s.id::text, to_jsonb(s) - 'id'), '{}'::jsonb)
  into result from account_stats s;
  return result;
end;
$$;

revoke all on function public.get_admin_account_impacts(uuid[]) from public, anon;
grant execute on function public.get_admin_account_impacts(uuid[]) to authenticated;

comment on function public.get_admin_account_impacts(uuid[]) is
  'Admin-only account impact snapshot. Answers include starting conversations; additions count audio parts after the first per answer. Sharing counts recipient settings, not unique people. No content or media URLs returned.';

commit;
