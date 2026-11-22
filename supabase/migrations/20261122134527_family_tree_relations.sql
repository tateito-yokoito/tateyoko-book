-- Family tree uses existing persons. A is the parent for parent_child;
-- spouse pairs use UUID order. No BOOK or answer rows are touched.
create table public.family_person_relations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  person_a_id uuid not null references public.persons(id) on delete cascade,
  person_b_id uuid not null references public.persons(id) on delete cascade,
  relation_type text not null check (relation_type in ('parent_child','spouse')),
  created_at timestamptz not null default now(),
  check (person_a_id <> person_b_id),
  check (relation_type <> 'spouse' or person_a_id < person_b_id),
  unique(family_id,relation_type,person_a_id,person_b_id)
);
create index family_person_relations_b_idx on public.family_person_relations(family_id,person_b_id);

create function public.family_tree_validate_relation() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.family_id::text));
  if not exists(select 1 from public.persons p where p.id=new.person_a_id and p.family_id=new.family_id)
    or not exists(select 1 from public.persons p where p.id=new.person_b_id and p.family_id=new.family_id) then
    raise exception 'People must belong to the same family' using errcode='23514';
  end if;
  if new.relation_type='parent_child' and exists (
    with recursive descendants(id) as (
      select new.person_b_id
      union
      select r.person_b_id from public.family_person_relations r
      join descendants d on r.person_a_id=d.id
      where r.family_id=new.family_id and r.relation_type='parent_child'
        and r.id is distinct from new.id
    ) select 1 from descendants where id=new.person_a_id
  ) then
    raise exception 'A parent-child cycle is not allowed' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger family_tree_validate_before_write before insert or update
on public.family_person_relations for each row execute function public.family_tree_validate_relation();

alter table public.family_person_relations enable row level security;
create policy family_tree_read on public.family_person_relations for select to authenticated
using (exists(select 1 from public.families f where f.id=family_id and f.owner_user_id=(select auth.uid())));
create policy family_tree_insert on public.family_person_relations for insert to authenticated
with check (exists(select 1 from public.families f where f.id=family_id and f.owner_user_id=(select auth.uid())));
create policy family_tree_update on public.family_person_relations for update to authenticated
using (exists(select 1 from public.families f where f.id=family_id and f.owner_user_id=(select auth.uid())))
with check (exists(select 1 from public.families f where f.id=family_id and f.owner_user_id=(select auth.uid())));
create policy family_tree_delete on public.family_person_relations for delete to authenticated
using (exists(select 1 from public.families f where f.id=family_id and f.owner_user_id=(select auth.uid())));
grant select,insert,update,delete on public.family_person_relations to authenticated;

-- Both entry points call this transaction so a failed relation never leaves a new person behind.
create function public.create_family_tree_person(
  input_family_id uuid,input_family_name text,input_given_name text,input_is_self boolean,
  input_birth_year integer,input_birth_month smallint,input_birth_day smallint,
  input_gender text,input_anchor_id uuid,input_relation text
) returns uuid language plpgsql security invoker set search_path=public as $$
declare result uuid; first_id uuid; second_id uuid; kind text;
begin
  if auth.uid() is null or not exists(select 1 from public.families f
    where f.id=input_family_id and f.owner_user_id=auth.uid()) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if input_gender is not null and input_gender not in ('female','male') then
    raise exception 'Invalid gender';
  end if;
  if input_relation is not null and input_relation not in ('father','mother','spouse','child') then
    raise exception 'Invalid relation';
  end if;
  if input_relation is not null and (input_anchor_id is null or not exists(
    select 1 from public.persons p where p.id=input_anchor_id and p.family_id=input_family_id)) then
    raise exception 'Anchor person is unavailable';
  end if;
  result := public.create_family_place_person_profile(input_family_id,input_family_name,
    input_given_name,input_is_self,input_birth_year,input_birth_month,input_birth_day);
  if input_gender is not null then
    update public.persons set gender=input_gender where id=result and family_id=input_family_id;
  end if;
  if input_relation is not null then
    if input_relation in ('father','mother') then
      first_id:=result; second_id:=input_anchor_id; kind:='parent_child';
    elsif input_relation='child' then
      first_id:=input_anchor_id; second_id:=result; kind:='parent_child';
    else
      first_id:=least(input_anchor_id,result); second_id:=greatest(input_anchor_id,result); kind:='spouse';
    end if;
    insert into public.family_person_relations(family_id,person_a_id,person_b_id,relation_type)
    values(input_family_id,first_id,second_id,kind);
  end if;
  return result;
end;
$$;
revoke all on function public.create_family_tree_person(uuid,text,text,boolean,integer,smallint,smallint,text,uuid,text) from public,anon;
grant execute on function public.create_family_tree_person(uuid,text,text,boolean,integer,smallint,smallint,text,uuid,text) to authenticated;
