-- Student codes: list retired codes and unretire them.
--
-- Unretiring a code marks it `released`: it is no longer reserved, so it can be issued again,
-- including to another student. It does not give the code back to its former holder. The ledger
-- row stays as history; the only permitted change to a retired row is this one-way move to
-- `released`. Owners and admins can unretire; every staff role can read the list.
--
-- Unretiring takes no settings lock and works while codes are off.

create or replace function public.protect_student_code_assignment()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'code_history', hint = 'Issued codes cannot be deleted.';
  end if;
  if (new.id, new.academy_id, new.academic_year_id, new.academy_student_profile_id, new.annual_student_record_id,
      new.level_id, new.code, new.code_version, new.issued_at, new.issued_by)
    is distinct from
     (old.id, old.academy_id, old.academic_year_id, old.academy_student_profile_id, old.annual_student_record_id,
      old.level_id, old.code, old.code_version, old.issued_at, old.issued_by) then
    raise exception using errcode = 'P0001', message = 'code_history',
      hint = 'An issued code can only be retired, once.';
  end if;
  if old.retired_at is not null then
    -- The one change allowed to a retired code: it stops being reserved.
    if new.retired_at is distinct from old.retired_at
      or (old.retired_by is not null and new.retired_by is distinct from old.retired_by)
      or old.retirement_reason = 'released' or new.retirement_reason is distinct from 'released' then
      raise exception using errcode = 'P0001', message = 'code_history',
        hint = 'A retired code can only be released.';
    end if;
    return new;
  end if;
  if new.retired_at is null then
    raise exception using errcode = 'P0001', message = 'code_history',
      hint = 'An issued code can only be retired, once.';
  end if;
  new.retired_at := now();
  update public.student_code_states
  set version = version + 1, current_assignment_id = null, updated_at = now()
  where annual_student_record_id = old.annual_student_record_id and current_assignment_id = old.id;
  if not found then
    raise exception using errcode = 'P0001', message = 'code_history', hint = 'Code state is out of step.';
  end if;
  return new;
end;
$$;

-- Retired codes, newest first: { rows: [{ id, code, studentName, levelId, reason, retiredAt }], total }.
-- Codes released by a change are not listed. Caller authority; RLS applies.
create or replace function public.list_retired_student_codes(
  p_academy_id uuid, p_search text, p_limit integer, p_offset integer
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  term text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  pattern text;
  result jsonb;
begin
  if auth.uid() is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if term is not null then
    pattern := '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  with matched as (
    select a.id, a.code, r.full_name, a.level_id, a.retirement_reason, a.retired_at
    from public.student_code_assignments a
    join public.annual_student_records r on r.id = a.annual_student_record_id and r.academy_id = a.academy_id
    where a.academy_id = p_academy_id
      and a.retired_at is not null
      and a.retirement_reason is distinct from 'released'
      and (pattern is null or a.code ilike pattern or r.full_name ilike pattern)
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'code', m.code, 'studentName', m.full_name, 'levelId', m.level_id,
        'reason', m.retirement_reason, 'retiredAt', m.retired_at
      ) order by m.retired_at desc, m.id)
      from (select * from matched order by retired_at desc, id limit p_limit offset p_offset) m
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Owner/Admin only. Returns { id }. A code that is current, already released, or in another
-- academy is reported as stale_code / not_found and nothing changes.
create or replace function public.unretire_student_code(p_academy_id uuid, p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment public.student_code_assignments%rowtype;
begin
  if auth.uid() is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null
    or public.academy_role_for(p_academy_id) not in ('owner', 'admin') then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  select a.* into assignment from public.student_code_assignments a
  where a.id = p_assignment_id and a.academy_id = p_academy_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  if assignment.retired_at is null or assignment.retirement_reason = 'released' then
    raise exception using errcode = 'P0001', message = 'stale_code';
  end if;
  -- Released rows record an actor; lifecycle retirements had none, so the unretiring staff member fills it.
  update public.student_code_assignments
  set retirement_reason = 'released', retired_by = coalesce(retired_by, auth.uid())
  where id = assignment.id;
  return jsonb_build_object('id', assignment.id);
end;
$$;

revoke all on function public.list_retired_student_codes(uuid, text, integer, integer) from public, anon;
grant execute on function public.list_retired_student_codes(uuid, text, integer, integer) to authenticated;
revoke all on function public.unretire_student_code(uuid, uuid) from public, anon;
grant execute on function public.unretire_student_code(uuid, uuid) to authenticated;
