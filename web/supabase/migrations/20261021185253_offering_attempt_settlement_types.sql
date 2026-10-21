-- Lifecycle helpers accept named assessment composites, not anonymous loop records.
begin;

create or replace function edra_private.stop_offering_level(p_academy uuid,p_level text,p_change jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare y uuid; z record; a record; impact jsonb; at timestamptz;
  target_exam public.exams%rowtype; target_quiz public.quizzes%rowtype;
begin
  perform 1 from public.academy_levels where academy_id=p_academy and level_id=p_level and stopped_at is null for update;
  if not found then raise exception 'not_found'; end if;
  select id into y from public.academic_years where academy_id=p_academy and closed_at is null for share;
  -- Settle only already-due work through the existing domain logic. A blocked result returns
  -- normally so this legitimate lifecycle work commits; no shutdown changes have happened yet.
  for target_exam in select e.* from public.exams e where e.academy_id=p_academy and e.academic_year_id=y
    and p_level in (select edra_private.assessment_levels('exam',e.id)) order by e.id for update loop
    for a in select annual_student_record_id from public.exam_attempts where exam_id=target_exam.id
      and finalized_at is null and superseded_at is null order by annual_student_record_id loop
      perform edra_private.settle_exam_record(target_exam,a.annual_student_record_id);
    end loop;
    perform edra_private.settle_exam_closure(target_exam.id);
  end loop;
  for target_quiz in select q.* from public.quizzes q where q.academy_id=p_academy and q.academic_year_id=y
    and p_level in (select edra_private.assessment_levels('quiz',q.id)) order by q.id for update loop
    for a in select annual_student_record_id from public.quiz_attempts where quiz_id=target_quiz.id
      and finalized_at is null and superseded_at is null order by annual_student_record_id loop
      perform edra_private.settle_quiz_record(target_quiz,a.annual_student_record_id);
    end loop;
    perform edra_private.settle_quiz_closure(target_quiz.id);
  end loop;
  impact:=edra_private.offering_impact(p_academy,p_change);
  if impact->'blockers'<>'{}'::jsonb then return jsonb_build_object('outcome','blocked','preview',impact); end if;
  at:=clock_timestamp();
  insert into edra_private.offering_transitions(transaction_id,academy_id,level_id,operation)
    values(pg_current_xact_id(),p_academy,p_level,'stop_level');
  -- No row in a closed year is selected, and already archived records keep their archive facts.
  update public.schedules s set archived_at=at where s.academy_id=p_academy and s.academic_year_id=y
    and s.archived_at is null and (s.level_id=p_level or exists(select 1 from public.groups g where g.id=s.group_id and g.level_id=p_level));
  update public.annual_student_records set archived_at=at where academy_id=p_academy and academic_year_id=y and level_id=p_level and archived_at is null;
  update public.groups set archived_at=at where academy_id=p_academy and academic_year_id=y and level_id=p_level and archived_at is null;
  update public.assignments a set state='closed',closed_at=at,closed_by=auth.uid(),offering_closed_at=at,
    version=version+1,updated_at=at,updated_by=auth.uid()
    where a.academy_id=p_academy and a.academic_year_id=y and a.state='active'
      and p_level in (select edra_private.assessment_levels('assignment',a.id));
  update public.exams e set offering_closed_at=at,version=version+1,updated_at=at,updated_by=auth.uid()
    where e.academy_id=p_academy and e.academic_year_id=y and e.archived_at is null and e.offering_closed_at is null
      and (e.actual_closes_at is null or e.actual_closes_at>at)
      and (select array_agg(l) from edra_private.assessment_levels('exam',e.id) l)=array[p_level];
  update public.quizzes q set offering_closed_at=at,version=version+1,updated_at=at,updated_by=auth.uid()
    where q.academy_id=p_academy and q.academic_year_id=y and q.archived_at is null and q.offering_closed_at is null
      and (q.actual_closes_at is null or q.actual_closes_at>at)
      and (select array_agg(l) from edra_private.assessment_levels('quiz',q.id) l)=array[p_level];
  update public.content_units u set version=version+1,updated_at=at from public.content_programs p
    where u.program_id=p.id and p.academy_id=p_academy and p.academic_year_id=y and p.level_id=p_level and u.state<>'archived';
  update public.academy_levels set stopped_at=at,stopped_by=auth.uid(),last_stopped_at=at,last_stopped_by=auth.uid(),
    learning_epoch=learning_epoch+1,version=version+1 where academy_id=p_academy and level_id=p_level;
  for z in select id from public.exams where academy_id=p_academy and academic_year_id=y and offering_closed_at=at order by id loop
    perform edra_private.settle_exam_closure(z.id);
  end loop;
  for z in select id from public.quizzes where academy_id=p_academy and academic_year_id=y and offering_closed_at=at order by id loop
    perform edra_private.settle_quiz_closure(z.id);
  end loop;
  delete from edra_private.offering_transitions where transaction_id=pg_current_xact_id() and academy_id=p_academy;
  return null;
end $$;


commit;
