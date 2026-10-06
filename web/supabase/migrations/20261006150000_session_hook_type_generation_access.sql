-- Supabase's schema/type-generation tooling uses supabase_read_only_user. The
-- PostgREST pre-request hook also runs for these platform requests, so this role
-- must be able to invoke the hook. Its existing pg_read_all_data membership
-- supplies schema USAGE; no application table or internal helper grants change.
-- The hook still rejects inactive and recovery-only authenticated sessions.
grant execute on function edra_auth.check_request() to supabase_read_only_user;
