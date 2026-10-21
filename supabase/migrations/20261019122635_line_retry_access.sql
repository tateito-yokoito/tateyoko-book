begin;

-- Keep the existing admin authentication and result shape. The worker itself
-- verifies the original LINE payload, recipient and retry window.
do $migration$
declare definition text; needle text;
begin
  select pg_get_functiondef('public.get_admin_retry_question_delivery_for_worker(uuid)'::regprocedure) into definition;
  needle := 'qdl.delivery_channel in (''email'', ''sms'')';
  if strpos(definition, needle) = 0 then raise exception 'Admin retry definition changed; review required'; end if;
  execute replace(definition, needle, 'qdl.delivery_channel in (''email'', ''sms'', ''line'')');
end;
$migration$;

commit;
