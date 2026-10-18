-- Corrects edra_auth.check_request (20261006120000): PostgREST requires the RAISE detail to carry
-- `headers` as well as `status`, otherwise it fails with PGRST121 and answers HTTP 500. A revoked
-- or phone-code session now gets the intended HTTP 401 with code EDRA_SESSION_INACTIVE.
-- Behavior is otherwise unchanged: the same sessions are refused and none are newly allowed.

create or replace function edra_auth.check_request()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not edra_auth.session_allowed() then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code', 'EDRA_SESSION_INACTIVE',
        'message', 'This session has ended or can only be used to set a new password. Sign in again.')::text,
      detail = json_build_object('status', 401, 'headers', json_build_object())::text;
  end if;
  if current_setting('request.jwt.claims', true)::jsonb->>'role' = 'authenticated' then
    perform pg_catalog.set_config('edra.verified_session',
      current_setting('request.jwt.claims', true)::jsonb->>'session_id', true);
  end if;
end;
$$;

revoke all on function edra_auth.check_request() from public;
grant execute on function edra_auth.check_request() to anon, authenticated;
