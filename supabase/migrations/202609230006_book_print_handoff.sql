begin;

-- Contract for a future print renderer. This does not generate print files or
-- activate a Web book. Only a verified, completed order can be handed off.
create function public.get_book_print_handoff(input_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,auth as $$
declare c public.book_completion_candidates%rowtype; p public.voice_publications%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
 select * into c from public.book_completion_candidates where order_id=input_order_id and state='completed';
 if c.id is null then raise exception 'Completed order not found'; end if;
 if not exists(select 1 from public.commerce_orders o where o.id=input_order_id and o.status in('paid','zero_paid')) then
   raise exception 'Payment is not complete';
 end if;
 select * into p from public.voice_publications where id=c.publication_id;
 if p.id is null or p.status not in('published','disabled') or p.published_at is null then
   raise exception 'Completed Web book not found';
 end if;
 return jsonb_build_object(
   'schema_version',1,
   'order_id',input_order_id,
   'book_project_id',c.book_project_id,
   'work_manifest_id',c.work_manifest_id,
   'publication_id',p.id,
   'public_id',p.public_id,
   'web_book_path','/?voice=' || p.public_id,
   'qr_in_book',c.qr_in_book,
   'standard_qr_placements',case when c.qr_in_book then jsonb_build_array('after-title','back-cover') else '[]'::jsonb end,
   'premium_qr_placements',case when c.qr_in_book then jsonb_build_array('after-title') else '[]'::jsonb end
 );
end; $$;
revoke all on function public.get_book_print_handoff(uuid) from public,anon,authenticated;
grant execute on function public.get_book_print_handoff(uuid) to service_role;

commit;
