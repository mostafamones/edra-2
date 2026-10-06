-- Attendance mutation quotas enforced at the database boundary.
--
-- The versioned HTTP API throttled requests before calling attendance RPCs, but the RPCs are granted
-- to authenticated users and are also reached by web actions, so a permitted caller could bypass the
-- HTTP limits. Every attendance mutation RPC now charges a server-owned per-user, per-operation
-- quota before it runs, whatever the entry point. The HTTP wrapper keeps its own attempt-level
-- `api:*` buckets; the two never charge the same bucket.
--
-- Policy decisions:
--   * Fail-open: if the quota store errors, the mutation proceeds (it still authorizes itself).
--   * Only mutations that commit are counted: a mutation that raises rolls back its own quota hit.
--     Exhausted quotas raise `throttled` (detail = retry seconds) and perform no domain change.
--   * Idempotent replays are charged like any other call; limits leave room for scanner retries.
--   * Caller-supplied limits are no longer trusted; consume_api_quota accepts known buckets only.
--   * Rate windows older than one hour and retry records older than 30 days are purged in small
--     batches (the API guarantees retries for at least 24 hours).

-- The previous RPC bodies move to the private schema unchanged; public wrappers keep their
-- signatures and grants. Function bodies use schema-qualified names, so the move is safe.
alter function public.check_in_attendance(uuid, uuid, uuid, uuid) set schema edra_private;
alter function public.apply_attendance_changes(uuid, uuid, jsonb, text, uuid) set schema edra_private;
alter function public.publish_attendance(uuid, uuid, integer, uuid) set schema edra_private;
revoke all on function edra_private.check_in_attendance(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.apply_attendance_changes(uuid, uuid, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function edra_private.publish_attendance(uuid, uuid, integer, uuid) from public, anon, authenticated;

create index if not exists api_rate_windows_window_start_idx on public.api_rate_windows (window_start);

-- Server-owned limits per 60-second window. Unknown buckets have no limit (null).
create or replace function edra_private.quota_limit(p_bucket text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_bucket
    when 'api:read' then 300
    when 'api:write' then 120
    -- Scanner check-ins: up to 10 per second sustained per staff member.
    when 'op:attendance_check_in' then 600
    -- Single edits and bulk changes (each up to 500 rows).
    when 'op:attendance_change' then 240
    when 'op:attendance_publish' then 60
  end;
$$;

-- Adds one hit to the caller's current window and returns the new total, or null when the store
-- is unavailable. Also purges a small batch of expired rate windows and retry records.
create or replace function edra_private.record_quota_hit(p_actor uuid, p_bucket text, p_slot_start timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  total integer;
begin
  insert into public.api_rate_windows as w (actor_id, bucket, window_start, hits)
  values (p_actor, p_bucket, p_slot_start, 1)
  on conflict (actor_id, bucket, window_start) do update set hits = w.hits + 1
  returning hits into total;
  delete from public.api_rate_windows w where w.ctid in (
    select o.ctid from public.api_rate_windows o
    where o.window_start < now() - interval '1 hour'
    limit 100 for update skip locked
  );
  delete from public.attendance_requests r where r.ctid in (
    select o.ctid from public.attendance_requests o
    where o.created_at < now() - interval '30 days'
    limit 100 for update skip locked
  );
  return total;
exception when others then
  return null;
end;
$$;

-- Charges one attendance mutation. Raises throttled (detail = seconds until the window resets)
-- when the caller's quota is exhausted; otherwise returns and the hit commits with the mutation.
create or replace function edra_private.charge_mutation_quota(p_bucket text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  max_hits integer := edra_private.quota_limit(p_bucket);
  slot_start timestamptz := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  total integer;
begin
  -- Unauthenticated calls are rejected by the operation's own authorization.
  if actor is null or max_hits is null then return; end if;
  total := edra_private.record_quota_hit(actor, p_bucket, slot_start);
  if total is not null and total > max_hits then
    raise exception using errcode = 'P0001', message = 'throttled',
      detail = greatest(1, ceil(extract(epoch from (slot_start + interval '60 seconds' - now())))::integer)::text;
  end if;
end;
$$;

revoke all on function edra_private.quota_limit(text) from public, anon, authenticated;
revoke all on function edra_private.record_quota_hit(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function edra_private.charge_mutation_quota(text) from public, anon, authenticated;

create function public.check_in_attendance(
  p_academy_id uuid, p_session_id uuid, p_annual_record_id uuid, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:attendance_check_in');
  return edra_private.check_in_attendance(p_academy_id, p_session_id, p_annual_record_id, p_key);
end;
$$;

create function public.apply_attendance_changes(
  p_academy_id uuid, p_session_id uuid, p_changes jsonb, p_operation text, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:attendance_change');
  return edra_private.apply_attendance_changes(p_academy_id, p_session_id, p_changes, p_operation, p_key);
end;
$$;

create function public.publish_attendance(
  p_academy_id uuid, p_session_id uuid, p_expected_revision integer, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:attendance_publish');
  return edra_private.publish_attendance(p_academy_id, p_session_id, p_expected_revision, p_key);
end;
$$;

-- HTTP API throttling. The bucket must be a known api:* bucket; the limit is server-owned and the
-- caller's p_limit is ignored. p_window_seconds must be 60. Signature kept for compatibility.
create or replace function public.consume_api_quota(p_bucket text, p_limit integer, p_window_seconds integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  max_hits integer := edra_private.quota_limit(p_bucket);
  slot_start timestamptz := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  total integer;
begin
  if actor is null then raise exception using errcode = 'P0001', message = 'forbidden'; end if;
  if p_bucket is null or p_bucket not like 'api:%' or max_hits is null or p_window_seconds is distinct from 60 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  total := edra_private.record_quota_hit(actor, p_bucket, slot_start);
  return jsonb_build_object(
    'allowed', total is null or total <= max_hits,
    'retry_after', greatest(1, ceil(extract(epoch from (slot_start + interval '60 seconds' - now())))::integer)
  );
end;
$$;

revoke all on function public.check_in_attendance(uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.apply_attendance_changes(uuid, uuid, jsonb, text, uuid) from public, anon;
revoke all on function public.publish_attendance(uuid, uuid, integer, uuid) from public, anon;
grant execute on function public.check_in_attendance(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.apply_attendance_changes(uuid, uuid, jsonb, text, uuid) to authenticated;
grant execute on function public.publish_attendance(uuid, uuid, integer, uuid) to authenticated;
