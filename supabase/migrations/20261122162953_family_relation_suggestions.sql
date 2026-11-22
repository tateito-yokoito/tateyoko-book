-- A suggestion is only a decision about an existing pair. It never creates a
-- family relation by itself; the existing relation table remains the source of truth.
create table public.family_relation_suggestions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  kind text not null check (kind in ('shared_child_spouse','spouse_child_parent')),
  person_a_id uuid not null references public.persons(id) on delete cascade,
  person_b_id uuid not null references public.persons(id) on delete cascade,
  status text not null check (status in ('later','declined','accepted')),
  updated_at timestamptz not null default now(),
  check (person_a_id <> person_b_id),
  unique (family_id,kind,person_a_id,person_b_id)
);

create function public.family_relation_suggestion_validate() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  if not exists(select 1 from public.persons p where p.id=new.person_a_id and p.family_id=new.family_id)
    or not exists(select 1 from public.persons p where p.id=new.person_b_id and p.family_id=new.family_id) then
    raise exception 'People must belong to the same family' using errcode='23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger family_relation_suggestion_before_write before insert or update
on public.family_relation_suggestions for each row execute function public.family_relation_suggestion_validate();

alter table public.family_relation_suggestions enable row level security;
create policy family_relation_suggestion_read on public.family_relation_suggestions for select to authenticated
using (exists(select 1 from public.families f where f.id=family_id and f.owner_user_id=(select auth.uid())));
create policy family_relation_suggestion_insert on public.family_relation_suggestions for insert to authenticated
with check (exists(select 1 from public.families f where f.id=family_id and f.owner_user_id=(select auth.uid())));
create policy family_relation_suggestion_update on public.family_relation_suggestions for update to authenticated
using (exists(select 1 from public.families f where f.id=family_id and f.owner_user_id=(select auth.uid())))
with check (exists(select 1 from public.families f where f.id=family_id and f.owner_user_id=(select auth.uid())));
grant select,insert,update on public.family_relation_suggestions to authenticated;
