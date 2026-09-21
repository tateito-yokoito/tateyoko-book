begin;
-- experience_contracts uses order_id as its primary key (not id).
do $$declare definition text;begin
 select pg_get_functiondef('public.family_audit_experience_start()'::regprocedure) into definition;
 if position('''contract_id'',new.id' in definition)=0 then raise exception 'Audit definition changed';end if;
 execute replace(definition,'''contract_id'',new.id','''contract_order_id'',new.order_id');
end $$;
commit;
