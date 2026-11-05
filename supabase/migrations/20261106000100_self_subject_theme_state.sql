-- A bound self-owned story cannot use direct UPDATE on book_projects because
-- family_project_update_guard intentionally blocks all family-managed rows.
-- Permit only its subject/owner to save the theme navigation fields.
create or replace function public.save_self_subject_theme_state(
  input_book_project_id uuid,
  input_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.book_projects%rowtype;
  next_state jsonb;
begin
  if auth.uid() is null or jsonb_typeof(input_patch) is distinct from 'object' then
    raise exception 'Invalid theme state request' using errcode = '42501';
  end if;

  if exists (
    select 1 from jsonb_object_keys(input_patch) as key_name
    where key_name not in (
      'pending_transition_order', 'pending_transition_phase',
      'bookend_kind', 'bookend_return_scene', 'bookend_resume_sequence',
      'bookend_intro_shown', 'bookend_outro_shown'
    )
  ) then
    raise exception 'Invalid theme state fields' using errcode = '22023';
  end if;

  select * into target
  from public.book_projects
  where id = input_book_project_id
  for update;

  if target.id is null
    or target.owner_user_id is distinct from auth.uid()
    or not public.family_managed(input_book_project_id)
    or not public.family_subject(input_book_project_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  next_state := coalesce(target.theme_experience_state, '{}'::jsonb) || input_patch;
  update public.book_projects
  set theme_experience_state = next_state
  where id = input_book_project_id;

  return next_state;
end;
$$;

revoke all on function public.save_self_subject_theme_state(uuid, jsonb)
  from public, anon;
grant execute on function public.save_self_subject_theme_state(uuid, jsonb)
  to authenticated;
