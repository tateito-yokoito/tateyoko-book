begin;
-- TEST preferences are deliberately separate from all delivery queues,
-- notification_schedules and notification_preferences. Saving never enables a sender.
create table family_private.test_delivery_preferences (
 project_id uuid primary key references public.book_projects(id),
 subject_user_id uuid not null references auth.users(id),
 schedules jsonb not null default '[{"weekday":0,"hour":20,"minute":0}]',
 sms_requested boolean not null default false,
 updated_at timestamptz not null default now()
);
revoke all on family_private.test_delivery_preferences from public,anon,authenticated;

create function public.family_test_delivery_preferences(p uuid) returns jsonb
language plpgsql stable security definer set search_path=public,auth as $$
declare d family_private.test_delivery_preferences%rowtype; u auth.users%rowtype;
begin
 if not family_subject(p) then raise exception 'Subject access required' using errcode='42501';end if;
 select * into u from auth.users where id=auth.uid();
 select * into d from family_private.test_delivery_preferences where project_id=p and subject_user_id=auth.uid();
 return jsonb_build_object('user_id',u.id,'email',u.email,
 'phone_number',case when u.phone_confirmed_at is not null then u.phone else null end,
 'phone_verified_at',u.phone_confirmed_at,'schedules',coalesce(d.schedules,'[{"weekday":0,"hour":20,"minute":0}]'::jsonb),
 'sms_enabled',coalesce(d.sms_requested,false) and u.phone_confirmed_at is not null,
 'email_enabled',false,'is_active',false,'delivery_suppressed',true);
end $$;
revoke all on function public.family_test_delivery_preferences(uuid) from public,anon;
grant execute on function public.family_test_delivery_preferences(uuid) to authenticated;

create function public.family_save_test_delivery(p uuid, schedules jsonb default null, sms_requested boolean default null) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare item jsonb;normalized jsonb:='[]'; k text; keys text[]:='{}';w integer;h integer;m integer;
begin
 if not family_subject(p) or not experience_data_allowed(p,true) then raise exception 'Subject access required' using errcode='42501';end if;
 if schedules is not null then
   if jsonb_typeof(schedules)<>'array' then raise exception 'Invalid schedules';end if;
   if jsonb_array_length(schedules) not between 1 and 3 then raise exception 'Invalid schedules';end if;
   for item in select value from jsonb_array_elements(schedules) loop
     if jsonb_typeof(item)<>'object' or not coalesce(item->>'weekday' ~ '^[0-6]$',false) or not coalesce(item->>'hour' ~ '^([0-9]|1[0-9]|2[0-3])$',false)
     or not coalesce(item->>'minute' ~ '^(0|15|30|45)$',false) then raise exception 'Invalid schedules';end if;
     w:=(item->>'weekday')::integer;h:=(item->>'hour')::integer;m:=(item->>'minute')::integer;
     k:=w||':'||h||':'||m;if k=any(keys) then raise exception 'Duplicate schedules';end if;keys:=array_append(keys,k);
     normalized:=normalized||jsonb_build_array(jsonb_build_object('weekday',w,'hour',h,'minute',m));
   end loop;
 end if;
 if sms_requested is true and not exists(select 1 from auth.users where id=auth.uid() and phone is not null and phone_confirmed_at is not null) then raise exception 'Verified phone required';end if;
 insert into family_private.test_delivery_preferences(project_id,subject_user_id,schedules,sms_requested)
 values(p,auth.uid(),coalesce(case when schedules is null then null else normalized end,'[{"weekday":0,"hour":20,"minute":0}]'::jsonb),coalesce(sms_requested,false))
 on conflict(project_id) do update set schedules=case when family_save_test_delivery.schedules is null then test_delivery_preferences.schedules else normalized end,
 sms_requested=coalesce(family_save_test_delivery.sms_requested,test_delivery_preferences.sms_requested),updated_at=now()
 where test_delivery_preferences.subject_user_id=auth.uid();
 return family_test_delivery_preferences(p);
end $$;
revoke all on function public.family_save_test_delivery(uuid,jsonb,boolean) from public,anon;
grant execute on function public.family_save_test_delivery(uuid,jsonb,boolean) to authenticated;
commit;
