begin;

-- Personal bookshelf authority, not the administrator's global review authority.
-- Payment alone never grants access to a privately held completed work.
create function public.can_read_private_web_book(input_project_id uuid) returns boolean
language sql stable security definer set search_path=public,auth as $$
 select auth.uid() is not null and case
   when public.family_managed(input_project_id) then public.family_creator(input_project_id)
   else exists(select 1 from book_projects where id=input_project_id and owner_user_id=auth.uid())
     or exists(select 1 from project_supporters where book_project_id=input_project_id
       and supporter_user_id=auth.uid() and status='active' and can_build_book)
 end
$$;

-- Keep the legacy RPC's return signature intact for older clients.
create function public.list_completed_web_book_library() returns jsonb
language sql stable security definer set search_path=public,auth as $$
 select coalesce(jsonb_agg(item order by sort_date desc nulls last),'[]'::jsonb) from (
   select to_jsonb(l)||jsonb_build_object('status','published',
     'can_manage_access',public.can_read_private_web_book(l.book_project_id)) item,
     l.published_at sort_date
   from public.list_voice_library() l
   union all
   select jsonb_build_object('publication_id',p.id,'public_id',p.public_id,
     'book_project_id',p.book_project_id,'title',p.book_title,'subtitle',p.book_subtitle,
     'subject_name',p.subject_name,'published_at',p.published_at,'access_mode',p.access_mode,
     'relationship',case when b.owner_user_id=auth.uid() then 'owner' else 'managed' end,
     'status','disabled','can_manage_access',true),p.published_at
   from voice_publications p join book_projects b on b.id=p.book_project_id
   where p.status='disabled' and p.published_at is not null
     and public.can_read_private_web_book(p.book_project_id)
 ) entries
$$;
revoke all on function public.can_read_private_web_book(uuid),public.list_completed_web_book_library() from public,anon;
grant execute on function public.can_read_private_web_book(uuid),public.list_completed_web_book_library() to authenticated;

-- Public rate limiting intentionally rejects disabled publications. A separate
-- service-only counter supports already-authorized private bookshelf reads,
-- without reopening sharing or changing the anonymous circuit breaker.
create function public.register_private_web_book_request(input_publication_id uuid,input_client_hash text,input_request_kind text)
returns table(allowed boolean,circuit_open boolean,retry_after_seconds integer)
language plpgsql security definer set search_path=public,auth as $$
declare total bigint; window_at timestamptz:=date_bin(interval '10 minutes',clock_timestamp(),timestamptz '2001-01-01');
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
 if input_request_kind not in('metadata','asset','video_asset') or coalesce(input_client_hash,'')='' then raise exception 'Invalid request'; end if;
 if not exists(select 1 from voice_publications where id=input_publication_id and status='disabled' and published_at is not null) then
   return query select false,true,600;return;
 end if;
 insert into voice_publication_request_windows as w(publication_id,counter_key,request_kind,window_started_at,request_count)
 values(input_publication_id,'private:'||left(input_client_hash,128),input_request_kind,window_at,1)
 on conflict(publication_id,counter_key,request_kind,window_started_at) do update
 set request_count=w.request_count+1,updated_at=now() returning request_count into total;
 if total=1 then delete from voice_publication_request_windows where publication_id=input_publication_id
   and counter_key like 'private:%' and window_started_at<now()-interval '2 days';end if;
 return query select total<=case input_request_kind when 'metadata' then 30 when 'video_asset' then 60 else 120 end,false,
   greatest(1,extract(epoch from(window_at+interval '10 minutes'-clock_timestamp()))::integer);
end; $$;
revoke all on function public.register_private_web_book_request(uuid,text,text) from public,anon,authenticated;
grant execute on function public.register_private_web_book_request(uuid,text,text) to service_role;
commit;
