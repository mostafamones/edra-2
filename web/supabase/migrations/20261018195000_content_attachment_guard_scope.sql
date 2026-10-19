begin;
create or replace function edra_private.content_assessment_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare l record; p public.content_programs;
begin
  for l in select * from public.content_assessments where kind=TG_ARGV[0] and assessment_id=old.id loop
    if TG_OP='DELETE' then raise exception 'attachment_locked'; end if;
    select * into strict p from public.content_programs where id=(select program_id from public.content_units where id=l.unit_id);
    if new.academy_id<>p.academy_id or new.academic_year_id<>p.academic_year_id then raise exception 'incompatible_assessment'; end if;
    -- Complete audience coverage is checked by deferred triggers after group rows are written.
  end loop;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
create or replace function edra_private.content_group_coverage()
returns trigger language plpgsql security definer set search_path='' as $$
declare l record; row_data jsonb; changed jsonb:=to_jsonb(new); table_name text;
begin
  for l in select a.kind,a.assessment_id,u.program_id from public.content_assessments a join public.content_units u on u.id=a.unit_id
    where a.academy_id=new.academy_id and (
      (TG_TABLE_NAME='groups' and (
        (a.kind='assignment' and exists(select 1 from public.assignment_audience_groups g where g.assignment_id=a.assessment_id and g.group_id=new.id))
        or (a.kind='quiz' and exists(select 1 from public.quiz_audience_groups g where g.quiz_id=a.assessment_id and g.group_id=new.id))
        or (a.kind='exam' and exists(select 1 from public.exam_audience_groups g where g.exam_id=a.assessment_id and g.group_id=new.id))))
      or (TG_TABLE_NAME<>'groups' and (
        (a.kind='assignment' and a.assessment_id=coalesce((changed->>'assignment_id')::uuid,(changed->>'id')::uuid) and TG_TABLE_NAME in ('assignments','assignment_audience_groups'))
        or (a.kind='quiz' and a.assessment_id=coalesce((changed->>'quiz_id')::uuid,(changed->>'id')::uuid) and TG_TABLE_NAME in ('quizzes','quiz_audience_groups'))
        or (a.kind='exam' and a.assessment_id=coalesce((changed->>'exam_id')::uuid,(changed->>'id')::uuid) and TG_TABLE_NAME in ('exams','exam_audience_groups'))))) loop
    table_name:=case l.kind when 'assignment' then 'assignments' when 'quiz' then 'quizzes' else 'exams' end;
    execute format('select to_jsonb(a) from public.%I a where id=$1',table_name) into row_data using l.assessment_id;
    -- Archival preserves attachment/history; it must not prevent unrelated live group edits.
    if row_data->>'archived_at' is null and coalesce(row_data->>'state','')<>'archived' then
      perform edra_private.content_assessment(l.program_id,l.kind,l.assessment_id);
    end if;
  end loop;
  return null;
end $$;
create constraint trigger content_assignment_coverage after update on public.assignments deferrable initially deferred for each row execute function edra_private.content_group_coverage();
create constraint trigger content_quiz_coverage after update on public.quizzes deferrable initially deferred for each row execute function edra_private.content_group_coverage();
create constraint trigger content_exam_coverage after update on public.exams deferrable initially deferred for each row execute function edra_private.content_group_coverage();
commit;
