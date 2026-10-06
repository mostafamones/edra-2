-- Trusted service-role REST requests also run the pre-request hook, including
-- requests used by Supabase type-generation tooling. session_allowed already
-- permits service_role; allow that role to reach the hook without granting
-- access to session_allowed or changing authenticated-user enforcement.
grant usage on schema edra_auth to service_role;
grant execute on function edra_auth.check_request() to service_role;
