begin;
create or replace function public.check_video_delivery_complete() returns trigger
language plpgsql security definer set search_path=public,storage,auth as $$
declare p public.book_projects%rowtype; source_path text; actual_size bigint;
begin
 if tg_op='INSERT' and not (coalesce(new.metadata,'{}') ? 'upload_complete') then raise exception 'Resumable video reservation required'; end if;
 if tg_op='UPDATE' and old.metadata ? 'upload_complete' and not (coalesce(new.metadata,'{}') ? 'upload_complete') then raise exception 'Video delivery marker cannot be removed'; end if;
 if tg_op='UPDATE' and old.metadata->>'upload_complete'='true' and new.metadata->>'upload_complete' is distinct from 'true' then raise exception 'Completed upload cannot be reopened'; end if;
 if new.metadata ? 'upload_complete' and (new.file_size_bytes is null or new.file_size_bytes<=0 or new.duration_seconds is null or new.duration_seconds<=0 or new.video_storage_path is null) then raise exception 'Video delivery metadata required'; end if;
 if new.metadata ? 'upload_complete' and new.status='ready' and new.metadata->>'upload_complete' is distinct from 'true' then raise exception 'Video upload not complete'; end if;
 select * into p from public.book_projects where id=new.book_project_id;
 if (tg_op='INSERT' or new.metadata ? 'upload_complete') and new.subject_person_id is distinct from p.subject_person_id then raise exception 'Video Person mismatch'; end if;
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
commit;
