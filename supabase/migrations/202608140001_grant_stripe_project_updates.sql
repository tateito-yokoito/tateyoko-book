begin;

-- Stripe Edge Functions use the service role to persist checkout and refund
-- status. RLS bypass alone is not enough when the table-level UPDATE grant is
-- missing, so grant the minimum additional privilege required here.
grant update on table public.book_projects to service_role;

commit;
