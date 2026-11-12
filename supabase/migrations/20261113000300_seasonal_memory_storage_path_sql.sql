-- Keep path parsing in a SQL expression so policy evaluation and direct calls
-- use exactly the same regex result.
create or replace function public.seasonal_memory_path_record(input_path text)
returns uuid language sql immutable set search_path=public as $$
  select case when input_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|mp4|m4a|webm)$'
    then split_part(input_path,'/',1)::uuid else null end;
$$;
