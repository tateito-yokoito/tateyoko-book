-- The guest quote is fetched only inside the dedicated Edge Function after
-- bearer-token and completed-trial checks. The browser never calls this RPC.
grant execute on function public.get_commerce_quote(text, text, boolean) to service_role;
