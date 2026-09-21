begin;
-- Progress mode is a UX preference, not a grant or a withdrawal of authority.
comment on column public.family_subject_bindings.production_mode is
 'Primary way of progressing (self/supporter), not authorization. Production authority requires an active project_supporters relationship and an unrevoked family_production_consents record.';
comment on table public.family_production_consents is
 'Explicit production attestation. An already authorized supporter may attest that they checked the subject intent; confirmed_by is the actual actor, not proof of subject authentication. Subject revocation cannot be undone by supporter self-attestation.';

create or replace function public.can_confirm_experience_intent(input_project_id uuid) returns boolean
language sql stable security definer set search_path=public,auth as $$
 select auth.uid() is not null and exists(select 1 from book_projects p where p.id=input_project_id and p.status='active'
 and case when family_managed(p.id) then family_creator(p.id)
 else p.owner_user_id=auth.uid() or exists(select 1 from project_supporters s where s.book_project_id=p.id and s.supporter_user_id=auth.uid() and s.status='active' and s.can_operate_recording) end)
$$;
-- Each start RPC still requires its own explicit subject-intent confirmation.
-- Do not let subject revocation fall back to legacy recording/upload access.
create or replace function public.family_supporter(p uuid,u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from project_supporters s
 where s.book_project_id=p and s.supporter_user_id=u and s.status='active' and s.can_operate_recording
 and (not exists(select 1 from family_production_consents c where c.project_id=p and c.supporter_user_id=u and c.revoked_at is not null and c.revoked_by<>u)
 or exists(select 1 from family_production_consents c where c.project_id=p and c.supporter_user_id=u and c.revoked_at is null and c.supporter_id=s.id)))
$$;
-- Subject-only management for an account attached later.
create function public.family_list_production_supporters(p uuid) returns jsonb
language plpgsql stable security definer set search_path=public,auth as $$
begin
 if auth.uid() is null or not family_subject(p) then raise exception 'Subject access required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object(
  'supporter_user_id',c.supporter_user_id,'display_name',coalesce(person.preferred_name,person.display_name,'サポーター'),
  'confirmed_at',c.confirmed_at) order by c.confirmed_at),'[]'::jsonb)
 from family_production_consents c join project_supporters s on s.id=c.supporter_id
 left join persons person on person.id=s.supporter_person_id
 where c.project_id=p and c.revoked_at is null and s.status='active' and s.can_operate_recording);
end $$;
revoke all on function public.family_list_production_supporters(uuid) from public,anon;
grant execute on function public.family_list_production_supporters(uuid) to authenticated;
commit;
