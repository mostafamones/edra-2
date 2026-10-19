begin;
-- Audience join rows have no `id` column. Read the common JSON representation so
-- deferred checks work for both assessment/group records and audience join rows.
create or replace function edra_private.content_group_coverage()
returns trigger language plpgsql security definer set search_path='' as $$
declare l record; row_data jsonb; changed jsonb:=to_jsonb(new); table_name text;
begin
  for l in select a.kind,a.assessment_id,u.program_id from public.content_assessments a join public.content_units u on u.id=a.unit_id
    where a.academy_id=(changed->>'academy_id')::uuid and (
      (TG_TABLE_NAME='groups' and (
        (a.kind='assignment' and exists(select 1 from public.assignment_audience_groups g where g.assignment_id=a.assessment_id and g.group_id=(changed->>'id')::uuid))
        or (a.kind='quiz' and exists(select 1 from public.quiz_audience_groups g where g.quiz_id=a.assessment_id and g.group_id=(changed->>'id')::uuid))
        or (a.kind='exam' and exists(select 1 from public.exam_audience_groups g where g.exam_id=a.assessment_id and g.group_id=(changed->>'id')::uuid))))
      or (TG_TABLE_NAME<>'groups' and (
        (a.kind='assignment' and a.assessment_id=coalesce((changed->>'assignment_id')::uuid,(changed->>'id')::uuid) and TG_TABLE_NAME in ('assignments','assignment_audience_groups'))
        or (a.kind='quiz' and a.assessment_id=coalesce((changed->>'quiz_id')::uuid,(changed->>'id')::uuid) and TG_TABLE_NAME in ('quizzes','quiz_audience_groups'))
        or (a.kind='exam' and a.assessment_id=coalesce((changed->>'exam_id')::uuid,(changed->>'id')::uuid) and TG_TABLE_NAME in ('exams','exam_audience_groups'))))) loop
    table_name:=case l.kind when 'assignment' then 'assignments' when 'quiz' then 'quizzes' else 'exams' end;
    execute format('select to_jsonb(a) from public.%I a where id=$1',table_name) into row_data using l.assessment_id;
    if row_data->>'archived_at' is null and coalesce(row_data->>'state','')<>'archived' then
      perform edra_private.content_assessment(l.program_id,l.kind,l.assessment_id);
    end if;
  end loop;
  return null;
end $$;
commit;
