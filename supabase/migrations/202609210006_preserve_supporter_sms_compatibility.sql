begin;
-- 170004 predates the SMS invite migration already present in production.
-- Retain its family guards AND the later SMS verification conditions.
-- Never reinstall 190004 wholesale: that would remove the family guards.
do $$declare sig text; definition text; old_match text; new_match text;
begin
 if to_regprocedure('public.supporter_sms_verified(uuid,uuid)') is null then
  -- Older/local schema without SMS support has nothing to preserve.
  return;
 end if;
 foreach sig in array array['public.respond_to_supporter_invite(uuid,boolean)','public.respond_to_supporter_invite_resilient(uuid,boolean)'] loop
  select pg_get_functiondef(sig::regprocedure) into definition;
  if position('Family supporter change requires subject' in definition)=0 then raise exception 'Family guard drift: %',sig;end if;
  old_match:='current_user_id is null or current_email = ''''';
  if position(old_match in definition)>0 then
   if (length(definition)-length(replace(definition,old_match,'')))/length(old_match)<>1 then raise exception 'Authentication guard drift: %',sig;end if;
   definition:=replace(definition,old_match,'current_user_id is null');
  end if;
  old_match:='and lower(btrim(pi.invitee_email)) = current_email';
  new_match:='and ((current_email <> '''' and lower(btrim(pi.invitee_email)) = current_email) or public.supporter_sms_verified(pi.id,current_user_id))';
  if position(new_match in definition)=0 then
   if (length(definition)-length(replace(definition,old_match,'')))/length(old_match)<>1 then raise exception 'Invitation match drift: %',sig;end if;
   definition:=replace(definition,old_match,new_match);
  end if;
  execute definition;
 end loop;
 select pg_get_functiondef('public.list_owned_project_supporters(uuid)'::regprocedure) into definition;
 if position('family_subject_or_legacy_owner(' in definition)=0 then raise exception 'Supporter list family guard drift';end if;
 old_match:='and pi.role = ''supporter''';
 new_match:='and pi.role = ''supporter'' and pi.invitee_phone is null';
 if position(new_match in definition)=0 then
  if (length(definition)-length(replace(definition,old_match,'')))/length(old_match)<>1 then raise exception 'Supporter list SMS drift';end if;
  execute replace(definition,old_match,new_match);
 end if;
end $$;
commit;
