-- Keep all name readings on the existing person row. Existing values remain unchanged.
alter table public.persons add column if not exists maiden_name_kana text;

-- Home and family-tree registration both use this atomic person creation path.
-- The prior RPC remains available to older TEST clients.
create function public.create_family_tree_person_with_name_details(
  input_family_id uuid,input_family_name text,input_given_name text,input_is_self boolean,
  input_birth_year integer,input_birth_month smallint,input_birth_day smallint,
  input_gender text,input_anchor_id uuid,input_relation text,
  input_family_name_kana text,input_given_name_kana text,
  input_maiden_name text,input_maiden_name_kana text
) returns uuid language plpgsql security invoker set search_path=public as $$
declare result uuid;
begin
  result := public.create_family_tree_person_with_kana(input_family_id,input_family_name,input_given_name,
    input_is_self,input_birth_year,input_birth_month,input_birth_day,input_gender,
    input_anchor_id,input_relation,input_family_name_kana,input_given_name_kana);
  update public.persons set
    maiden_name=nullif(btrim(input_maiden_name),''),
    maiden_name_kana=nullif(btrim(input_maiden_name_kana),'')
  where id=result and family_id=input_family_id;
  if not found then raise exception 'Person could not be updated' using errcode='42501'; end if;
  return result;
end;
$$;
revoke all on function public.create_family_tree_person_with_name_details(uuid,text,text,boolean,integer,smallint,smallint,text,uuid,text,text,text,text,text) from public,anon;
grant execute on function public.create_family_tree_person_with_name_details(uuid,text,text,boolean,integer,smallint,smallint,text,uuid,text,text,text,text,text) to authenticated;
