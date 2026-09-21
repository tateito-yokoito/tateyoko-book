begin;

-- Retain removed/replaced photo metadata for recovery, but deny its old URL
-- through Storage RLS. Never fall back to the original uploader's path grant.
create table family_private.retired_media (
 id uuid primary key, project_id uuid not null, bucket text not null,
 path text not null, original jsonb not null, retired_by uuid not null,
 retired_at timestamptz not null default now(), unique(bucket,path)
);
revoke all on family_private.retired_media from public,anon,authenticated;
create function public.family_media_retired(bucket text, path text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from family_private.retired_media r where r.bucket=$1 and r.path=$2)
$$;
revoke all on function public.family_media_retired(text,text) from public,anon;
grant execute on function public.family_media_retired(text,text) to authenticated,service_role;
create policy family_retired_media_read_guard on storage.objects as restrictive for select to authenticated
 using(not family_media_retired(bucket_id,name));

create function public.family_edit_story(p uuid, answer_id uuid, style text, body text, expected jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare a answers%rowtype;
begin
 if not family_subject(p) or not experience_data_allowed(p,true) then raise exception 'Subject access required' using errcode='42501'; end if;
 select * into a from answers where id=answer_id and book_project_id=p for update;
 if a.id is null then raise exception 'Story unavailable'; end if;
 if style is null or style not in ('clean','readable','essay') or body is null or octet_length(body)>400000 then raise exception 'Invalid draft'; end if;
 -- Lost response retry is safe; a concurrent edit must not be overwritten.
 if a.selected_style=style and a.transcript_edited=body then return; end if;
 if expected is null or jsonb_build_object('style',a.selected_style,'body',a.transcript_edited) is distinct from expected
 then raise exception 'Story changed; reload before editing' using errcode='40001'; end if;
 update answers set selected_style=style,transcript_edited=body,
 meta_json=coalesce(meta_json,'{}')||jsonb_build_object('last_actor_user_id',auth.uid()) where id=a.id;
end $$;
revoke all on function public.family_edit_story(uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.family_edit_story(uuid,uuid,text,text,jsonb) to authenticated;

create function public.family_remove_story_photo(p uuid, photo_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare m media_assets%rowtype;
begin
 if not family_subject(p) or not experience_data_allowed(p,true) then raise exception 'Subject access required' using errcode='42501'; end if;
 if exists(select 1 from family_private.retired_media where id=photo_id and project_id=p) then return; end if;
 select * into m from media_assets where id=photo_id and book_project_id=p and asset_type='photo' for update;
 if m.id is null or not exists(select 1 from answers where id=m.answer_id and book_project_id=p) then raise exception 'Photo unavailable'; end if;
 -- The byte object is retained, not deleted; server RLS removes its visibility.
 insert into family_private.retired_media(id,project_id,bucket,path,original,retired_by)
 values(m.id,p,'photos',m.storage_path,to_jsonb(m),auth.uid());
 delete from media_assets where id=m.id;
end $$;
revoke all on function public.family_remove_story_photo(uuid,uuid) from public,anon;
grant execute on function public.family_remove_story_photo(uuid,uuid) to authenticated;

create function public.family_attach_story_photo(p uuid, answer_id uuid, upload_id uuid, replacing uuid default null) returns void
language plpgsql security definer set search_path=public as $$
declare u family_uploads%rowtype; b book_projects%rowtype;
begin
 if not family_subject(p) or not experience_data_allowed(p,true) then raise exception 'Subject access required' using errcode='42501'; end if;
 perform 1 from answers where id=answer_id and book_project_id=p for update;
 if not found then raise exception 'Story unavailable'; end if;
 select * into u from family_uploads where id=upload_id for update;
 if u.id is null or u.project_id<>p or u.actor_id<>auth.uid() or u.kind<>'photo' then raise exception 'Photo unavailable'; end if;
 if u.committed_at is not null then
  if u.answer_id is distinct from answer_id then raise exception 'Invalid retry'; end if;
  return;
 end if;
 if u.created_at<now()-interval '1 hour' or not exists(select 1 from storage.objects where bucket_id='photos' and name=u.path) then raise exception 'Photo unavailable'; end if;
 if replacing is not null then
  perform 1 from media_assets m where m.id=replacing and m.answer_id=family_attach_story_photo.answer_id and m.book_project_id=p and m.asset_type='photo' for update;
  if not found then raise exception 'Replacement unavailable'; end if;
  perform family_remove_story_photo(p,replacing);
 end if;
 select * into b from book_projects where id=p;
 insert into media_assets(answer_id,user_id,family_id,book_project_id,person_id,asset_type,storage_path,meta_json)
 values(answer_id,auth.uid(),b.family_id,p,b.subject_person_id,'photo',u.path,jsonb_build_object('actor_user_id',auth.uid(),'segment_id',u.id));
 update family_uploads set committed_at=now(),answer_id=family_attach_story_photo.answer_id where id=u.id;
end $$;
revoke all on function public.family_attach_story_photo(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.family_attach_story_photo(uuid,uuid,uuid,uuid) to authenticated;
commit;
