-- Production collaborators are not viewers, payers, or subject identities.
-- Existing supporters receive NO implicit upgrade: an explicit consent is needed.
begin;
create table public.family_production_consents (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.book_projects(id),
 person_id uuid not null references public.persons(id),
 supporter_id uuid not null references public.project_supporters(id),
 supporter_user_id uuid not null references auth.users(id),
 confirmed_by uuid not null references auth.users(id),
 confirmed_at timestamptz not null default now(),
 consent_version text not null default 'production-support-v1',
 subject_intent_confirmed boolean not null check(subject_intent_confirmed),
 revoked_at timestamptz, revoked_by uuid references auth.users(id)
);
create unique index family_production_active on public.family_production_consents(project_id,supporter_user_id) where revoked_at is null;
create table public.family_production_events (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.book_projects(id),
 person_id uuid not null references public.persons(id),
 actor_id uuid not null references auth.users(id),
 supporter_id uuid references public.project_supporters(id),
 consent_id uuid references public.family_production_consents(id),
 event text not null check(event in('consent','revoke','mode','starting_chapter','main_experience')),
 detail jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table public.family_subject_bindings add column production_mode text check(production_mode in('self','supporter'));
alter table public.family_production_consents enable row level security;
alter table public.family_production_events enable row level security;
revoke all on public.family_production_consents,public.family_production_events from public,anon,authenticated;

create function public.family_production_supporter(p uuid,u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from family_production_consents c
 join project_supporters s on s.id=c.supporter_id and s.book_project_id=c.project_id and s.supporter_user_id=c.supporter_user_id
 join book_projects b on b.id=c.project_id and b.subject_person_id=c.person_id
 where c.project_id=p and c.supporter_user_id=u and c.revoked_at is null and s.status='active' and s.can_operate_recording)
$$;
create function public.family_creator(p uuid,u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
 select family_subject(p,u) or family_production_supporter(p,u)
$$;
create function public.family_person_creator(p uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from book_projects where subject_person_id=p and family_creator(id))
$$;

create function public.family_confirm_production_support(p uuid,supporter uuid,confirmed boolean,mode text default 'supporter') returns uuid
language plpgsql security definer set search_path=public,auth as $$
declare b book_projects%rowtype; s project_supporters%rowtype; c family_production_consents%rowtype;
begin
 if auth.uid() is null or confirmed is distinct from true or mode not in('self','supporter') or mode is null then raise exception 'Explicit production consent required' using errcode='42501';end if;
 select * into b from book_projects where id=p and status='active' for update;
 if b.id is null or not family_managed(p) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into s from project_supporters where book_project_id=p and supporter_user_id=supporter and status='active' and can_operate_recording for update;
 if s.id is null or not (family_subject(p) or (auth.uid()=supporter and family_supporter(p))) then raise exception 'Forbidden' using errcode='42501';end if;
 -- An attestation is not a way to undo the subject's withdrawal of access.
 if not family_subject(p) and exists(select 1 from family_production_consents where project_id=p and supporter_user_id=supporter and revoked_at is not null and revoked_by<>supporter)
 then raise exception 'Subject approval required after revocation' using errcode='42501';end if;
 if mode='self' and not exists(select 1 from family_subject_bindings where person_id=b.subject_person_id and subject_user_id is not null) then raise exception 'Subject account required for self mode';end if;
 select * into c from family_production_consents where project_id=p and supporter_user_id=supporter and revoked_at is null;
 if not found then
  insert into family_production_consents(project_id,person_id,supporter_id,supporter_user_id,confirmed_by,subject_intent_confirmed)
  values(p,b.subject_person_id,s.id,supporter,auth.uid(),true) returning * into c;
  insert into family_production_events(project_id,person_id,actor_id,supporter_id,consent_id,event)
  values(p,b.subject_person_id,auth.uid(),s.id,c.id,'consent');
 end if;
 if (select production_mode from family_subject_bindings where person_id=b.subject_person_id) is distinct from mode then
  update family_subject_bindings set production_mode=mode where person_id=b.subject_person_id;
  insert into family_production_events(project_id,person_id,actor_id,supporter_id,consent_id,event,detail)
  values(p,b.subject_person_id,auth.uid(),s.id,c.id,'mode',jsonb_build_object('mode',mode));
 end if;
 return c.id;
end $$;

create function public.family_revoke_production_support(p uuid,supporter uuid) returns void
language plpgsql security definer set search_path=public,auth as $$
declare c family_production_consents%rowtype;
begin
 if auth.uid() is null or not (family_subject(p) or auth.uid()=supporter) then raise exception 'Forbidden' using errcode='42501';end if;
 perform 1 from book_projects where id=p for update;
 update family_production_consents set revoked_at=now(),revoked_by=auth.uid()
 where project_id=p and supporter_user_id=supporter and revoked_at is null returning * into c;
 if found then insert into family_production_events(project_id,person_id,actor_id,supporter_id,consent_id,event)
 values(p,c.person_id,auth.uid(),c.supporter_id,c.id,'revoke');end if;
end $$;

create or replace function public.family_answer_visible(a uuid,u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from answers x where x.id=a and (family_creator(x.book_project_id,u)
 or (x.access_override<>'private_forever' and u=auth.uid() and shared_story_recipient_can_view(x.book_project_id))))
$$;

-- Upgrade only named production operations. Identity claim, invitation proof,
-- payer classification, refund policy and destructive owner actions stay intact.
do $$declare f record; definition text; names text[]:=array[
 'can_manage_book_cover','can_manage_video_stories','assert_experience_processing',
 'family_original_asset_read','family_storage_access','family_recipient_allowed',
 'family_finish_starting_chapter','family_photo_question','family_commit_photo_voice',
 'family_edit_story','family_remove_story_photo','family_attach_story_photo',
 'family_voice_edit_context','family_revise_voice','family_order_privacy_guard'];
begin
 foreach definition in array names loop
  if not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname=definition) then raise exception 'Missing production prerequisite %',definition;end if;
 end loop;
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname=any(names) loop
  definition:=pg_get_functiondef(f.oid);
  if position('family_subject(' in definition)=0 then raise exception 'Production guard drift: %',f.oid::regprocedure;end if;
  execute replace(definition,'family_subject(','family_creator(');
 end loop;
 select pg_get_functiondef('family_private.theme_navigation(uuid)'::regprocedure) into definition;
 execute replace(definition,'not family_subject(p)','not family_creator(p)');
 -- Keep actual role identity; add capabilities instead of calling a supporter the subject.
 select pg_get_functiondef('public.family_workspace(uuid)'::regprocedure) into definition;
 definition:=replace(definition,'progress:=own or','progress:=family_creator(p) or');
 definition:=replace(definition,'(own or (custom_question_text','(family_creator(p) or (custom_question_text');
 definition:=replace(definition,'(own or actor_id=auth.uid())','(family_creator(p) or actor_id=auth.uid())');
 definition:=replace(definition,'''connected'',s.claimed_at is not null', '''can_produce'',family_creator(p),''production_mode'',s.production_mode,''connected'',s.claimed_at is not null');
 execute definition;
 select pg_get_functiondef('public.family_journey(uuid)'::regprocedure) into definition;
 execute replace(definition,'w->>''role''=''subject''','(w->>''can_produce'')::boolean');
end $$;

create or replace function public.can_confirm_experience_intent(input_project_id uuid) returns boolean
language sql stable security definer set search_path=public,auth as $$
 select auth.uid() is not null and exists(select 1 from book_projects p where p.id=input_project_id and p.status='active'
 and case when family_managed(p.id) then family_subject(p.id) or (family_production_supporter(p.id)
 and exists(select 1 from family_subject_bindings where person_id=p.subject_person_id and production_mode='supporter'))
 else p.owner_user_id=auth.uid() or exists(select 1 from project_supporters s where s.book_project_id=p.id and s.supporter_user_id=auth.uid() and s.status='active' and s.can_operate_recording) end)
$$;

create function public.family_audit_experience_start() returns trigger
language plpgsql security definer set search_path=public,auth as $$
declare c family_production_consents%rowtype; person uuid; event_name text;
begin
 if not family_managed(new.book_project_id) then return new;end if;
 select subject_person_id into person from book_projects where id=new.book_project_id;
 select * into c from family_production_consents where project_id=new.book_project_id and supporter_user_id=auth.uid() and revoked_at is null;
 if old.production_started_at is null and new.production_started_at is not null then event_name:='starting_chapter';
 elsif old.main_experience_started_at is null and new.main_experience_started_at is not null then event_name:='main_experience';
 else return new;end if;
 if auth.uid() is null or not can_confirm_experience_intent(new.book_project_id) then raise exception 'Production start actor required' using errcode='42501';end if;
 insert into family_production_events(project_id,person_id,actor_id,supporter_id,consent_id,event,detail)
 values(new.book_project_id,person,auth.uid(),c.supporter_id,c.id,event_name,jsonb_build_object('contract_id',new.id,'subject_intent_confirmed',true));
 return new;
end $$;
create trigger family_experience_start_audit after update of production_started_at,main_experience_started_at on experience_contracts
for each row execute function family_audit_experience_start();

create or replace function public.family_assert_operation(p uuid,u uuid,operation text,answer uuid default null) returns boolean
language plpgsql stable security definer set search_path=public as $$
begin
 if not family_managed(p) then return false;end if;
 if u is null then raise exception 'Forbidden' using errcode='42501';end if;
 if answer is not null and not exists(select 1 from answers where id=answer and book_project_id=p) then raise exception 'Forbidden answer' using errcode='42501';end if;
 if family_subject(p,u) then return true;end if;
 if family_production_supporter(p,u) and operation in('manage','process','record') then return true;end if;
 if operation='record' and family_supporter(p,u) and answer is null then return true;end if;
 raise exception 'Forbidden' using errcode='42501';
end $$;

-- Family sharing does NOT enroll supporters as viewer recipients. Existing
-- explicitly chosen recipients are retained; production access is independent.
create or replace function public.family_set_answer_sharing(a uuid,share boolean) returns void
language plpgsql security definer set search_path=public as $$
declare p uuid;
begin
 select book_project_id into p from answers where id=a for update;
 if share is null or not family_creator(p) or not experience_data_allowed(p,true) then raise exception 'Forbidden' using errcode='42501';end if;
 update answers set access_override=case when share then 'inherit' else 'private_forever' end where id=a;
end $$;

-- Restrictive guards still intersect legacy owner grants. No direct answer,
-- media, identity, role, project or consent writes are opened.
alter policy family_person_read_guard on persons using(not family_person_managed(id) or family_person_creator(id));
create policy family_person_creator_read on persons for select to authenticated using(family_person_creator(id));
alter policy family_project_read_guard on book_projects using(not family_managed(id) or family_creator(id));
create policy family_project_creator_read on book_projects for select to authenticated using(family_creator(id));
create policy family_answer_creator_read on answers for select to authenticated using(family_creator(book_project_id));
create policy family_media_creator_read on media_assets for select to authenticated using(family_creator(book_project_id));
do $$declare t text;begin
 foreach t in array array['user_questions','project_introductions','story_context_terms','video_stories','book_cover_settings'] loop
  execute format('alter policy family_guard on %I using(not family_managed(book_project_id) or family_creator(book_project_id))',t);
  execute format('create policy family_creator_read on %I for select to authenticated using(family_creator(book_project_id))',t);
 end loop;
end $$;
alter policy family_guard on book_cover_settings with check(not family_managed(book_project_id) or family_creator(book_project_id));
create policy family_creator_cover on book_cover_settings for all to authenticated using(family_creator(book_project_id)) with check(family_creator(book_project_id));
alter policy family_sharing_guard on story_sharing_preferences using(not family_managed(book_project_id) or family_creator(book_project_id)) with check(not family_managed(book_project_id) or family_creator(book_project_id));
create policy family_sharing_creator on story_sharing_preferences for all to authenticated using(family_creator(book_project_id)) with check(family_creator(book_project_id));

-- Selecting a story for a book is independent of sharing it with viewers.
-- Keep the private-excluding default selection; allow explicit inclusion.
do $$declare sig text;definition text;needle text:='a.access_override is distinct from ''private_forever''';begin
 foreach sig in array array['public.save_book_selection(uuid,uuid[],integer)','public.confirm_book_work(uuid,integer,boolean)'] loop
  select pg_get_functiondef(sig::regprocedure) into definition;
  if position(needle in definition)=0 then raise exception 'Book selection changed: %',sig;end if;
  execute replace(definition,needle,'(family_managed(input_project_id) or a.access_override is distinct from ''private_forever'')');
 end loop;
end $$;

do $$declare f record;begin
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname in('family_production_supporter','family_creator','family_person_creator','family_confirm_production_support','family_revoke_production_support') loop
  execute format('revoke all on function %s from public,anon',f.sig);
  execute format('grant execute on function %s to authenticated,service_role',f.sig);
 end loop;
end $$;
revoke all on function family_audit_experience_start() from public,anon,authenticated;
commit;
