begin;
-- Use the same compatibility authority as save/publication rather than a second
-- approximation of level, track and group audience rules in the browser.
create function public.content_assessment_options(p_academy_id uuid,p_unit_id uuid,p_offset integer default 0,p_limit integer default 100)
returns table(kind text,id uuid,title text)
language plpgsql security definer set search_path='' as $$
declare unit public.content_units; program public.content_programs; candidate record; eligible integer:=0; emitted integer:=0;
begin
  perform edra_private.content_actor(p_academy_id);
  if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 200 then raise exception 'validation'; end if;
  select * into unit from public.content_units u where u.id=p_unit_id and u.academy_id=p_academy_id;
  if not found then raise exception 'not_found'; end if;
  select * into strict program from public.content_programs p where p.id=unit.program_id;
  for candidate in
    select c.* from (
      select 'assignment'::text as kind,a.id,a.title from public.assignments a
        where a.academy_id=p_academy_id and a.academic_year_id=program.academic_year_id and a.state<>'archived'
      union all
      select 'quiz',q.id,q.title from public.quizzes q
        where q.academy_id=p_academy_id and q.academic_year_id=program.academic_year_id and q.archived_at is null
      union all
      select 'exam',e.id,e.title from public.exams e
        where e.academy_id=p_academy_id and e.academic_year_id=program.academic_year_id and e.archived_at is null
    ) c where not exists(select 1 from public.content_assessments a where a.kind=c.kind and a.assessment_id=c.id)
    order by lower(c.title),c.kind,c.id
  loop
    begin
      perform edra_private.content_assessment(program.id,candidate.kind,candidate.id);
    exception when raise_exception then
      if sqlerrm='incompatible_assessment' then continue; end if;
      raise;
    end;
    if eligible>=p_offset then
      kind:=candidate.kind; id:=candidate.id; title:=candidate.title;
      return next;
      emitted:=emitted+1;
    end if;
    eligible:=eligible+1;
    exit when emitted>=p_limit;
  end loop;
end $$;
revoke all on function public.content_assessment_options(uuid,uuid,integer,integer) from public,anon;
grant execute on function public.content_assessment_options(uuid,uuid,integer,integer) to authenticated;
commit;
