# Groups integration

Groups belong to an academy/year. queries.ts reads groups/structure and derives active dependency counts from annual records; actions.ts handles create/update/archive/restore. The public entry point is index.ts.

Current placement uses annual_student_records.primary_group_id with academy/year integrity checks and one nullable primary group. protect_group_dependencies guards changes/archive while dependent records remain. Placement locking prevents concurrent archival from invalidating a write. Current validation must be compared with the intended level-wide/track-specific compatibility and capacity rules in [teaching](../../../docs/product/domains/teaching.md); staff placement currently does not enforce booking capacity.

A session snapshots its roster when started; later group/student edits do not rewrite that snapshot. Source Head Admin and midyear removed-track broadening are not inferred from the existing owner/admin implementation. Current group dependencies are an integration contract, not a speculative future-roster plan.
