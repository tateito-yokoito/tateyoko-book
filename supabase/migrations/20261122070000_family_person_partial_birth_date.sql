-- Keep the existing family-place RPC for older clients. The new RPC writes
-- structured names and a partial birth date in one transaction.
alter table public.persons add column if not exists birth_month smallint;
alter table public.persons add column if not exists birth_day smallint;

alter table public.persons add constraint persons_birth_month_range
  check (birth_month is null or (birth_year is not null and birth_month between 1 and 12));
alter table public.persons add constraint persons_birth_day_range
  check (birth_day is null or (birth_month is not null and birth_day between 1 and 31));
alter table public.persons add constraint persons_birth_day_valid
  check (birth_day is null or birth_day <= extract(day from
    (make_date(birth_year,birth_month,1) + interval '1 month - 1 day')));

create or replace function public.create_family_place_person_profile(
  input_family_id uuid,
  input_family_name text,
  input_given_name text,
  input_is_self boolean default false,
  input_birth_year integer default null,
  input_birth_month smallint default null,
  input_birth_day smallint default null
) returns uuid language plpgsql security definer set search_path=public,auth as $$
declare
  result uuid;
  surname text := nullif(btrim(input_family_name),'');
  given text := nullif(btrim(input_given_name),'');
  full_name text;
begin
  full_name := btrim(concat_ws(' ',surname,given));
  if length(full_name) not between 1 and 100
    or length(coalesce(surname,'')) > 100 or length(coalesce(given,'')) > 100 then
    raise exception 'Name is required';
  end if;
  if (input_birth_year is null and (input_birth_month is not null or input_birth_day is not null))
    or (input_birth_month is null and input_birth_day is not null)
    or (input_birth_year is not null and input_birth_year not between 1800 and 2200)
    or (input_birth_month is not null and input_birth_month not between 1 and 12)
    or (input_birth_day is not null and (input_birth_day < 1 or input_birth_day >
      extract(day from (make_date(input_birth_year,input_birth_month,1) + interval '1 month - 1 day')))) then
    raise exception 'Invalid birth date';
  end if;
  result := public.create_family_place_person(input_family_id,full_name,input_is_self);
  update public.persons set family_name=surname,given_name=given,
    display_name=full_name,birth_year=input_birth_year,
    birth_month=input_birth_month,birth_day=input_birth_day
    where id=result and family_id=input_family_id;
  if not found then raise exception 'Person was not created'; end if;
  return result;
end;
$$;
revoke all on function public.create_family_place_person_profile(uuid,text,text,boolean,integer,smallint,smallint) from public,anon;
grant execute on function public.create_family_place_person_profile(uuid,text,text,boolean,integer,smallint,smallint) to authenticated;
