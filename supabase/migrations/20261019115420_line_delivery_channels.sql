begin;

-- Keep all existing schedule, access and retirement predicates unchanged.
-- Fail closed if an independently changed definition no longer matches.
do $migration$
declare definition text; needle text;
begin
  select pg_get_functiondef('public.save_own_sms_delivery_setting(boolean)'::regprocedure) into definition;
  needle := 'line_enabled = false,';
  if strpos(definition, needle) = 0 then raise exception 'SMS definition changed; review required'; end if;
  execute replace(definition, needle, 'line_enabled = np.line_enabled,');

  select pg_get_functiondef('public.get_due_question_deliveries_v2()'::regprocedure) into definition;
  needle := '(coalesce(preference.sms_enabled, false) = true and nullif(btrim(preference.phone_number), '''') is not null)';
  if strpos(definition, needle) = 0 then raise exception 'Delivery definition changed; review required'; end if;
  execute replace(definition, needle, needle || '
 or (preference.line_enabled = true and exists (
   select 1 from public.line_notification_connections lc
   where lc.user_id = ns.user_id and lc.status = ''active''
 ))');
end;
$migration$;

commit;
