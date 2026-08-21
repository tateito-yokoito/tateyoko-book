begin;

-- 管理画面では呼び名（例: 太郎さん）ではなく、登録済みの姓・名を表示する。
create or replace function public.get_admin_project_display_names(input_project_ids uuid[])
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

  if coalesce(cardinality(input_project_ids), 0) = 0 then
    return '{}'::jsonb;
  end if;

  select coalesce(jsonb_object_agg(
    bp.id::text,
    coalesce(
      nullif(btrim(concat_ws(' ', nullif(subject.family_name, ''), nullif(subject.given_name, ''))), ''),
      nullif(subject.display_name, ''),
      nullif(btrim(concat_ws(' ', nullif(owner_profile.family_name, ''), nullif(owner_profile.given_name, ''))), ''),
      nullif(owner_profile.display_name, ''),
      nullif(regexp_replace(coalesce(subject.preferred_name, ''), '(\s|　)*さん$', ''), ''),
      nullif(bp.title, ''),
      '名称未登録'
    )
  ), '{}'::jsonb)
  into result
  from public.book_projects bp
  left join public.persons subject on subject.id = bp.subject_person_id
  left join public.profiles owner_profile on owner_profile.id = bp.owner_user_id
  where bp.id = any(input_project_ids);

  return result;
end;
$$;

revoke all on function public.get_admin_project_display_names(uuid[]) from public;
grant execute on function public.get_admin_project_display_names(uuid[]) to authenticated;

comment on function public.get_admin_project_display_names(uuid[]) is
  '管理画面の物語一覧・詳細・プレビュー用に、敬称なしの登録氏名をプロジェクトID別で返す。';

commit;
