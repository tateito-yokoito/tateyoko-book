begin;

grant select, update
  on table public.project_invites
  to service_role;

grant select
  on table public.persons
  to service_role;

commit;
