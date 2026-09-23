begin;
-- Only new/changed PINs are restricted. Existing hashes and verification remain intact.
create or replace function public.set_voice_publication_access_code(input_publication_id uuid,input_code text)
returns void language plpgsql security definer set search_path=public,extensions as $$
declare normalized_code text:=btrim(coalesce(input_code,''));
begin
 if auth.role() is distinct from 'service_role' then raise exception 'forbidden'; end if;
 if normalized_code<>'' and normalized_code !~ '^[0-9]{4}$' then raise exception 'PIN must be 4 digits'; end if;
 update public.voice_publications set
   access_mode=case when normalized_code='' then 'link' else 'code' end,
   access_code_hash=case when normalized_code='' then null else crypt(normalized_code,gen_salt('bf',10)) end,
   access_code_changed_at=now()
 where id=input_publication_id;
 delete from public.voice_publication_access_sessions where publication_id=input_publication_id;
end; $$;
revoke all on function public.set_voice_publication_access_code(uuid,text) from public,anon,authenticated;
grant execute on function public.set_voice_publication_access_code(uuid,text) to service_role;
commit;
