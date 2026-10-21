# Separate work item — destructive reset procedure

Read final product Lifecycle, shared execution rules and this procedure. It is outside normal create/retry/acceptance. Prepare the concrete run impact and reviewed table/trigger list before requesting destructive execution approval. No destructive execution in this Master thread.

This is a separate work item, not an automatic generator retry and not an application endpoint. Do not execute it from this Master thread. Before execution the operator must review an impact report and explicitly name the run to destroy; planning approval alone is not deletion approval.

1. Stop preview controls for the selected run and revoke its generated sessions. Acquire a run reset lock and mark it unavailable. Keep the original developer identity and all unrelated Auth users intact.
2. Produce a dry-run report for the exact project/run/academy UUID: owned tables/row counts, generated account IDs (masked contacts), Storage assets if any, cross-academy references, active controls and expected schema/migration version. A slug or name match is insufficient authority.
3. Refuse if any generated account/profile is referenced outside this synthetic academy, a real account other than the deliberately added staff owner is linked to generated student participation, or an unsupported new domain/table/Storage asset prevents a complete bounded cleanup. Do not extend deletion scope to resolve such a refusal.
4. Preserve an encrypted recovery export and registry manifest before mutation. Deletion includes synthetic academy records added during preview, not just original fixture IDs, but must remain confined to this registered academy and generated identities. Never delete the owner's real profile/Auth user.
5. Execute domain cleanup in one privileged, audited database transaction with an exact child-first table/ID list derived from the current schema. Ordinary app RPCs remain unable to delete history. Any needed temporary exception for named history/structure triggers must be explicitly enumerated and reviewed in the reset implementation brief; do not use `TRUNCATE`, `CASCADE`, `DISABLE TRIGGER ALL`, `session_replication_role`, or a permanent broadly callable bypass. Lock affected tables, preserve each trigger's prior enabled state, re-enable before commit and assert restoration. If such a narrow transactional procedure cannot preserve constraints, return the concrete dependency; do not improvise. This exception belongs only to the separately approved reset procedure, never seeding.
6. Keep all FK checks enabled. Resolve accepted-submission cycles explicitly within the reviewed scoped procedure; do not drop constraints. Recheck outside-academy sentinels and trigger states before commit. Rollback on any mismatch.
7. Delete only the registered generated Auth users through Admin API after domain cleanup succeeds. Auth/API and SQL cannot share one transaction: maintain durable `resetting/auth_cleanup_pending/reset` state and retry only unfinished generated-user cleanup. Preserve synthetic contact suppression until Auth cleanup completes. Never delete Auth users first and rely on a cascade.
8. Recreate through the normal generator only after cleanup is complete. Run IDs/credentials are fresh even if the same seed/reference date reproduces the scenario. Verify the owner's normal membership in the replacement academy and no changes to their other academies.

The reset implementation brief must enumerate its actual affected tables and named trigger exceptions against the then-current schema before any destructive execution approval. New features added to a synthetic academy can require that separate review; an old static delete script must fail closed on an unknown dependency.

## Bounded deliverable

Create CLI `reset --dry-run --run <uuid>` report support first. A later explicitly authorized execution uses `reset --run <uuid> --confirm-run <same uuid> --impact-hash <reviewed hash>`; reject stale impact/schema/run state. No reset HTTP endpoint and no sidebar reset control.

The implementation brief for actual deletion must supply the exact current child-first table list, trigger names/prior states, cyclic pointer handling, encrypted backup location and outside-run assertions for that chosen run. This cannot be guessed from seed tables alone after a developer has used more app features.

Acceptance: dry-run is read-only; unrelated real academy/user references cause refusal; wrong project/run/hash causes refusal; failed cleanup rolls back DB data and restores guards; Auth cleanup retries only registered remaining generated IDs; owner and unrelated academies survive. Verify destructive behavior only on an explicitly authorized isolated cloud fixture first. No local database substitution.
