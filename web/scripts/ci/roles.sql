-- CI bootstrap only, not a production migration. The pinned Supabase CLI (2.117.0) executes this
-- file after its managed-schema setup and before the repository migrations.
--
-- With `api.auto_expose_new_tables` unset, that CLI revokes the initial-schema default grants that
-- let `anon`, `authenticated` and `service_role` use new `public` objects owned by `postgres`. The
-- application's cloud project still has those defaults (read-only catalog check, 2026-10-18), and
-- early Edra migrations rely on them before their own revokes, column grants and policies. Re-grant
-- exactly what the CLI revoked so the replay starts from the cloud baseline. This changes defaults
-- only; it grants nothing on existing objects. Recheck it if the application changes grant policy.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;
