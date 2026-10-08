-- Assignments: fast entry by code binds the saved mark to the student the user was shown.
--
-- A code can change holder between the lookup (preview) and the save. save_assignment_marks gains an
-- optional p_expected_record_id: when the code resolves, under the transaction's record lock, to a
-- different student, the command fails with student_changed and writes nothing. Calls that omit it
-- behave as before. The expected record is part of the idempotency fingerprint.

drop function public.save_assignment_marks(uuid, uuid, uuid, text, integer, jsonb, uuid);
drop function edra_private.save_assignment_marks(uuid, uuid, uuid, text, integer, jsonb, uuid);

create function edra_private.save_assignment_marks(
  p_academy_id uuid, p_assignment_id uuid, p_record_id uuid, p_code text, p_expected_version integer, p_changes jsonb, p_key uuid,
  p_expected_record_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.assignments%rowtype;
  recipient public.assignment_recipients%rowtype;
  record_id uuid;
  fingerprint text;
  replay jsonb;
  before_content jsonb;
  after_content jsonb;
  new_feedback text;
  ordinary_marks boolean;
  work_recorded boolean := false;
  change_count integer;
begin
  perform edra_private.require_assignment_role(p_academy_id, false);
  -- Checked in steps: SQL does not short-circuit OR, and JSON accessors raise on the wrong shape.
  if p_key is null or p_expected_version is null or (p_record_id is null) = (p_code is null)
    or p_changes is null or jsonb_typeof(p_changes) <> 'object'
    or (p_expected_record_id is not null and p_record_id is not null and p_expected_record_id <> p_record_id) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if exists (select 1 from jsonb_object_keys(p_changes) k where k not in ('marks', 'feedback'))
    or coalesce(jsonb_typeof(p_changes->'marks'), 'array') <> 'array'
    or coalesce(jsonb_typeof(p_changes->'feedback'), 'string') <> 'string' then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  change_count := coalesce(jsonb_array_length(p_changes->'marks'), 0);
  if (change_count = 0 and not p_changes ? 'feedback') or change_count > 50
    or char_length(coalesce(p_changes->>'feedback', '')) > 5000 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  new_feedback := btrim(p_changes->>'feedback');

  -- Rank 1: code settings (share) so a code save serializes with disabling codes.
  if p_code is not null then
    perform 1 from public.student_code_settings s where s.academy_id = p_academy_id for share;
  end if;
  -- Rank 2: the assignment.
  target := edra_private.lock_assignment_for_marking(p_academy_id, p_assignment_id);

  fingerprint := md5(jsonb_build_object(
    'assignment', target.id, 'record', p_record_id, 'code', public.normalize_student_code(p_code),
    'expected_version', p_expected_version, 'expected_record', p_expected_record_id, 'changes', p_changes)::text);
  replay := edra_private.assignment_replay(p_key, 'marks', target.id, fingerprint);
  if replay is not null then return replay; end if;

  -- Rank 3: the record (code path).
  record_id := coalesce(p_record_id, edra_private.resolve_assignment_code(target, p_code));
  -- The preview named a student. If the code now resolves to someone else, nothing is saved: the
  -- resolution above holds the record share lock, so this check and the write see the same holder.
  if p_expected_record_id is not null and record_id <> p_expected_record_id then
    raise exception using errcode = 'P0001', message = 'student_changed';
  end if;
  -- Rank 4: the year.
  perform edra_private.require_open_assignment_year(target.academy_id, target.academic_year_id);
  -- Rank 5: the recipient.
  select x.* into recipient from public.assignment_recipients x
  where x.assignment_id = target.id and x.annual_student_record_id = record_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_recipient'; end if;
  if recipient.version <> p_expected_version then
    return jsonb_build_object('outcome', 'conflict', 'recipient', edra_private.assignment_recipient_json(target.id, record_id),
      'work_recorded', false, 'replayed', false);
  end if;

  create temporary table if not exists pg_temp.assignment_mark_changes (
    part_id uuid, clear boolean, kind public.assignment_mark_kind, score numeric, reason text
  ) on commit drop;
  truncate pg_temp.assignment_mark_changes;
  begin
    insert into pg_temp.assignment_mark_changes
    select (entry->>'part_id')::uuid,
      jsonb_typeof(entry->'score') = 'null',
      case when entry ? 'excused_reason' then 'excused'::public.assignment_mark_kind else 'mark'::public.assignment_mark_kind end,
      case when jsonb_typeof(entry->'score') = 'null' then null else edra_private.parse_assignment_score(entry->'score') end,
      case when entry ? 'excused_reason' then btrim(entry->>'excused_reason') end
    from jsonb_array_elements(coalesce(p_changes->'marks', '[]'::jsonb)) entry
    where jsonb_typeof(entry) = 'object'
      and not exists (select 1 from jsonb_object_keys(entry) k where k not in ('part_id', 'score', 'excused_reason'))
      and entry ? 'score';
  exception
    when raise_exception then raise;
    when others then raise exception using errcode = 'P0001', message = 'validation';
  end;
  if (select count(*) from pg_temp.assignment_mark_changes) <> change_count
    or exists (select 1 from pg_temp.assignment_mark_changes c where c.part_id is null)
    or (select count(distinct c.part_id) from pg_temp.assignment_mark_changes c) <> (select count(*) from pg_temp.assignment_mark_changes)
    or exists (select 1 from pg_temp.assignment_mark_changes c where c.clear and c.reason is not null)
    or exists (select 1 from pg_temp.assignment_mark_changes c
      where c.kind = 'excused' and not c.clear and (c.reason is null or char_length(c.reason) not between 1 and 500)) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if exists (select 1 from pg_temp.assignment_mark_changes c
      where not exists (select 1 from public.assignment_parts p where p.assignment_id = target.id and p.id = c.part_id)) then
    raise exception using errcode = 'P0001', message = 'unknown_part';
  end if;
  if exists (select 1 from pg_temp.assignment_mark_changes c
      join public.assignment_parts p on p.assignment_id = target.id and p.id = c.part_id
      where not c.clear and c.score > p.max_score) then
    raise exception using errcode = 'P0001', message = 'invalid_score';
  end if;

  ordinary_marks := exists (select 1 from pg_temp.assignment_mark_changes c where not c.clear and c.kind = 'mark');
  -- A closed assignment accepts no newly received work; already received work stays markable.
  if ordinary_marks and target.state = 'closed' and recipient.work_status not in ('submitted', 'late') then
    raise exception using errcode = 'P0001', message = 'assignment_closed';
  end if;

  before_content := edra_private.assignment_result_content(target.id, record_id);

  delete from public.assignment_marks m using pg_temp.assignment_mark_changes c
  where c.clear and m.assignment_id = target.id and m.annual_student_record_id = record_id and m.part_id = c.part_id;
  insert into public.assignment_marks (assignment_id, annual_student_record_id, part_id, academy_id, kind, score, reason, updated_by)
  select target.id, record_id, c.part_id, target.academy_id, c.kind, c.score, case when c.kind = 'excused' then c.reason end, actor
  from pg_temp.assignment_mark_changes c where not c.clear
  on conflict (assignment_id, annual_student_record_id, part_id) do update
    set kind = excluded.kind, score = excluded.score, reason = excluded.reason, updated_by = excluded.updated_by, updated_at = now()
    where (assignment_marks.kind, assignment_marks.score, assignment_marks.reason)
      is distinct from (excluded.kind, excluded.score, excluded.reason);

  -- The first ordinary mark records the work as received, in the same transaction.
  if ordinary_marks and recipient.work_status not in ('submitted', 'late') then
    update public.assignment_recipients set work_status = 'submitted', received_at = now(),
      work_recorded_by = actor, work_recorded_at = now()
    where assignment_id = target.id and annual_student_record_id = record_id;
    work_recorded := true;
  end if;
  if new_feedback is not null then
    update public.assignment_recipients set feedback = new_feedback
    where assignment_id = target.id and annual_student_record_id = record_id and feedback <> new_feedback;
  end if;

  after_content := edra_private.assignment_result_content(target.id, record_id);
  if after_content = before_content then
    return edra_private.remember_assignment_request(p_key, 'marks', target, fingerprint, jsonb_build_object(
      'outcome', 'unchanged', 'recipient', edra_private.assignment_recipient_json(target.id, record_id), 'work_recorded', false));
  end if;
  update public.assignment_recipients set version = version + 1, updated_at = now()
  where assignment_id = target.id and annual_student_record_id = record_id;
  return edra_private.remember_assignment_request(p_key, 'marks', target, fingerprint, jsonb_build_object(
    'outcome', 'saved', 'recipient', edra_private.assignment_recipient_json(target.id, record_id), 'work_recorded', work_recorded));
end;
$$;

create function public.save_assignment_marks(
  p_academy_id uuid, p_assignment_id uuid, p_record_id uuid, p_code text, p_expected_version integer, p_changes jsonb, p_key uuid,
  p_expected_record_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:assignment_mark');
  return edra_private.save_assignment_marks(p_academy_id, p_assignment_id, p_record_id, p_code, p_expected_version, p_changes, p_key, p_expected_record_id);
end;
$$;

revoke all on function edra_private.save_assignment_marks(uuid, uuid, uuid, text, integer, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_assignment_marks(uuid, uuid, uuid, text, integer, jsonb, uuid, uuid) from public, anon;
grant execute on function public.save_assignment_marks(uuid, uuid, uuid, text, integer, jsonb, uuid, uuid) to authenticated;
