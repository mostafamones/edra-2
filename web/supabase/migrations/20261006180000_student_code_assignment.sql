-- Student codes: individual assignment and explicit retirement (Plan 02).
--
-- change_student_code is the only write entry point for staff. One call performs one action on
-- one annual record:
--   assign    manual code, normalized with the shared grammar and required to match the level's
--             effective format: its prefix followed by exactly the format's number of digits
--   generate  next unissued code from the level's effective format
--   retire    explicit manual retirement; the student is left without a code
-- Assignment never replaces a current code (code_exists); retirement is separate.
--
-- Lock order (Plan 01 graph): settings row FOR SHARE (assign/generate/replay only), annual record
-- FOR UPDATE, then the year / state rows / counters inside the ledger triggers and
-- allocate_student_code. Retirement takes no settings lock, so it works while codes are off.
--
-- Idempotency: p_request_key replays the stored result for the same caller and payload; a
-- different payload under the same key raises idempotency_conflict. Replays run after the role
-- check and the record lock, so they never authorize anything new.

create table public.student_code_requests (
  academy_id uuid not null references public.academies (id) on delete cascade,
  request_key uuid not null,
  actor_id uuid not null references public.profiles (id),
  fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (academy_id, request_key)
);
alter table public.student_code_requests enable row level security;
revoke all on public.student_code_requests from public, anon, authenticated;

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
    or p_action is null or p_action <> all (array['assign', 'generate', 'retire']) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if p_action = 'assign' then
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
    if current_row.id is not null then
      raise exception using errcode = 'P0001', message = 'code_exists';
    end if;
    if p_action = 'assign' then
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
    issued := case when p_action = 'assign' then normalized
      else public.allocate_student_code(p_academy_id, holder.level_id) end;
    begin
      insert into public.student_code_assignments (
        academy_id, academic_year_id, academy_student_profile_id, annual_student_record_id,
        level_id, code, code_version, issued_by
      ) values (
        p_academy_id, holder.academic_year_id, holder.academy_student_profile_id, holder.id,
        holder.level_id, issued, current_version + 1, actor
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

revoke all on function public.change_student_code(uuid, uuid, text, text, integer, uuid) from public, anon;
grant execute on function public.change_student_code(uuid, uuid, text, text, integer, uuid) to authenticated;
