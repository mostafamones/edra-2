-- Adds an eight-week attendance series to the Home aggregate. Only finalized (published) sheets of
-- unarchived sessions in the open year count; excused and unknown are excluded from the rate base.
-- Weeks are ISO weeks in Cairo time; weeks without finalized sessions are returned with zero counts.
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
    select generate_series(date_trunc('week',wall)-interval '49 days',date_trunc('week',wall),interval '7 days')::date as week
  ),
  marks as (
    select date_trunc('week',s.started_at at time zone 'Africa/Cairo')::date as week,s.id as session_id,a.published_status as status
    from public.attendance_sheets sh join public.sessions s on s.id=sh.session_id
    join public.attendance_records a on a.session_id=s.id
    where sh.academy_id=p_academy_id and sh.academic_year_id=y and s.academy_id=p_academy_id and s.academic_year_id=y
      and s.archived_at is null and sh.publication_count>0 and a.published_status is not null
      and s.started_at>=(date_trunc('week',wall)-interval '49 days') at time zone 'Africa/Cairo'
  ),
  trend as (
    select w.week,count(distinct m.session_id) as sessions,
      count(m.status) filter(where m.status in ('present','late')) as attended,
      count(m.status) filter(where m.status in ('present','late','absent')) as counted
    from weeks w left join marks m on m.week=w.week group by w.week
  )
  select jsonb_build_object(
    'year',yr,'asOf',now(),
    'students',jsonb_build_object('total',(select count(*) from students),'online',(select count(*) from students where participation_type='online_only'),
      'levels',coalesce((select jsonb_agg(jsonb_build_object('id',level_id,'name',name,'total',total,'online',online) order by name) from levels),'[]'::jsonb)),
    'attention',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'id',id,'title',title,'amount',amount) order by at nulls last,id) from (select * from attention order by at nulls last,id limit 8) q),'[]'::jsonb),
    'attentionCount',(select count(*) from attention),
    'today',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'location',location,'startsAt',starts_at::text,'endsAt',ends_at::text) order by starts_at,id) from today),'[]'::jsonb),
    'attendance',(select jsonb_agg(jsonb_build_object('week',week::text,'sessions',sessions,'attended',attended,'counted',counted) order by week) from trend)
  ) into result;
  return result;
end $$;
