create or replace function public.family_set_story_photo_layout(
  p uuid, photo_id uuid, layout jsonb
) returns void
language plpgsql security definer set search_path=public as $$
declare target media_assets%rowtype;
begin
  if not family_subject(p) or not experience_data_allowed(p,true) then
    raise exception 'Subject access required' using errcode='42501';
  end if;
  if jsonb_typeof(layout) <> 'object'
     or layout->>'placement' not in ('opener','after_full','after_half','excluded')
     or coalesce(layout->>'fit','contain') not in ('contain','cover')
     or coalesce((layout->>'positionX')::numeric,50) not between 0 and 100
     or coalesce((layout->>'positionY')::numeric,50) not between 0 and 100 then
    raise exception 'Invalid photo layout';
  end if;
  select * into target from media_assets
    where id=photo_id and book_project_id=p and asset_type='photo' for update;
  if not found then raise exception 'Photo unavailable'; end if;
  if exists(select 1 from book_work_manifests where book_project_id=p and confirmed_at is not null) then
    raise exception 'Book is already confirmed';
  end if;
  update media_assets set meta_json=jsonb_set(coalesce(meta_json,'{}'::jsonb),
    '{book_layout}',jsonb_build_object(
      'placement',layout->>'placement',
      'fit',coalesce(layout->>'fit','contain'),
      'positionX',coalesce((layout->>'positionX')::numeric,50),
      'positionY',coalesce((layout->>'positionY')::numeric,50)
    ),true)
  where id=photo_id;
end $$;
revoke all on function public.family_set_story_photo_layout(uuid,uuid,jsonb) from public,anon;
grant execute on function public.family_set_story_photo_layout(uuid,uuid,jsonb) to authenticated;
