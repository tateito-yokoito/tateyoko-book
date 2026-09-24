begin;

-- Read projection only. The administrator remains the actor; target is never
-- substituted for auth.uid(). No completion/order/publication state is written.
create or replace function public.admin_readonly_customer_project(input_account_id uuid, input_project_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.book_projects b
    where b.id=input_project_id and (
      b.owner_user_id=input_account_id
      or (public.family_managed(b.id) and public.family_creator(b.id,input_account_id))
      or (not public.family_managed(b.id) and exists (
        select 1 from public.project_supporters s
        where s.book_project_id=b.id and s.supporter_user_id=input_account_id
          and s.status='active' and (s.can_edit_book_text or s.can_build_book)
      ))
    )
  );
$$;
revoke all on function public.admin_readonly_customer_project(uuid,uuid) from public,anon,authenticated;

create or replace function public.admin_readonly_shared(input_account_id uuid,input_project_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.story_sharing_preferences pref
    join public.story_share_recipients r on r.sharing_preference_id=pref.id
    where pref.book_project_id=input_project_id and r.recipient_user_id=input_account_id
      and r.status='active' and r.recipient_phase in ('live','both')
      and ((r.source='family' and pref.family_sharing_enabled)
        or (r.source in ('direct','selected','supporter') and pref.selected_sharing_enabled)))
    or exists(select 1 from public.book_projects b
      join public.story_sharing_preferences pref on pref.book_project_id=b.id
      join public.family_memberships fm on fm.family_id=b.family_id
      where b.id=input_project_id and pref.family_sharing_enabled
        and fm.user_id=input_account_id and fm.status='active');
$$;
revoke all on function public.admin_readonly_shared(uuid,uuid) from public,anon,authenticated;

create or replace function public.get_admin_readonly_customer(input_account_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare result jsonb;
begin
  if auth.uid() is null or public.is_tateyoko_admin() is distinct from true then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if not exists(select 1 from auth.users where id=input_account_id) then
    raise exception 'Account not found' using errcode='P0002';
  end if;
  select jsonb_build_object(
    'actor_id',auth.uid(),'target_account_id',input_account_id,'capability','read',
    'display_name',coalesce(nullif(to_jsonb(pr)->>'display_name',''),nullif(to_jsonb(pr)->>'name',''),'名称未登録'),
    'owned_projects',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'title',b.title,
      'subject_name',coalesce(nullif(to_jsonb(pe)->>'preferred_name',''),nullif(to_jsonb(pe)->>'display_name',''),b.title)) order by b.created_at desc)
      from public.book_projects b left join public.persons pe on pe.id=b.subject_person_id
      where (not public.family_managed(b.id) and b.owner_user_id=input_account_id) or
        (public.family_managed(b.id) and public.family_subject(b.id,input_account_id))), '[]'::jsonb),
    'supported_projects',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'title',b.title,
      'subject_name',coalesce(nullif(to_jsonb(pe)->>'preferred_name',''),nullif(to_jsonb(pe)->>'display_name',''),b.title)) order by b.created_at desc)
      from public.project_supporters s join public.book_projects b on b.id=s.book_project_id
      left join public.persons pe on pe.id=b.subject_person_id
      where s.supporter_user_id=input_account_id and s.status='active'
        and public.admin_readonly_customer_project(input_account_id,b.id)), '[]'::jsonb),
    'bookshelf',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'public_id',p.public_id,
      'project_id',b.id,'title',p.book_title,'subject_name',p.subject_name,'published_at',p.published_at)
      order by p.published_at desc)
      from public.voice_publications p join public.book_projects b on b.id=p.book_project_id
      where p.status='published' and p.published_at is not null
        and (not public.family_managed(b.id) or public.family_subject(b.id,input_account_id)
          or public.admin_readonly_shared(input_account_id,b.id))
        and ((not public.family_managed(b.id) and b.owner_user_id=input_account_id)
          or (not public.family_managed(b.id) and b.purchaser_user_id=input_account_id)
          or (public.family_managed(b.id) and public.family_creator(b.id,input_account_id))
          or (not public.family_managed(b.id) and exists(select 1 from public.project_supporters s
            where s.book_project_id=b.id and s.supporter_user_id=input_account_id
              and s.status='active' and s.can_build_book))
          or public.admin_readonly_shared(input_account_id,b.id))), '[]'::jsonb)
  ) into result from auth.users u left join public.profiles pr on pr.id=u.id where u.id=input_account_id;
  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'view_customer_experience','account',input_account_id,
    jsonb_build_object('target_account_id',input_account_id,'capability','read'));
  return result;
end; $$;

create or replace function public.get_admin_readonly_customer_stories(input_account_id uuid,input_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
begin
  if auth.uid() is null or public.is_tateyoko_admin() is distinct from true then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if not public.admin_readonly_customer_project(input_account_id,input_project_id) then
    raise exception 'Target account cannot read project stories' using errcode='42501';
  end if;
  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'view_customer_experience_stories','book_project',input_project_id,
    jsonb_build_object('target_account_id',input_account_id,'capability','read'));
  return public.get_admin_project_preview(input_project_id);
end; $$;

-- Opening material is projected at read time. There is deliberately no
-- trigger/snapshot mutation in this standalone release.
create or replace function public.admin_readonly_web_intro(input_project_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  with selected as (
    select a.* from public.answers a join public.user_questions q on q.id=a.user_question_id
    join public.book_projects b on b.id=a.book_project_id
    where b.id=input_project_id and a.subject_person_id=b.subject_person_id
      and q.book_project_id=b.id and q.question_id in ('TY_ONB01','TY_ONB02','TY_ONB03')
      and a.access_override is distinct from 'private_forever'
  )
  select jsonb_build_object(
    'answers',(select coalesce(jsonb_agg(to_jsonb(a) order by a.sequence_order),'[]'::jsonb) from selected a),
    'questions',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]'::jsonb) from public.user_questions q where q.id in(select user_question_id from selected)),
    'media',(select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]'::jsonb) from public.media_assets m where m.book_project_id=input_project_id and m.answer_id in(select id from selected))
  );
$$;
revoke all on function public.admin_readonly_web_intro(uuid) from public,anon,authenticated;

create or replace function public.get_admin_readonly_web_preview(input_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare selection uuid[]; live_snapshot jsonb;
begin
  if auth.uid() is null or public.is_tateyoko_admin() is distinct from true then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if not exists(select 1 from public.book_projects where id=input_project_id) then
    raise exception 'Project not found' using errcode='P0002';
  end if;
  if exists(select 1 from public.voice_publications where book_project_id=input_project_id
    and status in ('published','disabled')) then
    raise exception 'Completed work: open the customer bookshelf' using errcode='42501';
  end if;
  select answer_ids into selection from public.book_work_manifests where book_project_id=input_project_id;
  if selection is null then
    select coalesce(array_agg(a.id order by a.sequence_order,a.created_at),'{}') into selection
    from public.answers a join public.book_projects p on p.id=a.book_project_id
    left join public.user_questions q on q.id=a.user_question_id
    where p.id=input_project_id and a.subject_person_id=p.subject_person_id
      and a.access_override is distinct from 'private_forever'
      and coalesce(q.meta_json->>'onboarding_group','')<>'trial_experience'
      and coalesce(q.meta_json->>'include_in_book_body','true')<>'false';
  end if;
  select coalesce(array_agg(a.id order by array_position(selection,a.id)),'{}') into selection
  from public.answers a join public.book_projects p on p.id=a.book_project_id
  where p.id=input_project_id and a.id=any(selection) and a.subject_person_id=p.subject_person_id
    and a.access_override is distinct from 'private_forever';
  select jsonb_build_object(
    'project',to_jsonb(p),
    'subject',(select to_jsonb(s) from public.persons s where s.id=p.subject_person_id),
    'cover',(select to_jsonb(c) from public.book_cover_settings c where c.book_project_id=p.id),
    'answers',(select coalesce(jsonb_agg(to_jsonb(a) order by array_position(selection,a.id)),'[]'::jsonb) from public.answers a where a.id=any(selection)),
    'questions',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]'::jsonb) from public.user_questions q where q.book_project_id=p.id and q.id in(select user_question_id from public.answers where id=any(selection))),
    'media',(select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]'::jsonb) from public.media_assets m where m.book_project_id=p.id and m.answer_id=any(selection)),
    'videos',(select coalesce(jsonb_agg(to_jsonb(v) order by v.slot_order),'[]'::jsonb) from public.video_stories v where v.book_project_id=p.id and v.source_answer_id=any(selection) and v.status in ('ready','failed')),
    'web_intro',public.admin_readonly_web_intro(p.id)
  ) into live_snapshot from public.book_projects p where p.id=input_project_id;
  return jsonb_build_object('adminPreview',true,'snapshot',live_snapshot);
end; $$;

-- Service-role signing is allowed only for a source row in this Project and
-- Person. A path referenced by another Project is ambiguous and fails closed.
create or replace function public.admin_readonly_preview_asset(input_project_id uuid,input_bucket text,input_path text)
returns boolean language sql stable security definer set search_path=public,storage as $$
  select input_path is not null and input_path<>''
    and exists(select 1 from storage.objects o where o.bucket_id=input_bucket and o.name=input_path)
    and exists(select 1 from public.book_projects p where p.id=input_project_id and (
      (input_bucket in ('audio','photos') and exists (
        select 1 from public.media_assets m join public.answers a on a.id=m.answer_id
        where m.book_project_id=p.id and a.book_project_id=p.id
          and a.subject_person_id=p.subject_person_id and m.storage_path=input_path
          and m.asset_type=case when input_bucket='audio' then 'audio' else 'photo' end
      ))
      or (input_bucket='photos' and exists (
        select 1 from public.book_cover_settings c where c.book_project_id=p.id
          and input_path in (c.cover_photo_path,c.premium_cover_photo_path)
      ))
      or (input_bucket='videos' and exists (
        select 1 from public.video_stories v join public.answers a on a.id=v.source_answer_id
        where v.book_project_id=p.id and a.book_project_id=p.id
          and a.subject_person_id=p.subject_person_id
          and input_path in (v.video_storage_path,v.audio_storage_path,v.poster_storage_path)
      ))
    ))
    and not exists(select 1 from public.media_assets m where m.storage_path=input_path and m.book_project_id<>input_project_id)
    and not exists(select 1 from public.media_assets m join public.answers a on a.id=m.answer_id
      join public.book_projects p on p.id=input_project_id
      where m.storage_path=input_path and (a.book_project_id<>p.id or a.subject_person_id<>p.subject_person_id))
    and not exists(select 1 from public.video_stories v where input_path in (v.video_storage_path,v.audio_storage_path,v.poster_storage_path) and v.book_project_id<>input_project_id)
    and not exists(select 1 from public.book_cover_settings c where input_path in (c.cover_photo_path,c.premium_cover_photo_path) and c.book_project_id<>input_project_id);
$$;
revoke all on function public.admin_readonly_preview_asset(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_readonly_preview_asset(uuid,text,text) to service_role;

revoke all on function public.get_admin_readonly_customer(uuid),public.get_admin_readonly_customer_stories(uuid,uuid),public.get_admin_readonly_web_preview(uuid) from public,anon;
grant execute on function public.get_admin_readonly_customer(uuid),public.get_admin_readonly_customer_stories(uuid,uuid),public.get_admin_readonly_web_preview(uuid) to authenticated;

commit;
