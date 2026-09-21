begin;
-- A/B production and C subject connection have independent release gates.
-- The original rollout table starts OFF with an empty allowlist on production.
alter table family_private.rollout add column subject_connection_enabled boolean not null default false;
create function public.family_release_actor_allowed(p uuid,u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public,family_private as $$
 select u is not null and exists(select 1 from family_private.rollout r
 join book_projects b on b.id=p left join family_subject_bindings f on f.person_id=b.subject_person_id
 where r.id and r.enabled and (u=any(r.allowed_actor_ids)
 or (f.subject_user_id=u and f.initiated_by=any(r.allowed_actor_ids))))
$$;
revoke all on function public.family_release_actor_allowed(uuid,uuid) from public,anon;
grant execute on function public.family_release_actor_allowed(uuid,uuid) to authenticated,service_role;
-- Preserve consent/revocation/role checks. Gate both the production and legacy
-- supporter paths, including direct RPC/RLS/storage, not just the frontend.
do $$ declare definition text; signature text; needle text;
begin
 foreach signature in array array['public.family_supporter(uuid,uuid)','public.family_production_supporter(uuid,uuid)'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  needle:='select exists(select 1 from ';
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Unexpected gate target: %',signature;end if;
  execute replace(definition,needle,'select family_release_actor_allowed(p,u) and exists(select 1 from ');
 end loop;
 foreach signature in array array['public.family_issue_invite(uuid,text)','public.family_claim_invite(text,boolean)'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  needle:=E'begin\n';
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Unexpected connection target: %',signature;end if;
  execute replace(definition,needle,needle||E' if not coalesce((select enabled and subject_connection_enabled from family_private.rollout where id),false) then raise exception ''Subject connection is not released'' using errcode=''42501'';end if;\n');
 end loop;
end $$;
comment on column family_private.rollout.subject_connection_enabled is 'Independent C release gate; OFF until real SMS and revocation E2E passes. Does not revoke already connected subjects.';
commit;
