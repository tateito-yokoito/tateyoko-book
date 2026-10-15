-- RLS does not apply to TRUNCATE. Keep client inserts/selects intact while
-- preventing either client role from clearing every user's activity log.
revoke truncate on table public.activity_logs from public, anon, authenticated;
