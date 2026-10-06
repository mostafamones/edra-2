-- Student codes: change a code in one step, and preview the next generated code.
--
-- change_student_code gains two actions that swap a student's code in one transaction, so a failed
-- change leaves the old code in place:
--   replace          retires the old code (reason manual); it stays reserved and is never reused
--   replace_release  releases the old code (reason released); it is free to be issued again,
--                    including to another student
-- A student still has at most one current code.
--
-- Uniqueness of (academy, code) now ignores released rows, so a released code can be issued again
-- while every retired code stays reserved. Released rows remain in the ledger as history.
--
-- peek_next_student_code returns the next unissued value of the record's effective format without
-- reserving it or moving the cursor. Assigning it still goes through change_student_code, which
-- rechecks availability, so a value taken in the meantime fails with code_taken.

alter table public.student_code_assignments drop constraint student_code_assignments_code_unique;
create unique index student_code_assignments_code_unique
  on public.student_code_assignments (academy_id, code) where retirement_reason is distinct from 'released';

alter table public.student_code_assignments drop constraint student_code_assignments_retirement;
alter table public.student_code_assignments add constraint student_code_assignments_retirement check (
  (retired_at is null) = (retirement_reason is null)
  and (retired_at is not null or retired_by is null)
  and (retirement_reason is null or retirement_reason not in ('manual', 'released') or retired_by is not null)
);

create or replace function public.change_student_code(
  p_academy_id uuid, p_record_id uuid, p_action text, p_code text, p_expected_version integer, p_request_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  holder public.annual_student_records%rowtype;
  current_version integer;
  current_row public.student_code_assignments%rowtype;
  stored public.student_code_requests%rowtype;
  normalized text;
  issued text;
  pattern text;
  code_prefix text;
  code_width integer;
  fingerprint_value text;
  result jsonb;
begin
  if actor is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_record_id is null or p_request_key is null or p_expected_version is null or p_expected_version < 0
    or p_action is null or p_action <> all (array['assign', 'replace', 'replace_release', 'generate', 'retire']) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if p_action in ('assign', 'replace', 'replace_release') then
    normalized := public.normalize_student_code(p_code);
    if normalized is null then
      raise exception using errcode = 'P0001', message = 'validation', hint = 'code';
    end if;
  elsif p_code is not null and pg_catalog.btrim(p_code) <> '' then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  fingerprint_value := p_action || ':' || p_record_id::text || ':' || p_expected_version::text || ':' || coalesce(normalized, '');

  -- Rank 1. Retirement works while codes are off, so it never touches the settings row.
  if p_action <> 'retire' then
    perform 1 from public.student_code_settings s where s.academy_id = p_academy_id for share;
  end if;

  -- Rank 3. Serializes with student edits and with other code changes on this record.
  select r.* into holder from public.annual_student_records r
  where r.id = p_record_id and r.academy_id = p_academy_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;

  select * into stored from public.student_code_requests q
  where q.academy_id = p_academy_id and q.request_key = p_request_key;
  if found then
    if stored.actor_id = actor and stored.fingerprint = fingerprint_value then return stored.result; end if;
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end if;

  if p_action <> 'retire' then
    perform 1 from public.student_code_settings s where s.academy_id = p_academy_id and s.enabled;
    if not found then raise exception using errcode = 'P0001', message = 'codes_disabled'; end if;
  end if;
  if holder.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'archived_record';
  end if;

  select coalesce(max(st.version), 0) into current_version
  from public.student_code_states st where st.annual_student_record_id = p_record_id;
  if current_version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale_code';
  end if;
  select a.* into current_row from public.student_code_assignments a
  where a.annual_student_record_id = p_record_id and a.retired_at is null;

  if p_action = 'retire' then
    if current_row.id is null then raise exception using errcode = 'P0001', message = 'stale_code'; end if;
    update public.student_code_assignments
    set retired_at = now(), retired_by = actor, retirement_reason = 'manual'
    where id = current_row.id;
    issued := null;
  else
    if p_action in ('replace', 'replace_release') and current_row.id is null then
      raise exception using errcode = 'P0001', message = 'stale_code';
    end if;
    if p_action not in ('replace', 'replace_release') and current_row.id is not null then
      raise exception using errcode = 'P0001', message = 'code_exists';
    end if;
    if p_action in ('assign', 'replace', 'replace_release') then
      pattern := public.student_code_effective_pattern(p_academy_id, holder.level_id);
      if pattern is null then raise exception using errcode = 'P0001', message = 'pattern_missing'; end if;
      code_prefix := public.student_code_pattern_prefix(pattern);
      code_width := public.student_code_pattern_width(pattern);
      if pg_catalog.left(normalized, pg_catalog.length(code_prefix)) <> code_prefix
        or pg_catalog.length(normalized) <> pg_catalog.length(code_prefix) + code_width
        or pg_catalog.translate(pg_catalog.substr(normalized, pg_catalog.length(code_prefix) + 1), '0123456789', '') <> '' then
        raise exception using errcode = 'P0001', message = 'invalid_format', hint = pattern;
      end if;
    end if;
    issued := case when p_action in ('assign', 'replace', 'replace_release') then normalized
      else public.allocate_student_code(p_academy_id, holder.level_id) end;
    if p_action in ('replace', 'replace_release') and normalized = current_row.code then
      raise exception using errcode = 'P0001', message = 'code_taken';
    end if;
    -- A change retires or releases the old code and issues the new one in this one transaction.
    if p_action in ('replace', 'replace_release') then
      update public.student_code_assignments
      set retired_at = now(), retired_by = actor,
        retirement_reason = case when p_action = 'replace_release' then 'released' else 'manual' end::public.student_code_retirement_reason
      where id = current_row.id;
    end if;
    begin
      insert into public.student_code_assignments (
        academy_id, academic_year_id, academy_student_profile_id, annual_student_record_id,
        level_id, code, code_version, issued_by
      ) values (
        p_academy_id, holder.academic_year_id, holder.academy_student_profile_id, holder.id,
        holder.level_id, issued, current_version + case when p_action in ('replace', 'replace_release') then 2 else 1 end, actor
      );
    exception when unique_violation then
      raise exception using errcode = 'P0001', message = 'code_taken';
    end;
  end if;

  result := jsonb_build_object(
    'code', issued,
    'version', (select st.version from public.student_code_states st where st.annual_student_record_id = p_record_id)
  );
  insert into public.student_code_requests (academy_id, request_key, actor_id, fingerprint, result)
  values (p_academy_id, p_request_key, actor, fingerprint_value, result);
  return result;
end;
$$;

create or replace function public.peek_next_student_code(p_academy_id uuid, p_record_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  holder public.annual_student_records%rowtype;
  pattern text;
  code_prefix text;
  code_width integer;
  capacity bigint;
  cursor_value bigint;
  candidate text;
begin
  if auth.uid() is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  select r.* into holder from public.annual_student_records r
  where r.id = p_record_id and r.academy_id = p_academy_id;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  perform 1 from public.student_code_settings s where s.academy_id = p_academy_id and s.enabled;
  if not found then raise exception using errcode = 'P0001', message = 'codes_disabled'; end if;
  pattern := public.student_code_effective_pattern(p_academy_id, holder.level_id);
  if pattern is null then raise exception using errcode = 'P0001', message = 'pattern_missing'; end if;
  code_prefix := public.student_code_pattern_prefix(pattern);
  code_width := public.student_code_pattern_width(pattern);
  capacity := (10::numeric ^ code_width)::bigint - 1;
  select coalesce(max(c.last_value), 0) into cursor_value from public.student_code_counters c
  where c.academy_id = p_academy_id and c.prefix = code_prefix and c.width = code_width;
  loop
    cursor_value := cursor_value + 1;
    if cursor_value > capacity then
      raise exception using errcode = 'P0001', message = 'code_exhausted', hint = pattern;
    end if;
    candidate := code_prefix || pg_catalog.lpad(cursor_value::text, code_width, '0');
    exit when not exists (
      select 1 from public.student_code_assignments a
      where a.academy_id = p_academy_id and a.code = candidate and a.retirement_reason is distinct from 'released'
    );
  end loop;
  return candidate;
end;
$$;

revoke all on function public.peek_next_student_code(uuid, uuid) from public, anon;
grant execute on function public.peek_next_student_code(uuid, uuid) to authenticated;

revoke all on function public.change_student_code(uuid, uuid, text, text, integer, uuid) from public, anon;
grant execute on function public.change_student_code(uuid, uuid, text, text, integer, uuid) to authenticated;
