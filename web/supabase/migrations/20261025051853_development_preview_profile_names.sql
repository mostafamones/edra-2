-- Keep registry identity/roles authoritative, but display current staff profile names.
create or replace function public.dev_run_targets(p_run_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'staff', coalesce((select jsonb_agg(jsonb_build_object(
        'logical_id', a.logical_id, 'role', a.kind,
        'display_name', coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''), a.display_name))
        order by array_position(array['owner', 'head_admin', 'admin', 'instructor'], a.kind), a.logical_id)
      from edra_private.dev_accounts a left join public.profiles p on p.id = a.user_id
      where a.run_id = p_run_id and a.kind <> 'student' and a.state = 'loaded'), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(jsonb_build_object('logical_id', a.logical_id, 'display_name', a.display_name,
        'annual_student_record_id', a.annual_student_record_id) order by a.logical_id)
      from edra_private.dev_accounts a where a.run_id = p_run_id and a.kind = 'student' and a.state = 'loaded'), '[]'::jsonb)
  )
  from edra_private.dev_runs r where r.id = p_run_id and r.state = 'ready';
$$;

revoke all on function public.dev_run_targets(uuid) from public, anon, authenticated;
grant execute on function public.dev_run_targets(uuid) to service_role;
