# Groups integration

Groups belong to an academy/year. queries.ts reads groups/structure and derives active dependency counts from annual records; actions.ts handles create/update/archive/restore. The public entry point is index.ts.

Current placement uses annual_student_records.primary_group_id with academy/year integrity checks and one nullable primary group. protect_group_dependencies guards changes/archive while dependent records remain. Placement locking prevents concurrent archival from invalidating a write. A level-wide group (`track_id` null) accepts students of its level with or without a track; a track-specific group requires the same level and track. Levels with tracks may have level-wide groups. Capacity rules are in [teaching](../../../docs/product/domains/teaching.md); staff placement currently does not enforce booking capacity.

A session snapshots its roster when started; later group/student edits do not rewrite that snapshot. Group management belongs to Owners, Head Admins and Admins with an active membership (`public.is_academy_manager`); midyear removed-track broadening is not inferred from the existing implementation. Current group dependencies are an integration contract, not a speculative future-roster plan.
