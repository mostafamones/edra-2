-- Save preparation and availability in one transaction. Existing commands retain all role,
-- tenant, version, year, work/structure and availability guards. A window failure rolls back
-- the preparation edit as well. Invoker wrappers do not introduce privileged authority.

create function public.save_quiz_settings(
  p_academy_id uuid, p_quiz_id uuid, p_expected_version integer,
  p_draft jsonb, p_opens_at timestamptz, p_closes_at timestamptz
)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  edited jsonb;
begin
  edited := public.update_quiz(p_academy_id, p_quiz_id, p_expected_version, p_draft);
  return public.configure_quiz_availability(
    p_academy_id, p_quiz_id, (edited->>'version')::integer, p_opens_at, p_closes_at
  );
end;
$$;

revoke all on function public.save_quiz_settings(uuid, uuid, integer, jsonb, timestamptz, timestamptz) from public, anon;
grant execute on function public.save_quiz_settings(uuid, uuid, integer, jsonb, timestamptz, timestamptz) to authenticated;

create function public.save_exam_settings(
  p_academy_id uuid, p_exam_id uuid, p_expected_version integer,
  p_draft jsonb, p_opens_at timestamptz, p_closes_at timestamptz
)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  edited jsonb;
begin
  edited := public.update_exam(p_academy_id, p_exam_id, p_expected_version, p_draft);
  return public.configure_exam_availability(
    p_academy_id, p_exam_id, (edited->>'version')::integer, p_opens_at, p_closes_at
  );
end;
$$;

revoke all on function public.save_exam_settings(uuid, uuid, integer, jsonb, timestamptz, timestamptz) from public, anon;
grant execute on function public.save_exam_settings(uuid, uuid, integer, jsonb, timestamptz, timestamptz) to authenticated;
