create or replace function public.get_admin_project_detail(input_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.book_projects where id = input_project_id) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id)
  values (auth.uid(), 'view_project_detail', 'book_project', input_project_id);

  select jsonb_build_object(
    'project', (
      select to_jsonb(bp) || jsonb_build_object(
        'owner_email', owner.email,
        'owner_name', coalesce(
          nullif(to_jsonb(profile) ->> 'display_name', ''),
          nullif(to_jsonb(profile) ->> 'name', ''),
          owner.email
        ),
        'subject_name', coalesce(
          nullif(to_jsonb(subject) ->> 'preferred_name', ''),
          nullif(to_jsonb(subject) ->> 'display_name', ''),
          bp.title
        )
      )
      from public.book_projects bp
      left join auth.users owner on owner.id = bp.owner_user_id
      left join public.profiles profile on profile.id = bp.owner_user_id
      left join public.persons subject on subject.id = bp.subject_person_id
      where bp.id = input_project_id
    ),
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'sequence_order', a.sequence_order,
        'created_at', a.created_at,
        'transcript', coalesce(
          nullif(to_jsonb(a) ->> 'transcript_edited', ''),
          nullif(to_jsonb(a) ->> 'transcript_polished', ''),
          nullif(to_jsonb(a) ->> 'transcript_raw', '')
        ),
        'access_override', to_jsonb(a) ->> 'access_override',
        'media', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ma.id,
            'asset_type', ma.asset_type,
            'storage_path', ma.storage_path,
            'meta_json', ma.meta_json,
            'created_at', ma.created_at
          ) order by ma.created_at asc)
          from public.media_assets ma
          where ma.answer_id = a.id
        ), '[]'::jsonb)
      ) order by a.created_at desc)
      from public.answers a where a.book_project_id = input_project_id
    ), '[]'::jsonb),
    'notifications', jsonb_build_object(
      'preference', (
        select jsonb_build_object(
          'email_enabled', np.email_enabled,
          'sms_enabled', np.sms_enabled,
          'line_enabled', np.line_enabled,
          'weekday', np.weekday,
          'hour', np.hour,
          'minute', np.minute,
          'delivery_channel', np.delivery_channel,
          'is_active', np.is_active,
          'timezone', np.timezone,
          'phone_configured', nullif(trim(coalesce(np.phone_number, '')), '') is not null,
          'updated_at', to_jsonb(np) ->> 'updated_at'
        )
        from public.notification_preferences np
        where np.user_id = (
          select owner_user_id from public.book_projects where id = input_project_id
        )
      ),
      'schedules', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ns.id,
          'weekday', ns.weekday,
          'hour', ns.hour,
          'minute', ns.minute,
          'delivery_channel', ns.delivery_channel,
          'enabled', ns.enabled,
          'sort_order', ns.sort_order,
          'updated_at', ns.updated_at
        ) order by ns.sort_order nulls last, ns.weekday, ns.hour, ns.minute)
        from public.notification_schedules ns
        where ns.user_id = (
          select owner_user_id from public.book_projects where id = input_project_id
        )
      ), '[]'::jsonb)
    ),
    'supporters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ps.id,
        'status', ps.status,
        'email', supporter.email,
        'name', coalesce(
          nullif(to_jsonb(person) ->> 'preferred_name', ''),
          nullif(to_jsonb(person) ->> 'display_name', ''),
          supporter.email
        ),
        'created_at', ps.created_at,
        'revoked_at', ps.revoked_at
      ) order by ps.created_at desc)
      from public.project_supporters ps
      left join auth.users supporter on supporter.id = ps.supporter_user_id
      left join public.persons person on person.id = ps.supporter_person_id
      where ps.book_project_id = input_project_id
    ), '[]'::jsonb),
    'relationships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sri.id,
        'type', sri.invite_type,
        'email', sri.invitee_email,
        'name', sri.invitee_name,
        'relationship', sri.relationship_label,
        'status', sri.status,
        'email_delivery_status', sri.email_delivery_status,
        'email_error', sri.email_error,
        'created_at', sri.created_at,
        'accepted_at', sri.accepted_at
      ) order by sri.created_at desc)
      from public.story_relationship_invites sri
      where sri.book_project_id = input_project_id
    ), '[]'::jsonb),
    'activities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', al.id,
        'action', al.action,
        'entity_type', al.entity_type,
        'metadata', al.metadata,
        'created_at', al.created_at
      ) order by al.created_at desc)
      from (
        select * from public.activity_logs
        where book_project_id = input_project_id
        order by created_at desc limit 50
      ) al
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_project_detail(uuid) from public;
grant execute on function public.get_admin_project_detail(uuid) to authenticated;

drop policy if exists storage_admin_media_read on storage.objects;
create policy storage_admin_media_read
on storage.objects for select to authenticated
using (
  bucket_id in ('photos', 'audio')
  and public.is_tateyoko_admin()
);

create or replace function public.log_admin_media_access(
  input_project_id uuid,
  input_media_id uuid,
  input_action text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if input_action not in ('view_photo', 'play_audio') then
    raise exception 'Unsupported media action' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.media_assets ma
    where ma.id = input_media_id
      and (
        ma.book_project_id = input_project_id
        or exists (
          select 1
          from public.answers a
          where a.id = ma.answer_id
            and a.book_project_id = input_project_id
        )
      )
  ) then
    raise exception 'Media not found' using errcode = 'P0002';
  end if;

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), input_action, 'media_asset', input_media_id,
    jsonb_build_object('book_project_id', input_project_id)
  );
end;
$$;

revoke all on function public.log_admin_media_access(uuid, uuid, text) from public;
grant execute on function public.log_admin_media_access(uuid, uuid, text) to authenticated;
