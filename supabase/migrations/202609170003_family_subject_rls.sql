begin;
-- Restrictive policies intersect every legacy permissive owner/user/family grant.
create function public.family_person_managed(p uuid) returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from family_subject_bindings where person_id=p) $$;
create function public.family_person_subject(p uuid) returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from family_subject_bindings where person_id=p and subject_user_id=auth.uid()) $$;
create function public.family_link_allowed(p uuid,u uuid,r text) returns boolean language sql stable security definer set search_path=public
as $$ select (not family_person_managed(p) and not exists(select 1 from family_subject_bindings where subject_user_id=u))
 or (u=auth.uid() and r='self' and exists(select 1 from family_subject_bindings where person_id=p and subject_user_id=u)) $$;

-- Parent deletes otherwise cascade past child-table RLS (legacy answer.user_id
-- still points to the daughter for recordings made before connection).
create function public.family_profile_removable(u uuid) returns boolean language sql stable security definer set search_path=public
as $$ select not exists(select 1 from answers where user_id=u and family_managed(book_project_id))
 and not exists(select 1 from family_subject_bindings where subject_user_id=u or initiated_by=u) $$;
revoke all on function family_profile_removable(uuid) from public,anon;
grant execute on function family_profile_removable(uuid) to authenticated,service_role;
create policy family_profile_delete_guard on profiles as restrictive for delete to authenticated using(family_profile_removable(id));

create policy family_person_read_guard on persons as restrictive for select to authenticated using(not family_person_managed(id) or family_person_subject(id));
create policy family_person_subject_read on persons for select to authenticated using(family_person_subject(id));
create policy family_person_insert_guard on persons as restrictive for insert to authenticated with check(not exists(select 1 from family_subject_bindings where subject_user_id=auth.uid()));
create policy family_person_update_guard on persons as restrictive for update to authenticated using(not family_person_managed(id) or family_person_subject(id)) with check(not family_person_managed(id) or family_person_subject(id));
create policy family_person_delete_guard on persons as restrictive for delete to authenticated using(not family_person_managed(id));
create policy family_links_guard on user_person_links as restrictive for all to authenticated using(family_link_allowed(person_id,user_id,role)) with check(family_link_allowed(person_id,user_id,role));
create policy family_project_read_guard on book_projects as restrictive for select to authenticated using(not family_managed(id) or family_subject(id));
create policy family_project_subject_read on book_projects for select to authenticated using(family_subject(id));
create policy family_project_insert_guard on book_projects as restrictive for insert to authenticated with check(not family_person_managed(subject_person_id) and not exists(select 1 from family_subject_bindings where subject_user_id=auth.uid()));
create policy family_project_update_guard on book_projects as restrictive for update to authenticated using(not family_managed(id)) with check(not family_managed(id));
create policy family_project_delete_guard on book_projects as restrictive for delete to authenticated using(not family_managed(id));

create policy family_answer_read_guard on answers as restrictive for select to authenticated using(not family_managed(book_project_id) or family_answer_visible(id));
create policy family_answer_subject_read on answers for select to authenticated using(family_subject(book_project_id));
create policy family_answer_insert_guard on answers as restrictive for insert to authenticated with check(not family_managed(book_project_id) and not family_person_managed(subject_person_id));
create policy family_answer_update_guard on answers as restrictive for update to authenticated using(not family_managed(book_project_id)) with check(not family_managed(book_project_id) and not family_person_managed(subject_person_id));
create policy family_answer_delete_guard on answers as restrictive for delete to authenticated using(not family_managed(book_project_id));

create function public.family_media_visible(a uuid,p uuid) returns boolean language sql stable security definer set search_path=public
as $$ select case when family_managed(p) or exists(select 1 from answers where id=a and family_managed(book_project_id)) then family_answer_visible(a) else true end $$;
create policy family_media_read_guard on media_assets as restrictive for select to authenticated using(family_media_visible(answer_id,book_project_id));
create policy family_media_subject_read on media_assets for select to authenticated using(family_subject(book_project_id));
create policy family_media_insert_guard on media_assets as restrictive for insert to authenticated with check(not family_managed(book_project_id) and not family_person_managed(person_id) and not exists(select 1 from answers a where a.id=answer_id and family_managed(a.book_project_id)));
create policy family_media_update_guard on media_assets as restrictive for update to authenticated using(not family_managed(book_project_id) and not exists(select 1 from answers a where a.id=answer_id and family_managed(a.book_project_id))) with check(not family_managed(book_project_id) and not family_person_managed(person_id) and not exists(select 1 from answers a where a.id=answer_id and family_managed(a.book_project_id)));
create policy family_media_delete_guard on media_assets as restrictive for delete to authenticated using(not family_managed(book_project_id) and not exists(select 1 from answers a where a.id=answer_id and family_managed(a.book_project_id)));

-- Metadata/progress is provided by the consent-aware RPC, not raw historical rows.
do $$ declare t text; begin foreach t in array array['user_questions','project_participants','project_supporters','project_introductions','story_context_terms','activity_logs','video_stories','book_cover_settings','theme_memory_requests','project_invites','story_relationship_invites'] loop
 execute format('create policy family_guard on public.%I as restrictive for all to authenticated using(not family_managed(book_project_id) or family_subject(book_project_id)) with check(not family_managed(book_project_id))',t);
end loop; end $$;
create policy family_question_subject_read on user_questions for select to authenticated using(family_subject(book_project_id));
create policy family_sharing_guard on story_sharing_preferences as restrictive for all to authenticated using(not family_managed(book_project_id) or family_subject(book_project_id)) with check(not family_managed(book_project_id) or family_subject(book_project_id));
create policy family_sharing_subject on story_sharing_preferences for all to authenticated using(family_subject(book_project_id)) with check(family_subject(book_project_id));
-- Resolve through a definer helper: an RLS-hidden preference must not turn
-- NOT EXISTS into permission to edit its recipients.
create function public.family_recipient_allowed(preference uuid) returns boolean language sql stable security definer set search_path=public
as $$ select not exists(select 1 from story_sharing_preferences s where s.id=preference and family_managed(s.book_project_id) and not family_subject(s.book_project_id)) $$;
create policy family_recipient_guard on story_share_recipients as restrictive for all to authenticated using(family_recipient_allowed(sharing_preference_id)) with check(family_recipient_allowed(sharing_preference_id));

create function public.family_asset_projects(object_path text) returns table(project_id uuid) language sql stable security definer set search_path=public
as $$
 select project_id from family_uploads where path=object_path
 union select coalesce(a.book_project_id,m.book_project_id) from media_assets m left join answers a on a.id=m.answer_id where m.storage_path=object_path and family_managed(coalesce(a.book_project_id,m.book_project_id))
 union select book_project_id from video_stories where family_managed(book_project_id) and object_path in(video_storage_path,audio_storage_path,poster_storage_path)
 union select book_project_id from book_cover_settings where family_managed(book_project_id) and object_path in(cover_photo_path,premium_cover_photo_path)
 union select i.book_project_id from project_introductions i cross join lateral jsonb_array_elements(case when jsonb_typeof(i.meta_json->'additional_audio')='array' then i.meta_json->'additional_audio' else '[]'::jsonb end) audio
 where family_managed(i.book_project_id) and audio->>'storage_path'=object_path
$$;
revoke all on function family_asset_projects(text) from public,anon,authenticated;
grant execute on function family_asset_projects(text) to service_role;

create function public.family_storage_access(bucket text, object_path text, writing boolean, actor uuid default auth.uid()) returns boolean language plpgsql stable security definer set search_path=public
as $$ declare u family_uploads%rowtype; a answers%rowtype; v video_stories%rowtype; pid uuid;
begin
 if bucket not in('audio','photos','videos') then return true; end if;
 select * into u from family_uploads where path=object_path;
 if u.id is not null then
  if bucket<>(case when u.kind='photo' then 'photos' else 'audio' end) then return false; end if;
  if writing then return u.committed_at is null and u.actor_id=actor and u.created_at>now()-interval '1 hour' and (family_subject(u.project_id,actor) or family_supporter(u.project_id,actor)) and experience_data_allowed(u.project_id,true); end if;
  if u.answer_id is not null then return family_answer_visible(u.answer_id,actor); end if;
  return experience_data_allowed(u.project_id,false) and (family_subject(u.project_id,actor) or (u.actor_id=actor and family_supporter(u.project_id,actor)));
 end if;
 if object_path like 'family/%' then return false; end if;
 -- Deny if ANY associated protected answer disallows access, even with duplicate metadata.
 for a in select x.* from media_assets m join answers x on x.id=m.answer_id where m.storage_path=object_path and family_managed(x.book_project_id) loop
  if writing or not family_answer_visible(a.id,actor) then return false; end if;
 end loop;
 for v in select * from video_stories where family_managed(book_project_id) and object_path in(video_storage_path,audio_storage_path,poster_storage_path) loop
  if not family_subject(v.book_project_id,actor) then return false; end if;
 end loop;
 for pid in select book_project_id from book_cover_settings where family_managed(book_project_id) and object_path in(cover_photo_path,premium_cover_photo_path) loop
  if not family_subject(pid,actor) then return false; end if;
 end loop;
 -- Legacy introduction audio and unattached project media are subject-only.
 for pid in select m.book_project_id from media_assets m where m.storage_path=object_path and m.answer_id is null and family_managed(m.book_project_id)
 union select i.book_project_id from project_introductions i cross join lateral jsonb_array_elements(case when jsonb_typeof(i.meta_json->'additional_audio')='array' then i.meta_json->'additional_audio' else '[]'::jsonb end) audio
 where family_managed(i.book_project_id) and audio->>'storage_path'=object_path loop
  if writing or not family_subject(pid,actor) then return false; end if;
 end loop;
 return true;
end $$;
create policy family_storage_read_guard on storage.objects as restrictive for select to authenticated using(family_storage_access(bucket_id,name,false));
create policy family_storage_insert_guard on storage.objects as restrictive for insert to authenticated with check(family_storage_access(bucket_id,name,true));
create policy family_storage_update_guard on storage.objects as restrictive for update to authenticated using(family_storage_access(bucket_id,name,true)) with check(family_storage_access(bucket_id,name,true));
create policy family_storage_delete_guard on storage.objects as restrictive for delete to authenticated using(family_storage_access(bucket_id,name,true));
create function public.family_original_asset_read(object_path text) returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from family_asset_projects(object_path) p where family_subject(p.project_id)) $$;
revoke all on function family_original_asset_read(text) from public,anon;
grant execute on function family_original_asset_read(text) to authenticated,service_role;
create policy family_storage_read on storage.objects for select to authenticated using((name like 'family/%' or family_original_asset_read(name)) and family_storage_access(bucket_id,name,false));
create policy family_storage_insert on storage.objects for insert to authenticated with check(name like 'family/%' and family_storage_access(bucket_id,name,true));

-- Server-side privilege boundary for service-role Edge functions.
create function public.family_assert_operation(p uuid,u uuid,operation text,answer uuid default null) returns boolean language plpgsql stable security definer set search_path=public
as $$ begin
 if not family_managed(p) then return false; end if;
 if u is null then raise exception 'Forbidden' using errcode='42501'; end if;
 if family_subject(p,u) then return true; end if;
 if operation='record' and family_supporter(p,u) and answer is null then return true; end if;
 raise exception 'Forbidden' using errcode='42501';
end $$;
revoke all on function family_assert_operation(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function family_assert_operation(uuid,uuid,text,uuid) to service_role;
-- A valid project parameter cannot authorize a private file from another project.
create function public.family_assert_asset(bucket text, object_path text, actor uuid, project uuid) returns boolean language plpgsql stable security definer set search_path=public
as $$ declare managed boolean;
begin
 managed:=object_path like 'family/%' or exists(select 1 from family_asset_projects(object_path));
 if not managed then return false; end if;
 if exists(select 1 from family_asset_projects(object_path) p where p.project_id<>project)
 or not family_storage_access(bucket,object_path,false,actor) then raise exception 'Forbidden asset' using errcode='42501'; end if;
 return true;
end $$;
revoke all on function family_assert_asset(text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function family_assert_asset(text,text,uuid,uuid) to service_role;
do $$ declare f record; begin for f in select oid::regprocedure as sig from pg_proc where pronamespace='public'::regnamespace and proname in('family_person_managed','family_person_subject','family_link_allowed','family_media_visible','family_storage_access','family_recipient_allowed') loop
 execute format('revoke all on function %s from public,anon',f.sig); execute format('grant execute on function %s to authenticated,service_role',f.sig);
end loop; end $$;
commit;
