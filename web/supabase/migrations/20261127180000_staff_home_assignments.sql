-- Adds assignment performance to the Home aggregate: the eight latest unarchived open-year
-- assignments with at least one marked student, each with the average marked percentage
-- (excused parts excluded), marked/recipient counts and how many marked students scored below half.
create or replace function public.staff_home(p_academy_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  y uuid; yr integer; role public.academy_role;
  wall timestamp := now() at time zone 'Africa/Cairo';
  result jsonb;
begin
  role := public.academy_role_for(p_academy_id);
  if auth.uid() is null or role is null then raise exception 'forbidden'; end if;
  select id,start_year into y,yr from public.academic_years where academy_id=p_academy_id and closed_at is null;
  with
  students as (
    select r.* from public.annual_student_records r where r.academy_id=p_academy_id and r.academic_year_id=y and r.archived_at is null
  ),
  levels as (
    select r.level_id, coalesce(g.name,r.level_id) as name, count(*) as total,
      count(*) filter(where r.participation_type='online_only') as online
    from students r left join public.global_levels g on g.id=r.level_id group by r.level_id,g.name
  ),
  attention as (
    select 'attendance'::text as kind,s.id,s.schedule_title as title,1::bigint as amount,sh.updated_at as at
    from public.attendance_sheets sh join public.sessions s on s.id=sh.session_id
    where sh.academy_id=p_academy_id and sh.academic_year_id=y and s.archived_at is null
      and s.state='ended' and sh.revision>coalesce(sh.published_revision,0)
    union all
    select 'review',u.id,u.draft->>'title',1,u.review_requested_at
    from public.content_units u join public.content_programs p on p.id=u.program_id
    where u.academy_id=p_academy_id and p.academic_year_id=y and u.state<>'archived'
      and (u.state='review' or u.review_requested_at is not null) and role in ('owner','head_admin','admin')
    union all
    select 'assignment',a.id,a.title,count(*),min(s.submitted_at)
    from public.assignment_online_submissions s join public.assignments a on a.id=s.assignment_id
    join students r on r.id=s.record_id
    where a.academy_id=p_academy_id and a.academic_year_id=y and a.state<>'archived'
      and exists (select 1 from public.assignment_parts p where p.assignment_id=a.id
        and not exists(select 1 from public.assignment_marks m where m.assignment_id=a.id and m.part_id=p.id and m.annual_student_record_id=s.record_id))
    group by a.id,a.title
  ),
  times as (
    select schedule_id,starts_at,ends_at from public.schedule_slots where academy_id=p_academy_id and academic_year_id=y and weekday=extract(isodow from wall)::integer
    union all
    select schedule_id,starts_at,ends_at from public.schedule_sessions where academy_id=p_academy_id and academic_year_id=y and occurs_on=wall::date
  ),
  today as (
    select s.id,s.title,s.location,t.starts_at,t.ends_at
    from times t join public.schedules s on s.id=t.schedule_id
    where s.academy_id=p_academy_id and s.academic_year_id=y and s.archived_at is null
    order by t.starts_at,s.id limit 12
  ),
  weeks as (
    select generate_series(date_trunc('week',wall)-interval '77 days',date_trunc('week',wall),interval '7 days')::date as week
  ),
  marks as (
    select date_trunc('week',s.started_at at time zone 'Africa/Cairo')::date as week,s.id as session_id,a.published_status as status
    from public.attendance_sheets sh join public.sessions s on s.id=sh.session_id
    join public.attendance_records a on a.session_id=s.id
    where sh.academy_id=p_academy_id and sh.academic_year_id=y and s.academy_id=p_academy_id and s.academic_year_id=y
      and s.archived_at is null and sh.publication_count>0 and a.published_status is not null
      and s.started_at>=(date_trunc('week',wall)-interval '77 days') at time zone 'Africa/Cairo'
  ),
  trend as (
    select w.week,count(distinct m.session_id) as sessions,
      count(m.status) filter(where m.status in ('present','late')) as attended,
      count(m.status) filter(where m.status in ('present','late','absent')) as counted,
      count(m.status) filter(where m.status='present') as present,count(m.status) filter(where m.status='late') as late,
      count(m.status) filter(where m.status='absent') as absent,count(m.status) filter(where m.status='excused') as excused,
      (select count(*) from students r where (r.created_at at time zone 'Africa/Cairo')::date>=w.week and (r.created_at at time zone 'Africa/Cairo')::date<w.week+7) as added
    from weeks w left join marks m on m.week=w.week group by w.week
  ),
  -- Students to watch: most official absences in the last 28 days, from finalized sheets only.
  watch as (
    select r.id,r.full_name as name,coalesce(g.name,r.level_id) as level,
      count(*) filter(where a.published_status='absent') as absent,
      count(*) filter(where a.published_status in ('present','late','absent')) as counted
    from students r
    join public.attendance_records a on a.annual_student_record_id=r.id and a.academy_id=p_academy_id and a.academic_year_id=y
    join public.attendance_sheets sh on sh.session_id=a.session_id and sh.publication_count>0
    join public.sessions s on s.id=a.session_id and s.archived_at is null and s.started_at>=now()-interval '28 days'
    left join public.global_levels g on g.id=r.level_id
    group by r.id,r.full_name,r.level_id,g.name
    having count(*) filter(where a.published_status='absent')>=2
    order by absent desc,counted desc,r.full_name,r.id limit 6
  ),
  -- Latest ended sessions; counts use the current sheet, flagged when not yet finalized.
  recent as (
    select s.id,s.schedule_title as title,s.started_at,
      coalesce(sh.publication_count>0 and sh.revision=sh.published_revision,false) as finalized,
      (select count(*) from public.attendance_records a where a.session_id=s.id and a.status in ('present','late')) as attended,
      (select count(*) from public.attendance_records a where a.session_id=s.id and a.status in ('present','late','absent')) as counted
    from public.sessions s left join public.attendance_sheets sh on sh.session_id=s.id
    where s.academy_id=p_academy_id and s.academic_year_id=y and s.archived_at is null and s.state='ended'
    order by s.started_at desc,s.id limit 6
  ),
  -- Per student and assignment: marked score over the maximum of marked parts; excused parts excluded.
  scored as (
    select m.assignment_id,m.annual_student_record_id as record_id,
      sum(m.score) filter(where m.kind='mark') as score,sum(p.max_score) filter(where m.kind='mark') as max
    from public.assignment_marks m
    join public.assignment_parts p on p.assignment_id=m.assignment_id and p.id=m.part_id
    join public.assignments a on a.id=m.assignment_id
    join students r on r.id=m.annual_student_record_id
    where m.academy_id=p_academy_id and a.academy_id=p_academy_id and a.academic_year_id=y and a.state<>'archived'
    group by m.assignment_id,m.annual_student_record_id
  ),
  performance as (
    select a.id,a.title,coalesce(a.due_at,a.created_at) as at,a.recipient_count as recipients,
      count(*) as marked,round(avg(s.score/s.max*100),1) as average,
      count(*) filter(where s.score/s.max<0.5) as below
    from public.assignments a join scored s on s.assignment_id=a.id and s.max>0
    where a.academy_id=p_academy_id and a.academic_year_id=y and a.state<>'archived'
    group by a.id,a.title,a.due_at,a.created_at,a.recipient_count
    order by at desc,a.id limit 8
  )
  select jsonb_build_object(
    'year',yr,'asOf',now(),
    'students',jsonb_build_object('total',(select count(*) from students),'online',(select count(*) from students where participation_type='online_only'),
      'levels',coalesce((select jsonb_agg(jsonb_build_object('id',level_id,'name',name,'total',total,'online',online) order by name) from levels),'[]'::jsonb)),
    'attention',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'id',id,'title',title,'amount',amount) order by at nulls last,id) from (select * from attention order by at nulls last,id limit 8) q),'[]'::jsonb),
    'attentionCount',(select count(*) from attention),
    'today',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'location',location,'startsAt',starts_at::text,'endsAt',ends_at::text) order by starts_at,id) from today),'[]'::jsonb),
    'attendance',(select jsonb_agg(jsonb_build_object('week',week::text,'sessions',sessions,'attended',attended,'counted',counted,
      'present',present,'late',late,'absent',absent,'excused',excused,'added',added) order by week) from trend),
    'watch',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'level',level,'absent',absent,'counted',counted) order by absent desc,counted desc,name,id) from watch),'[]'::jsonb),
    'recent',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'startedAt',started_at,'finalized',finalized,'attended',attended,'counted',counted) order by started_at desc,id) from recent),'[]'::jsonb),
    'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'at',at,'recipients',recipients,'marked',marked,'average',average,'below',below) order by at,id) from performance),'[]'::jsonb)
  ) into result;
  return result;
end $$;
