-- Student codes: the current code of several records at once, for the students table.
--
-- Returns an object { "<annual record id>": "<current code>" } containing only records that
-- currently hold a code. Caller authority: RLS applies and every staff role can read it.

create or replace function public.get_student_codes(p_academy_id uuid, p_record_ids uuid[])
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_record_ids is null or cardinality(p_record_ids) > 200 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  return coalesce((
    select jsonb_object_agg(a.annual_student_record_id::text, a.code)
    from public.student_code_assignments a
    where a.academy_id = p_academy_id
      and a.annual_student_record_id = any(p_record_ids)
      and a.retired_at is null
  ), '{}'::jsonb);
end;
$$;

revoke all on function public.get_student_codes(uuid, uuid[]) from public, anon;
grant execute on function public.get_student_codes(uuid, uuid[]) to authenticated;
