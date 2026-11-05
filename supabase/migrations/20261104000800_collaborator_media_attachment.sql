-- Attach photos and videos to an existing answer in the same project.
-- The upload path contains the acting user, project and answer IDs. Metadata
-- is written only after the Storage object exists and the role is rechecked.
create or replace function public.collaborator_can_upload_object(input_bucket text,input_path text)
returns boolean language plpgsql stable security definer
set search_path=public,storage,auth as $$
declare parts text[] := string_to_array(input_path,'/');
declare target_project_id uuid;
declare target_answer_id uuid;
begin
  if auth.uid() is null or input_bucket not in ('photos','videos')
    or array_length(parts,1) <> 4 or parts[1] <> auth.uid()::text
    or parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or parts[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or length(parts[4]) < 8 then return false; end if;
  target_project_id:=parts[2]::uuid;
  target_answer_id:=parts[3]::uuid;
  return exists (
    select 1 from public.answers a join public.book_projects bp on bp.id=a.book_project_id
    where a.id=target_answer_id and a.book_project_id=target_project_id
      and bp.status='active'
      and (bp.owner_user_id=auth.uid() or public.is_project_co_manager(bp.id))
      and public.experience_data_allowed(bp.id,true)
  );
end;
$$;
revoke all on function public.collaborator_can_upload_object(text,text) from public,anon;
grant execute on function public.collaborator_can_upload_object(text,text) to authenticated;

create policy collaborator_media_upload on storage.objects for insert to authenticated
with check (public.collaborator_can_upload_object(bucket_id,name));

create or replace function public.attach_collaborator_media(
  input_answer_id uuid,input_asset_type text,input_storage_path text
) returns uuid language plpgsql security definer
set search_path=public,storage,auth as $$
declare target_answer public.answers%rowtype;
declare target_id uuid;
declare target_bucket text;
begin
  if input_asset_type not in ('photo','video') then
    raise exception 'ファイルの種類を確認できません' using errcode='22023'; end if;
  target_bucket:=case when input_asset_type='photo' then 'photos' else 'videos' end;
  select * into target_answer from public.answers where id=input_answer_id;
  if target_answer.id is null or not public.collaborator_can_upload_object(target_bucket,input_storage_path)
    or not exists(select 1 from storage.objects o where o.bucket_id=target_bucket and o.name=input_storage_path) then
    raise exception 'ファイルをこの語りに追加できません' using errcode='42501'; end if;
  insert into public.media_assets(answer_id,user_id,book_project_id,asset_type,storage_path,meta_json)
  values(input_answer_id,auth.uid(),target_answer.book_project_id,input_asset_type,input_storage_path,
    jsonb_build_object('source','project_collaborator'))
  on conflict do nothing;
  select id into target_id from public.media_assets
    where answer_id=input_answer_id and asset_type=input_asset_type and storage_path=input_storage_path;
  return target_id;
end;
$$;
revoke all on function public.attach_collaborator_media(uuid,text,text) from public,anon;
grant execute on function public.attach_collaborator_media(uuid,text,text) to authenticated;
