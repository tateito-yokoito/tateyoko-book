begin;
-- A bounded delivery format, not a reduction of the 2 x 5-minute allowance.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('videos','videos',false,52428800,array['video/mp4','video/webm','audio/mp4','audio/webm','audio/ogg','image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.video_stories add constraint video_delivery_five_minutes check(duration_seconds<=300) not valid;
alter table public.video_stories add constraint video_delivery_size check(file_size_bytes is null or file_size_bytes<=50331648) not valid;

create function public.check_video_delivery_complete() returns trigger
language plpgsql security definer set search_path=public,storage,auth as $$
declare p public.book_projects%rowtype; source_path text; actual_size bigint;
begin
 select * into p from public.book_projects where id=new.book_project_id;
 if new.subject_person_id is distinct from p.subject_person_id then raise exception 'Video Person mismatch'; end if;
 if new.metadata->>'upload_complete'='true' then
   foreach source_path in array array[new.video_storage_path,new.audio_storage_path,new.poster_storage_path] loop
     if source_path is null then continue; end if;
     if source_path not like new.created_by_user_id::text||'/'||new.book_project_id::text||'/'||new.id::text||'/%' then
       raise exception 'Video path mismatch';
     end if;
     select (metadata->>'size')::bigint into actual_size from storage.objects where bucket_id='videos' and name=source_path;
     if actual_size is null or actual_size<=0 or actual_size>50331648 then raise exception 'Video upload incomplete or oversized'; end if;
     if source_path=new.video_storage_path and actual_size is distinct from new.file_size_bytes then raise exception 'Video byte count mismatch'; end if;
   end loop;
 end if;
 return new;
end; $$;
create trigger video_delivery_complete before insert or update on public.video_stories
for each row execute function public.check_video_delivery_complete();
revoke all on function public.check_video_delivery_complete() from public,anon,authenticated;

create function public.video_delivery_path_allowed(input_name text) returns boolean
language sql stable security definer set search_path=public,auth as $$
 select exists(select 1 from public.video_stories v where
   input_name in(v.video_storage_path,v.audio_storage_path,v.poster_storage_path)
   and v.created_by_user_id=auth.uid() and public.can_manage_video_stories(v.book_project_id)
   and coalesce(v.metadata->>'upload_complete','false')<>'true'
   and public.experience_data_allowed(v.book_project_id,true));
$$;
revoke all on function public.video_delivery_path_allowed(text) from public,anon;
grant execute on function public.video_delivery_path_allowed(text) to authenticated;
create policy video_delivery_reserved_insert on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'videos' or public.video_delivery_path_allowed(name));
create policy video_delivery_reserved_update on storage.objects as restrictive for update to authenticated
using(bucket_id<>'videos' or public.video_delivery_path_allowed(name))
with check(bucket_id<>'videos' or public.video_delivery_path_allowed(name));
commit;
