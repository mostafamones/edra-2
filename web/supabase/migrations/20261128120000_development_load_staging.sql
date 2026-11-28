-- Staging for dev-academy loads: the SQL API refuses multi-MB request bodies, so create uploads the scenario
-- document in ordered pieces under the run lock and the single load transaction reassembles and deletes them.
-- Private and closed to every API role, like the other dev_* registry tables.
create table edra_private.dev_load_parts (
  run_id uuid not null references edra_private.dev_runs(id) on delete cascade,
  seq integer not null check (seq >= 0),
  part text not null,
  primary key (run_id, seq)
);
alter table edra_private.dev_load_parts enable row level security;
revoke all on edra_private.dev_load_parts from public, anon, authenticated, service_role;
