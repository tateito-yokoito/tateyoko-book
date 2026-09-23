begin;

-- Administrator remains the actor. The target account is only the subject of
-- an explicitly scoped read projection; no JWT/session impersonation occurs.
create function public.get_admin_customer_experience(input_account_id uuid) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_tateyoko_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if not exists(select 1 from auth.users where id=input_account_id) then raise exception 'Account not found' using errcode='P0002'; end if;
 insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'view_customer_experience','account',input_account_id,
   jsonb_build_object('target_account_id',input_account_id,'capability','read'));
 select jsonb_build_object(
   'actor_id',auth.uid(),'target_account_id',input_account_id,'capability','read',
   'display_name',coalesce(nullif(to_jsonb(pr)->>'display_name',''),nullif(to_jsonb(pr)->>'name',''),u.email,'名称未登録'),
   'owned_projects',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'subject_name',coalesce(nullif(to_jsonb(pe)->>'preferred_name',''),nullif(to_jsonb(pe)->>'display_name',''),b.title),
       'title',b.title) order by b.created_at desc)
     from public.book_projects b left join public.persons pe on pe.id=b.subject_person_id
     where b.owner_user_id=input_account_id or exists(select 1 from public.family_subject_bindings fb
       where fb.person_id=b.subject_person_id and fb.subject_user_id=input_account_id and fb.claimed_at is not null)),'[]'::jsonb),
   'supported_projects',coalesce((select jsonb_agg(jsonb_build_object(
       'supporter_id',s.id,'book_project_id',b.id,'subject_name',coalesce(nullif(to_jsonb(pe)->>'preferred_name',''),nullif(to_jsonb(pe)->>'display_name',''),b.title),
       'support_role',coalesce(s.meta_json->>'support_role','helper'),'can_operate_recording',s.can_operate_recording,
       'can_edit_book_text',s.can_edit_book_text,'can_build_book',s.can_build_book) order by b.created_at desc)
     from public.project_supporters s join public.book_projects b on b.id=s.book_project_id
     left join public.persons pe on pe.id=b.subject_person_id
     where s.supporter_user_id=input_account_id and s.status='active'),'[]'::jsonb),
   'bookshelf',coalesce((select jsonb_agg(jsonb_build_object(
       'publication_id',p.id,'public_id',p.public_id,'book_project_id',p.book_project_id,
       'title',p.book_title,'subtitle',p.book_subtitle,'subject_name',p.subject_name,
       'status',p.status,'published_at',p.published_at,
       'relationship',case when b.owner_user_id=input_account_id then 'owner'
         when public.family_managed(b.id) and public.family_creator(b.id,input_account_id) then 'managed'
         when exists(select 1 from public.project_supporters s where s.book_project_id=b.id
           and s.supporter_user_id=input_account_id and s.status='active' and s.can_build_book) then 'managed'
         when b.purchaser_user_id=input_account_id then 'purchased' else 'shared' end,
       'paper_book_ordered',c.state='completed','work_set_id',coalesce(c.id,p.id)) order by p.published_at desc)
     from public.voice_publications p join public.book_projects b on b.id=p.book_project_id
     left join public.book_completion_candidates c on c.publication_id=p.id and c.state='completed'
     where p.published_at is not null and p.status in('published','disabled')
       and (b.owner_user_id=input_account_id
         or (public.family_managed(b.id) and public.family_creator(b.id,input_account_id))
         or (not public.family_managed(b.id) and exists(select 1 from public.project_supporters s
           where s.book_project_id=b.id and s.supporter_user_id=input_account_id and s.status='active' and s.can_build_book))
         or (p.status='published' and b.purchaser_user_id=input_account_id)
         or (p.status='published' and exists(select 1 from public.story_sharing_preferences pref
           join public.story_share_recipients r on r.sharing_preference_id=pref.id
           where pref.book_project_id=b.id and r.recipient_user_id=input_account_id and r.status='active'
           and r.recipient_phase in('live','both')
           and ((r.source='family' and pref.family_sharing_enabled)
             or (r.source in('direct','selected','supporter') and pref.selected_sharing_enabled))))
         or (p.status='published' and exists(select 1 from public.story_sharing_preferences pref
           join public.family_memberships fm on fm.family_id=b.family_id
           where pref.book_project_id=b.id and pref.family_sharing_enabled
           and fm.user_id=input_account_id and fm.status='active')))
       and (p.status='published' or b.owner_user_id=input_account_id
         or (public.family_managed(b.id) and public.family_creator(b.id,input_account_id))
         or (not public.family_managed(b.id) and exists(select 1 from public.project_supporters s
           where s.book_project_id=b.id and s.supporter_user_id=input_account_id and s.status='active' and s.can_build_book)))),'[]'::jsonb)
 ) into result
 from auth.users u left join public.profiles pr on pr.id=u.id where u.id=input_account_id;
 return result;
end; $$;

-- Full work-in-progress stories may be projected only when the target itself
-- has creator/editor access. Viewer-only relationships are deliberately denied.
create function public.get_admin_customer_project_stories(input_account_id uuid,input_project_id uuid) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare b public.book_projects%rowtype;
begin
 if auth.uid() is null or not public.is_tateyoko_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if not exists(select 1 from auth.users where id=input_account_id) then raise exception 'Account not found' using errcode='P0002'; end if;
 select * into b from public.book_projects where id=input_project_id;
 if b.id is null then raise exception 'Project not found' using errcode='P0002'; end if;
 if not (b.owner_user_id=input_account_id
   or (public.family_managed(b.id) and public.family_creator(b.id,input_account_id))
   or (not public.family_managed(b.id) and exists(select 1 from public.project_supporters s
     where s.book_project_id=b.id and s.supporter_user_id=input_account_id and s.status='active'
       and (s.can_edit_book_text or s.can_build_book)))) then
   raise exception 'Target account cannot read production stories' using errcode='42501';
 end if;
 insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'view_customer_experience_stories','book_project',b.id,
   jsonb_build_object('target_account_id',input_account_id,'capability','read'));
 return public.get_admin_project_preview(input_project_id);
end; $$;

create function public.admin_customer_can_read_publication(input_account_id uuid,input_publication_id uuid) returns boolean
language plpgsql security definer set search_path=public,auth as $$
declare p public.voice_publications%rowtype; b public.book_projects%rowtype; can_manage boolean;
begin
 if auth.uid() is null or not public.is_tateyoko_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if not exists(select 1 from auth.users where id=input_account_id) then return false; end if;
 select * into p from public.voice_publications where id=input_publication_id;
 if p.id is null or p.status not in('published','disabled') or p.published_at is null then return false; end if;
 select * into b from public.book_projects where id=p.book_project_id;
 can_manage:=b.owner_user_id=input_account_id
   or (public.family_managed(b.id) and public.family_creator(b.id,input_account_id))
   or (not public.family_managed(b.id) and exists(select 1 from public.project_supporters s
     where s.book_project_id=b.id and s.supporter_user_id=input_account_id and s.status='active' and s.can_build_book));
 if not can_manage and (p.status='disabled' or (
   b.purchaser_user_id is distinct from input_account_id
   and not exists(select 1 from public.story_sharing_preferences pref
     join public.story_share_recipients r on r.sharing_preference_id=pref.id
     where pref.book_project_id=b.id and r.recipient_user_id=input_account_id and r.status='active'
       and r.recipient_phase in('live','both')
       and ((r.source='family' and pref.family_sharing_enabled)
         or (r.source in('direct','selected','supporter') and pref.selected_sharing_enabled)))
   and not exists(select 1 from public.story_sharing_preferences pref
     join public.family_memberships fm on fm.family_id=b.family_id
     where pref.book_project_id=b.id and pref.family_sharing_enabled
       and fm.user_id=input_account_id and fm.status='active'))) then return false; end if;
 insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'view_customer_experience_web_book','voice_publication',p.id,
   jsonb_build_object('target_account_id',input_account_id,'capability','read'));
 return true;
end; $$;

revoke all on function public.get_admin_customer_experience(uuid),public.get_admin_customer_project_stories(uuid,uuid),public.admin_customer_can_read_publication(uuid,uuid) from public,anon;
grant execute on function public.get_admin_customer_experience(uuid),public.get_admin_customer_project_stories(uuid,uuid),public.admin_customer_can_read_publication(uuid,uuid) to authenticated;

commit;
