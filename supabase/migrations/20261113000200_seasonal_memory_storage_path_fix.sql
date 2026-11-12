-- Use a character class for the dot. It survives SQL migration transport
-- without a backslash being interpreted twice.
create or replace function public.seasonal_memory_path_record(input_path text)
returns uuid language plpgsql immutable set search_path=public as $$
begin
  if input_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|mp4|m4a|webm)$' then
    return null;
  end if;
  return split_part(input_path,'/',1)::uuid;
end; $$;
