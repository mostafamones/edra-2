-- Quizzes, slice 3: the deadline worker.
--
-- Every command and staff read already settles due work before acting, so correctness never waits
-- for this worker: a late save cannot cross a cutoff and results are reconciled on read. The worker
-- makes deadlines take effect for disconnected students (timer and window_closed submissions,
-- automatic announcements, solution qualification) without anyone opening the quiz.
--
-- Supabase Cron (pg_cron) runs edra_private.run_quiz_deadlines every 30 seconds. Each run settles at
-- most p_limit quizzes in bounded, indexed batches; each quiz settles in its own subtransaction, so
-- one failure is recorded and the rest continue (the failed quiz is retried next run). Each run is
-- recorded in edra_private.quiz_deadline_runs with its counts, the largest lag between an effective
-- cutoff and its processing, and any error. Execution is not exact wall-clock: submissions keep the
-- effective cutoff (submitted_at) separately from the processing time (processed_at).
--
-- Monitoring (service role / SQL editor):
--   select * from edra_private.quiz_deadline_runs order by started_at desc limit 20;
--   select * from edra_private.quiz_deadline_health();
--   select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'edra-quiz-deadlines')
--     order by start_time desc limit 20;

create extension if not exists pg_cron;

create table edra_private.quiz_deadline_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  quizzes integer not null default 0,
  attempts integer not null default 0,
  failures integer not null default 0,
  -- Largest (processed_at - submitted_at) among deadline submissions settled by this run.
  max_lag_seconds numeric,
  -- The last failure's message (one row per run; failed quizzes are retried next run).
  error text
);

create index quiz_deadline_runs_started_idx on edra_private.quiz_deadline_runs (started_at desc);
alter table edra_private.quiz_deadline_runs enable row level security;
revoke all on edra_private.quiz_deadline_runs from public, anon, authenticated;

-- Settles up to p_limit quizzes with due work in open years. Returns the number of attempts settled.
create or replace function edra_private.run_quiz_deadlines(p_limit integer default 50)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  run_started timestamptz := clock_timestamp();
  due record;
  quiz_count integer := 0;
  attempt_count integer := 0;
  failure_count integer := 0;
  last_error text;
  lag numeric;
begin
  for due in
    select candidates.quiz_id from (
      select z.id as quiz_id, z.actual_closes_at as due_at from public.quizzes z
      where z.actual_closes_at <= clock_timestamp() and not exists (select 1 from public.quiz_closures c where c.quiz_id = z.id)
      union all
      select a.quiz_id, least(a.deadline_at, z.actual_closes_at) from public.quiz_attempts a
      join public.quizzes z on z.id = a.quiz_id
      where a.finalized_at is null and a.superseded_at is null and least(a.deadline_at, z.actual_closes_at) <= clock_timestamp()
    ) candidates
    join public.quizzes z on z.id = candidates.quiz_id
    join public.academic_years y on y.id = z.academic_year_id and y.closed_at is null
    group by candidates.quiz_id
    order by min(candidates.due_at), candidates.quiz_id
    limit greatest(coalesce(p_limit, 50), 1)
  loop
    begin
      attempt_count := attempt_count + edra_private.settle_quiz_closure(due.quiz_id);
      quiz_count := quiz_count + 1;
    exception when others then
      failure_count := failure_count + 1;
      last_error := due.quiz_id::text || ': ' || sqlerrm;
    end;
  end loop;
  select max(extract(epoch from s.processed_at - s.submitted_at)) into lag
  from public.quiz_submissions s
  where s.processed_at >= run_started and s.source = 'online' and s.reason in ('timer', 'window_closed');
  insert into edra_private.quiz_deadline_runs (started_at, finished_at, quizzes, attempts, failures, max_lag_seconds, error)
  values (run_started, clock_timestamp(), quiz_count, attempt_count, failure_count, lag, last_error);
  -- Keep a week of run history.
  delete from edra_private.quiz_deadline_runs where started_at < run_started - interval '7 days';
  return attempt_count;
end;
$$;

-- Health summary: last run, failures in the last hour, and the oldest overdue item now (a growing
-- backlog means the worker is not running or keeps failing).
create or replace function edra_private.quiz_deadline_health()
returns table (last_run_at timestamptz, runs_last_hour integer, failures_last_hour integer, max_lag_seconds_last_hour numeric, oldest_overdue_seconds numeric)
language sql stable security definer set search_path = '' as $$
  select
    (select max(r.finished_at) from edra_private.quiz_deadline_runs r),
    (select count(*)::integer from edra_private.quiz_deadline_runs r where r.started_at > clock_timestamp() - interval '1 hour'),
    (select coalesce(sum(r.failures), 0)::integer from edra_private.quiz_deadline_runs r where r.started_at > clock_timestamp() - interval '1 hour'),
    (select max(r.max_lag_seconds) from edra_private.quiz_deadline_runs r where r.started_at > clock_timestamp() - interval '1 hour'),
    (select max(extract(epoch from clock_timestamp() - least(a.deadline_at, z.actual_closes_at)))
      from public.quiz_attempts a join public.quizzes z on z.id = a.quiz_id
      join public.academic_years y on y.id = z.academic_year_id and y.closed_at is null
      where a.finalized_at is null and a.superseded_at is null and least(a.deadline_at, z.actual_closes_at) <= clock_timestamp());
$$;

revoke all on function edra_private.run_quiz_deadlines(integer) from public, anon, authenticated;
revoke all on function edra_private.quiz_deadline_health() from public, anon, authenticated;

-- Re-scheduling with the same name replaces the job, so this is safe to re-run.
select cron.schedule('edra-quiz-deadlines', '30 seconds', 'select edra_private.run_quiz_deadlines(50)');
