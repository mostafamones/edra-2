-- The attendance sheet also carries each student's current code while the academy has student codes
-- enabled, so the check-in combobox can show and search it. Codes stay null when disabled.
create or replace function public.get_attendance(p_academy_id uuid, p_session_id uuid)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', s.id, 'academy_id', s.academy_id, 'academic_year_id', s.academic_year_id,
      'schedule_title', s.schedule_title, 'group_name', s.group_name, 'mandatory', s.mandatory,
      'location', s.location, 'started_at', s.started_at, 'auto_end_at', s.auto_end_at,
      'state', case when s.state = 'live' and s.auto_end_at <= now() then 'ended' else s.state::text end,
      'ended_at', case when s.state = 'live' and s.auto_end_at <= now() then s.auto_end_at else s.ended_at end,
      'year_open', exists (select 1 from public.academic_years y where y.id = s.academic_year_id and y.closed_at is null)
    ),
    'student_codes_enabled', coalesce((select c.enabled from public.student_code_settings c where c.academy_id = s.academy_id), false),
    'revision', coalesce(sh.revision, 0),
    'published_revision', sh.published_revision,
    'publication_count', coalesce(sh.publication_count, 0),
    'last_published_at', sh.last_published_at,
    'last_published_by_name', sh.last_published_by_name,
    'entries', coalesce((
      select jsonb_agg(e order by lower(e->>'full_name'), e->>'annual_student_record_id')
      from (
        select jsonb_build_object(
          'annual_student_record_id', en.annual_student_record_id,
          'full_name', r.full_name,
          'student_code', (
            select sa.code from public.student_code_assignments sa
            where sa.annual_student_record_id = en.annual_student_record_id and sa.retired_at is null
              and exists (select 1 from public.student_code_settings c where c.academy_id = s.academy_id and c.enabled)
          ),
          'archived', r.archived_at is not null,
          'origin', en.origin,
          'group_name', g.name,
          'status', coalesce(a.status, 'unknown'),
          'version', coalesce(a.version, 0),
          'source', a.source,
          'updated_at', a.updated_at,
          'updated_by', a.updated_by,
          'updated_by_name', a.updated_by_name,
          'checked_in_at', a.checked_in_at,
          'published_status', a.published_status,
          'published_at', a.published_at
        ) as e
        from public.session_roster_entries en
        join public.annual_student_records r on r.id = en.annual_student_record_id
        left join public.groups g on g.id = en.primary_group_id
        left join public.attendance_records a
          on a.session_id = en.session_id and a.annual_student_record_id = en.annual_student_record_id
        where en.session_id = s.id
      ) x
    ), '[]'::jsonb)
  )
  from public.sessions s
  left join public.attendance_sheets sh on sh.session_id = s.id
  where s.id = p_session_id and s.academy_id = p_academy_id;
$$;
