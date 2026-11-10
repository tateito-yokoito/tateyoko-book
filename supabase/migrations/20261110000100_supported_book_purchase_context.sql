-- The supported-project list deliberately omits commerce fields. Load the
-- minimum purchase context only for someone already allowed to manage BOOK.
create or replace function public.get_supported_book_purchase_context(input_book_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $function$
declare
  target_project public.book_projects%rowtype;
begin
  if auth.uid() is null
    or public.can_manage_book_cover(input_book_project_id) is distinct from true
    or public.experience_data_allowed(input_book_project_id, false) is distinct from true then
    raise exception 'この作品のBOOKを開けません' using errcode = '42501';
  end if;

  select * into target_project from public.book_projects
  where id = input_book_project_id and status = 'active';
  if not found then
    raise exception '作品が見つかりません' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'purchased_edition_v2', to_jsonb(target_project)->>'purchased_edition_v2',
    'production_method_v2', to_jsonb(target_project)->>'production_method_v2',
    'access_status', target_project.access_status,
    'ordered_standard_extra_copy_count', target_project.ordered_standard_extra_copy_count,
    'ordered_premium_copy_count', target_project.ordered_premium_copy_count,
    'gift_package_purchased', target_project.gift_package_purchased,
    'can_finalize_book', public.can_manage_book_cover(input_book_project_id)
  );
end;
$function$;

revoke all on function public.get_supported_book_purchase_context(uuid) from public;
grant execute on function public.get_supported_book_purchase_context(uuid) to authenticated;
