-- Executes due publication schedules without a browser.
--
-- Supabase Cron (pg_cron) runs edra_private.run_content_publications every 30 seconds. Each run takes at
-- most p_limit due schedules, each in its own subtransaction, so one failing unit is recorded and the rest
-- continue. A unit whose row is locked by a command is skipped and picked up next run; every command takes
-- that same lock, so the worker never interleaves with confirmation, cancellation or Publish now.
--
-- Transient database errors retry with backoff, up to 8 attempts. Authority and validation failures stop
-- the schedule with a recorded reason. Execution is not exact wall-clock: scheduled_for stays separate
-- from content_revisions.published_at, and each run records the largest lag.
--
-- Monitoring (service role / SQL editor):
--   select * from edra_private.content_publication_runs order by started_at desc limit 20;
--   select * from edra_private.content_publication_health();
--   select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'edra-content-publication')
--     order by start_time desc limit 20;

create extension if not exists pg_cron;

create table edra_private.content_publication_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  published integer not null default 0,
  retried integer not null default 0,
  stopped integer not null default 0,
  -- Largest (publication - scheduled time) among this run's publications.
  max_lag_seconds numeric,
  -- The last failure's message; schedules only keep its code.
  error text
);

create index content_publication_runs_started_idx on edra_private.content_publication_runs (started_at desc);
alter table edra_private.content_publication_runs enable row level security;
revoke all on edra_private.content_publication_runs from public, anon, authenticated;

-- Publishes one due schedule, or returns why it did not. Raises to stop or retry it.
create function edra_private.execute_content_publication(p_unit uuid, p_generation integer)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  u public.content_units;
  s public.content_publication_schedules;
  c public.content_publication_candidates;
  new_revision integer;
begin
  select * into u from public.content_units where id = p_unit for update skip locked;
  if not found then return 'busy'; end if;
  select * into s from public.content_publication_schedules where unit_id = p_unit for update;
  if not found or s.state <> 'pending' or s.generation <> p_generation or s.next_attempt_at > clock_timestamp() then return 'skipped'; end if;
  perform 1 from public.academy_memberships
    where academy_id = u.academy_id and user_id = s.scheduled_by and suspended_at is null and role in ('owner', 'head_admin', 'admin') for share;
  if not found then raise exception 'scheduler_authority_lost'; end if;
  if u.state = 'archived' then raise exception 'archived'; end if;
  perform 1 from public.content_programs p join public.academic_years y on y.id = p.academic_year_id
    where p.id = u.program_id and y.closed_at is null for share of y;
  if not found then raise exception 'year_closed'; end if;
  c := edra_private.content_latest_candidate(u.id, u.published_revision);
  if c.id is null then raise exception 'confirmation_required'; end if;

  new_revision := edra_private.content_publish(u, c.document, s.scheduled_by, c.id);
  -- The working draft and its version stay as they are, so editors keep their place. A newer draft stays in review.
  update public.content_units set state = 'published', published_version = c.unit_version, updated_at = now(),
    review_requested_at = case when u.version = c.unit_version then null
      when u.state = 'review' then coalesce(review_requested_at, now()) else review_requested_at end
    where id = u.id;
  update public.content_publication_schedules set state = 'published', generation = generation + 1, next_attempt_at = null,
    attempts = attempts + 1, last_attempt_at = clock_timestamp(), reason = null, candidate_id = c.id, published_revision = new_revision, updated_at = clock_timestamp()
    where unit_id = p_unit;
  insert into public.content_publication_events (academy_id, unit_id, generation, kind, actor_id, candidate_id, revision, scheduled_for)
    values (u.academy_id, u.id, s.generation, 'published', s.scheduled_by, c.id, new_revision, s.scheduled_for);
  -- Deferred audience triggers must fail inside this unit's subtransaction, not at the run's commit.
  set constraints all immediate;
  return 'published';
end;
$$;

-- Records a failed attempt. Runs after the attempt rolled back, so it rechecks the generation itself.
create function edra_private.content_publication_failed(p_unit uuid, p_generation integer, p_sqlstate text, p_message text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  s public.content_publication_schedules;
  transient boolean := left(p_sqlstate, 2) in ('08', '40', '53', '55', '57', '58', 'XX');
  code text := case when p_sqlstate = 'P0001' then left(p_message, 100) else 'publication_failed' end;
begin
  update public.content_publication_schedules set attempts = attempts + 1, last_attempt_at = clock_timestamp(), updated_at = clock_timestamp()
    where unit_id = p_unit and generation = p_generation and state = 'pending' returning * into s;
  if not found then return 'skipped'; end if;
  if transient and s.attempts < 8 then
    update public.content_publication_schedules
      set next_attempt_at = clock_timestamp() + least(interval '1 minute' * power(2, s.attempts - 1), interval '1 hour'), reason = 'publication_retrying'
      where unit_id = p_unit;
    insert into public.content_publication_events (academy_id, unit_id, generation, kind, scheduled_for, reason)
      values (s.academy_id, s.unit_id, s.generation, 'retrying', s.scheduled_for, p_sqlstate);
    return 'retried';
  end if;
  perform edra_private.content_schedule_end(p_unit, 'stopped', case when transient then 'retries_exhausted' else code end, null);
  return 'stopped';
end;
$$;

create function edra_private.run_content_publications(p_limit integer default 25)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  run_started timestamptz := clock_timestamp();
  due record;
  outcome text;
  sql_state text;
  err_message text;
  published_count integer := 0;
  retried_count integer := 0;
  stopped_count integer := 0;
  max_lag numeric;
  last_error text;
begin
  -- The barrier before any domain lock, waited for ahead of the lock timeout below.
  perform edra_private.offering_gate();
  -- A waiting lock becomes a transient failure rather than holding the rest of the run.
  perform set_config('lock_timeout', '5s', true);
  for due in
    select s.unit_id, s.generation, s.scheduled_for from public.content_publication_schedules s
    where s.state = 'pending' and s.next_attempt_at <= clock_timestamp()
    order by s.next_attempt_at, s.unit_id
    limit greatest(coalesce(p_limit, 25), 1)
  loop
    begin
      outcome := edra_private.execute_content_publication(due.unit_id, due.generation);
      if outcome = 'published' then
        published_count := published_count + 1;
        max_lag := greatest(max_lag, extract(epoch from clock_timestamp() - due.scheduled_for));
      end if;
    exception when others then
      get stacked diagnostics sql_state = returned_sqlstate, err_message = message_text;
      last_error := due.unit_id::text || ': ' || err_message;
      begin
        outcome := edra_private.content_publication_failed(due.unit_id, due.generation, sql_state, err_message);
        if outcome = 'retried' then retried_count := retried_count + 1;
        elsif outcome = 'stopped' then stopped_count := stopped_count + 1; end if;
      exception when others then
        -- The schedule stays due, so the next run tries again.
        get stacked diagnostics err_message = message_text;
        last_error := due.unit_id::text || ': ' || err_message;
      end;
    end;
  end loop;
  insert into edra_private.content_publication_runs (started_at, finished_at, published, retried, stopped, max_lag_seconds, error)
    values (run_started, clock_timestamp(), published_count, retried_count, stopped_count, max_lag, last_error);
  -- Keep a week of run history.
  delete from edra_private.content_publication_runs where started_at < run_started - interval '7 days';
  return published_count;
end;
$$;

-- Health summary: last run, recent outcomes, and the oldest overdue schedule now (a growing backlog means
-- the worker is not running or keeps retrying).
create function edra_private.content_publication_health()
returns table (last_run_at timestamptz, runs_last_hour integer, published_last_hour integer, retried_last_hour integer, stopped_last_hour integer, max_lag_seconds_last_hour numeric, oldest_overdue_seconds numeric)
language sql stable security definer set search_path = '' as $$
  select
    (select max(r.finished_at) from edra_private.content_publication_runs r),
    (select count(*)::integer from edra_private.content_publication_runs r where r.started_at > clock_timestamp() - interval '1 hour'),
    (select coalesce(sum(r.published), 0)::integer from edra_private.content_publication_runs r where r.started_at > clock_timestamp() - interval '1 hour'),
    (select coalesce(sum(r.retried), 0)::integer from edra_private.content_publication_runs r where r.started_at > clock_timestamp() - interval '1 hour'),
    (select coalesce(sum(r.stopped), 0)::integer from edra_private.content_publication_runs r where r.started_at > clock_timestamp() - interval '1 hour'),
    (select max(r.max_lag_seconds) from edra_private.content_publication_runs r where r.started_at > clock_timestamp() - interval '1 hour'),
    (select max(extract(epoch from clock_timestamp() - s.scheduled_for)) from public.content_publication_schedules s
      where s.state = 'pending' and s.scheduled_for <= clock_timestamp());
$$;

revoke all on function edra_private.execute_content_publication(uuid, integer) from public, anon, authenticated;
revoke all on function edra_private.content_publication_failed(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function edra_private.run_content_publications(integer) from public, anon, authenticated;
revoke all on function edra_private.content_publication_health() from public, anon, authenticated;

-- Re-scheduling with the same name replaces the job, so this is safe to re-run.
select cron.schedule('edra-content-publication', '30 seconds', 'select edra_private.run_content_publications(25)');
