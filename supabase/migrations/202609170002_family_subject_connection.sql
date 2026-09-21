-- Account/Person subject binding. No owner, payer, source record or order is moved.
-- Roll out only after the companion RLS/legacy/Edge guards and tests pass.
begin;
create schema if not exists family_private;
revoke all on schema family_private from public, anon, authenticated;
create table family_private.secret (id boolean primary key default true check(id), value bytea not null);
insert into family_private.secret values(true,extensions.gen_random_bytes(32));
-- Fail closed until all legacy RPC/Edge guards and TEST acceptance checks exist.
-- This is deliberately not writable through an application Account.
create table family_private.rollout (id boolean primary key default true check(id), enabled boolean not null default false, allowed_actor_ids uuid[] not null default '{}');
insert into family_private.rollout(id,enabled) values(true,false);
create table public.family_subject_bindings (
 person_id uuid primary key references public.persons(id),
 subject_user_id uuid unique references auth.users(id),
 initiated_by uuid not null references auth.users(id),
 initiated_at timestamptz not null default now(),
 claimed_at timestamptz, consent_version text,
 progress_enabled boolean not null default false,
 check((subject_user_id is null) = (claimed_at is null))
);
create table family_private.invites (
 id uuid primary key default gen_random_uuid(), person_id uuid not null references public.family_subject_bindings(person_id),
 project_id uuid not null references public.book_projects(id), issuer_id uuid not null references auth.users(id),
 token_hash bytea unique not null, phone_hash bytea not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 minutes',
 consumed_by uuid references auth.users(id), consumed_at timestamptz, cancelled_at timestamptz
);
create table public.family_uploads (
 id uuid primary key, project_id uuid not null references public.book_projects(id),
 actor_id uuid not null references auth.users(id), kind text not null check(kind in ('audio','photo')),
 path text unique not null, created_at timestamptz not null default now(),
 committed_at timestamptz, answer_id uuid references public.answers(id)
);
alter table public.family_subject_bindings enable row level security;
alter table public.family_uploads enable row level security;
revoke all on public.family_subject_bindings,public.family_uploads from anon,authenticated;
grant select on public.family_subject_bindings to authenticated;

create function public.family_managed(p uuid) returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from book_projects b join family_subject_bindings s on s.person_id=b.subject_person_id where b.id=p) $$;
create function public.family_subject(p uuid, u uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from book_projects b join family_subject_bindings s on s.person_id=b.subject_person_id where b.id=p and s.subject_user_id=u) $$;
create function public.family_supporter(p uuid, u uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from project_supporters s where s.book_project_id=p and s.supporter_user_id=u and s.status='active' and s.can_operate_recording) $$;
create function public.family_subject_or_legacy_owner(p uuid,u uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public
as $$ select case when family_managed(p) then family_subject(p,u) else exists(select 1 from book_projects where id=p and owner_user_id=u) end $$;

create policy family_binding_self_read on public.family_subject_bindings for select to authenticated using(subject_user_id=auth.uid());

create function public.family_enable(p uuid, consent boolean) returns void language plpgsql security definer set search_path=public,auth
as $$ declare b book_projects%rowtype; existing family_subject_bindings%rowtype;
begin
 if not (select enabled and auth.uid()=any(allowed_actor_ids) from family_private.rollout where id) then raise exception 'Family rollout is not enabled'; end if;
 if auth.uid() is null or consent is distinct from true then raise exception 'Consent required' using errcode='42501'; end if;
 select * into b from book_projects where id=p for update;
 if b.id is null or b.owner_user_id is distinct from auth.uid() or not family_supporter(p)
   or b.onboarding_preferences->>'support_mode' is distinct from 'child_led' then raise exception 'Forbidden' using errcode='42501'; end if;
 perform 1 from persons where id=b.subject_person_id for update;
 select * into existing from family_subject_bindings where person_id=b.subject_person_id;
 if found then return; end if;
 if exists(select 1 from user_person_links where person_id=b.subject_person_id and role='self') then raise exception 'Existing subject requires support'; end if;
 if exists(select 1 from voice_publications where book_project_id in(select id from book_projects where subject_person_id=b.subject_person_id) and status='published') then raise exception 'Published work requires privacy review'; end if;
 insert into family_subject_bindings(person_id,initiated_by,progress_enabled) values(b.subject_person_id,auth.uid(),true);
 -- Stop legacy support roles from expanding themselves through owner privileges.
 update project_supporters set can_edit_book_text=false,can_build_book=false,can_change_sharing=false,can_change_legacy=false,can_delete_story=false
 where book_project_id in(select id from book_projects where subject_person_id=b.subject_person_id);
end $$;

create function public.family_create(subject_name text, consent boolean, creation_key uuid) returns uuid language plpgsql security definer set search_path=public
as $$ declare p uuid;
begin
 if consent is distinct from true then raise exception 'Consent required'; end if;
 select book_project_id into p from create_child_led_family_story(subject_name,'parent',creation_key);
 perform family_enable(p,consent);
 return p;
end $$;

create function public.family_issue_invite(p uuid, phone text) returns jsonb language plpgsql security definer set search_path=public,auth,family_private,extensions
as $$ declare b book_projects%rowtype; binding family_subject_bindings%rowtype; token text; normal text;
begin
 if auth.uid() is null or not family_supporter(p) then raise exception 'Forbidden' using errcode='42501'; end if;
 select * into b from book_projects where id=p;
 select * into binding from family_subject_bindings where person_id=b.subject_person_id for update;
 if binding.person_id is null or binding.subject_user_id is not null then raise exception 'Initial connection unavailable'; end if;
 normal:=regexp_replace(phone,'[[:space:]()-]','','g');
 if normal ~ '^0[789]0[0-9]{8}$' then normal:='+81'||substr(normal,2); end if;
 if normal !~ '^\+81[789]0[0-9]{8}$' then raise exception 'Invalid mobile number'; end if;
 if exists(select 1 from auth.users u where u.id=auth.uid() and '+'||ltrim(u.phone,'+')=normal) then raise exception 'Use subject phone'; end if;
 if (select count(*) from family_private.invites where issuer_id=auth.uid() and created_at>now()-interval '15 minutes')>=3 then raise exception 'Invite rate limit'; end if;
 update family_private.invites set cancelled_at=now() where person_id=b.subject_person_id and consumed_at is null and cancelled_at is null;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into family_private.invites(person_id,project_id,issuer_id,token_hash,phone_hash)
 values(b.subject_person_id,p,auth.uid(),extensions.digest(token,'sha256'),extensions.hmac(convert_to(normal,'UTF8'),(select value from family_private.secret),'sha256'));
 return jsonb_build_object('token',token,'expires_in',1800);
end $$;

create function public.family_claim_invite(token text, consent boolean) returns uuid language plpgsql security definer set search_path=public,auth,family_private,extensions
as $$ declare inv family_private.invites%rowtype; binding family_subject_bindings%rowtype; account auth.users%rowtype; p uuid;
begin
 if auth.uid() is null or consent is distinct from true or token !~ '^[a-f0-9]{64}$' then raise exception 'Connection unavailable' using errcode='42501'; end if;
 select * into inv from family_private.invites where token_hash=extensions.digest(token,'sha256');
 if inv.id is null then raise exception 'Connection unavailable'; end if;
 -- Serialize by Person before invite rows; no inverse lock order with issuance.
 select * into binding from family_subject_bindings where person_id=inv.person_id for update;
 select * into inv from family_private.invites where id=inv.id for update;
 if inv.consumed_by=auth.uid() and binding.subject_user_id=auth.uid() then return inv.project_id; end if;
 if inv.consumed_at is not null or inv.cancelled_at is not null or inv.expires_at<=now() or binding.subject_user_id is not null
  or inv.issuer_id=auth.uid() or not family_supporter(inv.project_id,inv.issuer_id) then raise exception 'Connection unavailable'; end if;
 select * into account from auth.users where id=auth.uid() for update;
 if account.phone_confirmed_at is null or account.phone is null or account.last_sign_in_at is null or account.last_sign_in_at<now()-interval '10 minutes'
  or not exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]')) a where a->>'method'='otp' and (a->>'timestamp')::numeric>extract(epoch from now()-interval '10 minutes'))
  or extensions.hmac(convert_to('+'||ltrim(account.phone,'+'),'UTF8'),(select value from family_private.secret),'sha256')<>inv.phone_hash
  then raise exception 'Verified phone required' using errcode='42501'; end if;
 if exists(select 1 from user_person_links where user_id=auth.uid() and role='self' and person_id<>inv.person_id)
   or exists(select 1 from user_person_links where person_id=inv.person_id and role='self' and user_id<>auth.uid())
   or exists(select 1 from family_subject_bindings where subject_user_id=auth.uid()) then raise exception 'Existing identity requires support'; end if;
 insert into profiles(id,name,email) values(auth.uid(),'あなた',null) on conflict(id) do nothing;
 update family_subject_bindings set subject_user_id=auth.uid(),claimed_at=now(),consent_version='family-v1',progress_enabled=true where person_id=inv.person_id;
 insert into user_person_links(user_id,person_id,role) values(auth.uid(),inv.person_id,'self') on conflict(user_id,person_id) do update set role='self';
 update project_participants set user_id=auth.uid() where person_id=inv.person_id and role in('subject','speaker') and user_id is null;
 update family_private.invites set consumed_by=auth.uid(),consumed_at=now() where id=inv.id;
 update family_private.invites set cancelled_at=now() where person_id=inv.person_id and id<>inv.id and consumed_at is null and cancelled_at is null;
 return inv.project_id;
end $$;

create function public.family_answer_visible(a uuid, u uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from answers x where x.id=a and (family_subject(x.book_project_id,u) or (
 x.access_override<>'private_forever' and u=auth.uid() and shared_story_recipient_can_view(x.book_project_id)))) $$;

create function public.family_question_allowed(q uuid) returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from user_questions uq where uq.id=q and uq.is_active and experience_data_allowed(uq.book_project_id,true)
 and (uq.meta_json->>'onboarding_group'='trial_experience'
  or exists(select 1 from experience_contracts c where c.book_project_id=uq.book_project_id and c.payment_confirmed_at is not null and c.refund_confirmed_at is null and c.production_started_at is not null and c.production_expires_at>now())
  or (not exists(select 1 from experience_contracts c where c.book_project_id=uq.book_project_id)
   and exists(select 1 from commerce_orders o where o.book_project_id=uq.book_project_id and o.status='paid' and o.includes_base_book)))) $$;

create function public.family_workspace(p uuid) returns jsonb language plpgsql stable security definer set search_path=public,auth
as $$ declare b book_projects%rowtype; s family_subject_bindings%rowtype; own boolean; progress boolean;
begin
 select * into b from book_projects where id=p;
 select * into s from family_subject_bindings where person_id=b.subject_person_id;
 own:=family_subject(p); progress:=own or (s.progress_enabled and family_supporter(p));
 if s.person_id is null or auth.uid() is null or not (own or family_supporter(p)) then raise exception 'Forbidden' using errcode='42501'; end if;
 return jsonb_build_object('project_id',p,'person_id',b.subject_person_id,'name',(select display_name from persons where id=b.subject_person_id),
 'role',case when own then 'subject' else 'supporter' end,'connected',s.claimed_at is not null,'progress_enabled',s.progress_enabled,
 'answered',case when progress then (select count(distinct user_question_id) from answers where book_project_id=p) else null end,
 'last_saved_at',case when progress then (select max(created_at) from answers where book_project_id=p) else null end,
 'questions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'text',question_text_snapshot,'sequence_order',sequence_order,'available',family_question_allowed(id),'answered',case when progress then status='answered' else null end) order by sequence_order),'[]') from user_questions where book_project_id=p and is_active and (own or (custom_question_text is null and coalesce(meta_json->>'is_custom','false')<>'true'))),
 'answers',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'question_id',a.user_question_id,'text',coalesce(a.transcript_edited,a.transcript_raw,''),'private',a.access_override='private_forever','created_at',a.created_at,
 'media',(select coalesce(jsonb_agg(jsonb_build_object('kind',m.asset_type,'path',m.storage_path)),'[]') from media_assets m where m.answer_id=a.id)) order by a.created_at),'[]') from answers a where a.book_project_id=p and family_answer_visible(a.id)),
 'photos',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'path',path,'created_at',created_at) order by created_at),'[]') from family_uploads where project_id=p and kind='photo' and committed_at is not null and (own or actor_id=auth.uid())));
end $$;

create function public.family_list_workspaces() returns jsonb language sql stable security definer set search_path=public
as $$ select coalesce(jsonb_agg(jsonb_build_object('project_id',b.id,'person_id',b.subject_person_id,'name',p.display_name,'role',case when s.subject_user_id=auth.uid() then 'subject' else 'supporter' end) order by b.created_at),'[]')
 from book_projects b join family_subject_bindings s on s.person_id=b.subject_person_id join persons p on p.id=s.person_id
 where b.status='active' and (s.subject_user_id=auth.uid() or family_supporter(b.id)) $$;

create function public.family_reserve_upload(p uuid, kind text, extension text) returns jsonb language plpgsql security definer set search_path=public
as $$ declare upload uuid:=gen_random_uuid(); object_path text;
begin
 if not family_managed(p) or not (family_subject(p) or family_supporter(p)) or not experience_data_allowed(p,true) then raise exception 'Forbidden' using errcode='42501'; end if;
 if kind is null or extension is null or (kind='audio' and extension not in('webm','mp4','aac')) or (kind='photo' and extension not in('jpg','png','webp')) or kind not in('audio','photo') then raise exception 'Invalid file'; end if;
 object_path:='family/'||p||'/'||auth.uid()||'/'||upload||'.'||extension;
 insert into family_uploads(id,project_id,actor_id,kind,path) values(upload,p,auth.uid(),kind,object_path);
 return jsonb_build_object('id',upload,'path',object_path,'bucket',case when kind='photo' then 'photos' else 'audio' end);
end $$;

create function public.family_commit_recording(upload_id uuid, question_uuid uuid, text_value text, share boolean, continuation uuid default null) returns uuid language plpgsql security definer set search_path=public
as $$ declare u family_uploads%rowtype; q user_questions%rowtype; b book_projects%rowtype; answer uuid; sequence integer; prior answers%rowtype;
begin
 select * into u from family_uploads where id=upload_id for update;
 if u.actor_id is distinct from auth.uid() or u.kind<>'audio' or not (family_subject(u.project_id) or family_supporter(u.project_id)) then raise exception 'Forbidden' using errcode='42501'; end if;
 if u.committed_at is not null then return u.answer_id; end if;
 if not experience_data_allowed(u.project_id,true) then raise exception 'Production access suspended'; end if;
 select * into b from book_projects where id=u.project_id;
 select * into q from user_questions where id=question_uuid and book_project_id=u.project_id and is_active for update;
 if q.id is null or not exists(select 1 from storage.objects where bucket_id='audio' and name=u.path) then raise exception 'Recording unavailable'; end if;
 if not family_question_allowed(q.id) then raise exception 'Question requires production access'; end if;
 if length(coalesce(text_value,''))>100000 then raise exception 'Text too long'; end if;
 if continuation is not null then
  select * into prior from answers where id=continuation and book_project_id=u.project_id and user_question_id=q.id for update;
  if prior.id is null or not family_answer_visible(prior.id) then raise exception 'Continuation forbidden'; end if;
  -- Supporters may append to a shared answer, never replace text or sharing.
  answer:=prior.id;
  update answers set transcript_raw=concat_ws(E'\n\n',nullif(transcript_raw,''),nullif(text_value,'')),
   transcript_edited=concat_ws(E'\n\n',nullif(transcript_edited,''),nullif(text_value,'')),
   meta_json=coalesce(meta_json,'{}')||jsonb_build_object('last_actor_user_id',auth.uid()) where id=answer;
 else
  -- Existing unique(user_id,sequence_order) is account-wide, not project-wide.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select coalesce(max(sequence_order),0)+1 into sequence from answers where user_id=auth.uid();
  insert into answers(user_id,sequence_order,book_project_id,speaker_person_id,subject_person_id,user_question_id,question_id,transcript_raw,transcript_edited,access_override,meta_json)
  values(auth.uid(),sequence,b.id,b.subject_person_id,b.subject_person_id,q.id,q.question_id,coalesce(text_value,''),coalesce(text_value,''),case when share then 'inherit' else 'private_forever' end,
   jsonb_build_object('actor_user_id',auth.uid(),'subject_person_id',b.subject_person_id,'co_present_attested',not family_subject(b.id))) returning id into answer;
 end if;
 insert into media_assets(answer_id,user_id,family_id,book_project_id,person_id,asset_type,storage_path,meta_json)
 values(answer,auth.uid(),b.family_id,b.id,b.subject_person_id,'audio',u.path,jsonb_build_object('actor_user_id',auth.uid(),'segment_id',u.id));
 update family_uploads set committed_at=now(),answer_id=answer where id=u.id;
 update user_questions set status='answered',answered_at=coalesce(answered_at,now()) where id=q.id;
 return answer;
end $$;

create function public.family_commit_photo(upload_id uuid) returns void language plpgsql security definer set search_path=public
as $$ declare u family_uploads%rowtype;
begin
 select * into u from family_uploads where id=upload_id for update;
 if u.actor_id is distinct from auth.uid() or u.kind<>'photo' or not (family_subject(u.project_id) or family_supporter(u.project_id)) or not experience_data_allowed(u.project_id,true) then raise exception 'Forbidden' using errcode='42501'; end if;
 if not exists(select 1 from storage.objects where bucket_id='photos' and name=u.path) then raise exception 'Photo unavailable'; end if;
 update family_uploads set committed_at=coalesce(committed_at,now()) where id=u.id;
end $$;

create function public.family_set_progress(p uuid, enabled boolean) returns void language plpgsql security definer set search_path=public
as $$ begin if not family_subject(p) then raise exception 'Forbidden' using errcode='42501'; end if;
 update family_subject_bindings set progress_enabled=enabled where person_id=(select subject_person_id from book_projects where id=p); end $$;

-- The subject controls content sharing separately from progress consent.
create function public.family_set_answer_sharing(a uuid, share boolean) returns void language plpgsql security definer set search_path=public
as $$ declare p uuid; preference uuid;
begin
 select book_project_id into p from answers where id=a for update;
 if share is null or not family_subject(p) then raise exception 'Forbidden' using errcode='42501'; end if;
 if share then
  insert into story_sharing_preferences(book_project_id,owner_person_id,live_scope,selected_sharing_enabled)
  select p,subject_person_id,'selected',true from book_projects where id=p
  on conflict(book_project_id) do update set selected_sharing_enabled=true returning id into preference;
  insert into story_share_recipients(sharing_preference_id,recipient_user_id,recipient_phase,source,status)
  select preference,supporter_user_id,'live','supporter','active' from project_supporters ps
  where ps.book_project_id=p and ps.status='active'
  and not exists(select 1 from story_share_recipients r where r.sharing_preference_id=preference and r.recipient_user_id=ps.supporter_user_id and r.recipient_phase in('live','both') and r.status='active');
 end if;
 update answers set access_override=case when share then 'inherit' else 'private_forever' end where id=a;
end $$;

-- Default PUBLIC execute must never expose token/phone data or private tables.
revoke all on all tables in schema family_private from public,anon,authenticated;
do $$ declare f record; begin for f in select oid::regprocedure as sig from pg_proc where pronamespace='public'::regnamespace and proname like 'family\_%' escape '\' loop
 execute format('revoke all on function %s from public,anon',f.sig);
 execute format('grant execute on function %s to authenticated,service_role',f.sig);
end loop; end $$;
commit;
